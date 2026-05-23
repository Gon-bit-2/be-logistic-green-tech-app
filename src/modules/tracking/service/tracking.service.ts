import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common'
import { TrackingRepository } from '../repository/tracking.repo'
import { CreateTrackingEventType } from '../model/tracking.model'
import { PrismaService } from 'src/database/prisma.service'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { EVENT_SOURCE, TRACKING_EVENT_TYPE, MAX_DELIVERY_ATTEMPTS } from 'src/common/constants/tracking.constant'
import { GREEN_TECH_QUEUE_NAME, CALCULATE_EMISSION_JOB_NAME } from 'src/common/constants/queue.constant'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import roleName from 'src/common/constants/role.constant'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import { OrderStateService } from 'src/common/services/order-state.service'
import { TrackingAccessService } from './tracking-access.service'

/**
 * Service managing package tracking operations and history.
 * Handles tracking event registration, state machine validations, public/authenticated timeline queries,
 * and automatically transitions trips and triggers green-tech emissions calculation when all orders are delivered.
 *
 * Dịch vụ quản lý các hoạt động theo dõi đơn hàng và lịch sử hành trình.
 * Xử lý đăng ký sự kiện định vị, xác thực máy trạng thái, truy vấn dòng thời gian công khai/đã xác thực,
 * và tự động hoàn thành chuyến đi cùng kích hoạt tính toán khí thải green-tech khi tất cả đơn hàng đã được giao.
 */
@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name)

  constructor(
    private readonly trackingRepo: TrackingRepository,
    private readonly prismaService: PrismaService,
    @InjectQueue(GREEN_TECH_QUEUE_NAME) private readonly greenTechQueue: Queue,
    private readonly orderStateService: OrderStateService,
    private readonly trackingAccessService: TrackingAccessService,
  ) {}

  /**
   * Registers a new tracking event for a specific package.
   * Validates access permissions, delivery failure attempts, updates order states,
   * processes COD collections, and triggers trip completions.
   *
   * Ghi nhận một sự kiện định vị mới cho một gói hàng cụ thể.
   * Xác thực quyền truy cập, số lần giao hàng thất bại, cập nhật trạng thái đơn hàng,
   * xử lý thu hộ COD và kích hoạt hoàn thành chuyến đi.
   *
   * @param actor The token payload of the user creating the event.
   *              Thông tin token của người dùng tạo sự kiện.
   * @param payload The data transfer object containing event type, status, and metadata.
   *                Đối tượng truyền dữ liệu chứa loại sự kiện, trạng thái và siêu dữ liệu.
   * @returns A promise resolving to the created tracking event entity.
   *          Một promise trả về thực thể sự kiện định vị đã tạo.
   * @throws {NotFoundException} If the order does not exist.
   *                             Nếu đơn hàng không tồn tại.
   * @throws {BadRequestException} If failed delivery attempts exceed the maximum allowed threshold.
   *                               Nếu số lần giao hàng thất bại vượt quá ngưỡng tối đa cho phép.
   * @throws {ForbiddenException} If COD collection is triggered by a non-driver user.
   *                              Nếu thu hộ COD được thực hiện bởi người dùng không phải tài xế.
   */
  async createEvent(actor: AccessTokenPayload, payload: CreateTrackingEventType) {
    const createdById = actor.userId
    // 1. Kiểm tra Order tồn tại và lấy trạng thái hiện tại
    const order = await this.prismaService.order.findFirst({
      where: { id: payload.orderId, deletedAt: null },
      select: {
        id: true,
        status: true,
        trackingCode: true,
        currentTripId: true,
        currentHubId: true,
        customerId: true,
        isCodCollected: true,
        payment: {
          select: {
            amount: true,
            method: true,
            status: true,
          },
        },
      },
    })

    if (!order) {
      throw new NotFoundException(`Đơn hàng #${payload.orderId} không tồn tại`)
    }

    await this.trackingAccessService.assertCanCreateTrackingEvent(actor, payload.orderId)

    // 3. Nếu là EXCEPTION (giao thất bại) → kiểm tra số lần đã fail
    if (payload.eventType === TRACKING_EVENT_TYPE.EXCEPTION) {
      const failedCount = await this.trackingRepo.countFailedAttempts(payload.orderId)

      if (failedCount >= MAX_DELIVERY_ATTEMPTS) {
        throw new BadRequestException(
          `Đơn hàng #${payload.orderId} đã vượt quá ${MAX_DELIVERY_ATTEMPTS} lần giao thất bại. Cần chuyển hoàn hàng.`,
        )
      }

      this.logger.warn(
        `[TRACKING] Order #${payload.orderId}: Giao thất bại lần ${failedCount + 1}/${MAX_DELIVERY_ATTEMPTS} | Lý do: ${payload.failureReasonCode}`,
      )
    }

    if (payload.eventType === TRACKING_EVENT_TYPE.STATUS_CHANGE && payload.status) {
      this.logger.log(
        `[TRACKING] Order #${payload.orderId}: ${order.status} → ${payload.status} | by User #${createdById}`,
      )

      const shouldCollectCodOnDelivery =
        payload.status === ORDER_STATUS.DELIVERED &&
        order.payment?.method === 'COD' &&
        order.payment.status !== 'COMPLETED' &&
        !order.isCodCollected

      if (shouldCollectCodOnDelivery && actor.roleName !== roleName.DRIVER) {
        throw new ForbiddenException('Error.PermissionDenied.CodCollectionRequiresDriver')
      }

      const result = await this.orderStateService.transitionOrderStatus({
        attemptNumber: payload.attemptNumber ?? null,
        codCollection: shouldCollectCodOnDelivery
          ? {
              amount: Number(order.payment?.amount ?? 0),
              driverId: createdById,
              orderReference: order.trackingCode || String(order.id),
            }
          : undefined,
        createdById,
        description: payload.description ?? null,
        failureReasonCode: payload.failureReasonCode ?? null,
        latitude: payload.latitude ?? null,
        location: payload.location ?? null,
        longitude: payload.longitude ?? null,
        occurredAt: payload.occurredAt ?? null,
        orderId: payload.orderId,
        pod: payload.pod,
        source: payload.source ?? this.resolveActorSource(actor),
        status: payload.status,
      })

      // 5. Nếu DELIVERED → kiểm tra Trip có hoàn thành chưa (tất cả đơn đều DELIVERED)
      if (payload.status === ORDER_STATUS.DELIVERED && order.currentTripId) {
        await this.checkAndCompleteTrip(order.currentTripId)
      }

      return result.event
    }

    return this.orderStateService.recordTrackingEvent({
      attemptNumber: payload.attemptNumber ?? null,
      createdById,
      description: payload.description ?? null,
      eventType: payload.eventType,
      failureReasonCode: payload.failureReasonCode ?? null,
      latitude: payload.latitude ?? null,
      location: payload.location ?? null,
      longitude: payload.longitude ?? null,
      occurredAt: payload.occurredAt ?? null,
      orderId: payload.orderId,
      pod: payload.pod,
      source: payload.source ?? this.resolveActorSource(actor),
      status: payload.status ?? null,
    })
  }

  /**
   * Evaluates if all orders on a trip have been processed (DELIVERED or CANCELLED).
   * If complete, automatically marks the Trip as COMPLETED and enqueues BullMQ job for CO2 calculation.
   *
   * Đánh giá xem tất cả các đơn hàng trong chuyến đi đã được xử lý xong hay chưa (DELIVERED hoặc CANCELLED).
   * Nếu đã hoàn tất, tự động đánh dấu Chuyến đi là COMPLETED và đẩy job tính lượng khí thải CO2 vào hàng đợi BullMQ.
   *
   * @param tripId The unique identifier of the trip to verify.
   *               Mã định danh duy nhất của chuyến đi cần kiểm tra.
   * @returns A promise resolving when the evaluation and updates are done.
   *          Một promise hoàn tất khi việc đánh giá và cập nhật hoàn thành.
   */
  private async checkAndCompleteTrip(tripId: number): Promise<void> {
    const trip = await this.prismaService.trip.findUnique({
      where: { id: tripId },
      include: {
        ordersOnBoard: {
          select: { id: true, status: true },
        },
      },
    })

    if (!trip) return

    // Kiểm tra tất cả đơn trong trip đã DELIVERED hoặc CANCELLED chưa
    const allDone = trip.ordersOnBoard.every(
      (o) => o.status === ORDER_STATUS.DELIVERED || o.status === ORDER_STATUS.CANCELLED,
    )

    if (allDone && trip.status !== 'COMPLETED') {
      await this.prismaService.trip.update({
        where: { id: tripId },
        data: {
          status: 'COMPLETED',
          endTime: new Date(),
        },
      })

      this.logger.log(
        `[TRACKING] Trip #${tripId} tự động COMPLETED. Tất cả ${trip.ordersOnBoard.length} đơn đã hoàn tất.`,
      )

      // Phase 4: Enqueue BullMQ job "calculate-emission" Trigger Green Tech Calculation
      await this.greenTechQueue.add(CALCULATE_EMISSION_JOB_NAME, {
        tripId: tripId,
      })
      this.logger.log(`[TRACKING] Đã đẩy job tính CO2 lên queue cho Trip #${tripId}.`)
    }
  }

  /**
   * Retrieves the comprehensive tracking timeline of an order for authenticated actors.
   *
   * Lấy dòng thời gian định vị chi tiết của một đơn hàng cho người dùng đã xác thực.
   *
   * @param orderId The unique identifier of the order.
   *                Mã định danh duy nhất của đơn hàng.
   * @param actor The token payload of the authenticated user.
   *              Thông tin token của người dùng đã xác thực.
   * @returns A promise resolving to the order's status, timeline events, and ETA details.
   *          Một promise trả về trạng thái đơn hàng, các sự kiện dòng thời gian và chi tiết ETA.
   * @throws {NotFoundException} If the order does not exist.
   *                             Nếu đơn hàng không tồn tại.
   */
  async getTimeline(orderId: number, actor: AccessTokenPayload) {
    await this.trackingAccessService.assertCanViewOrderTimeline(actor, orderId)

    const order = await this.prismaService.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { id: true, trackingCode: true, status: true },
    })

    if (!order) {
      throw new NotFoundException(`Đơn hàng #${orderId} không tồn tại`)
    }

    const events = await this.trackingRepo.findByOrderId(orderId)
    const eta = await this.getOrderEta(orderId)

    return {
      trackingCode: order.trackingCode,
      currentStatus: order.status,
      eta,
      events,
    }
  }

  /**
   * Retrieves a public-safe simplified timeline using the package's public tracking code.
   * Sanitizes sensitive fields such as internal coordinates, creators, and internal damage logs.
   *
   * Lấy dòng thời gian rút gọn an toàn công khai bằng mã vận đơn của gói hàng.
   * Làm sạch các trường nhạy cảm như tọa độ nội bộ, người tạo và nhật ký hư hỏng nội bộ.
   *
   * @param trackingCode The unique public tracking code of the order.
   *                     Mã vận đơn công khai duy nhất của đơn hàng.
   * @returns A promise resolving to the sanitized public tracking timeline.
   *          Một promise trả về dòng thời gian định vị công khai đã được làm sạch.
   * @throws {NotFoundException} If no order matches the tracking code.
   *                             Nếu không tìm thấy đơn hàng nào khớp với mã vận đơn.
   */
  async getPublicTimeline(trackingCode: string) {
    const order = await this.prismaService.order.findFirst({
      where: { trackingCode, deletedAt: null },
      select: { id: true, trackingCode: true, status: true },
    })

    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng với mã vận đơn: ${trackingCode}`)
    }

    const events = await this.trackingRepo.findByOrderId(order.id)
    const eta = await this.getOrderEta(order.id)

    // Ẩn thông tin nhạy cảm cho public API
    const sanitizedEvents = events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      status: event.status,
      location: event.location,
      description: event.description,
      occurredAt: event.occurredAt,
      pod: event.pod
        ? {
            receiverName: event.pod.receiverName,
            packageCondition: event.pod.packageCondition,
            images: event.pod.images
              .filter((img) => img.type !== 'DAMAGE_EVIDENCE') // Ẩn ảnh hư hỏng nội bộ
              .map((img) => ({ url: img.url, type: img.type })),
          }
        : null,
    }))

    return {
      trackingCode: order.trackingCode,
      currentStatus: order.status,
      eta,
      events: sanitizedEvents,
    }
  }

  /**
   * Fetches the estimated time of arrival (ETA) details associated with the active trip stop of the order.
   *
   * Lấy thông tin thời gian dự kiến đến (ETA) liên quan đến điểm dừng chuyến đi đang hoạt động của đơn hàng.
   *
   * @param orderId The unique identifier of the order.
   *                Mã định danh duy nhất của đơn hàng.
   * @returns A promise resolving to ETA metrics and associated trip ID or null.
   *          Một promise trả về các số đo ETA và ID chuyến đi liên quan hoặc null.
   */
  private async getOrderEta(orderId: number) {
    const stop = await this.prismaService.tripStop.findFirst({
      where: {
        orderId,
        expectedArrivalTime: { not: null },
      },
      orderBy: [{ trip: { createdAt: 'desc' } }, { stopSequence: 'desc' }],
      select: {
        actualArrivalTime: true,
        expectedArrivalTime: true,
        tripId: true,
      },
    })

    if (!stop) return null

    // Timeline chỉ cần ETA tổng quát cho order; thông tin tripId giúp frontend join room realtime nếu có quyền.
    return {
      actualArrivalTime: stop.actualArrivalTime,
      expectedArrivalTime: stop.expectedArrivalTime,
      tripId: stop.tripId,
    }
  }

  /**
   * Maps an authenticated user's role to its respective tracking event source.
   *
   * Ánh xạ vai trò của người dùng đã xác thực với nguồn sự kiện định vị tương ứng của họ.
   *
   * @param actor The token payload of the authenticated user.
   *              Thông tin token của người dùng đã xác thực.
   * @returns The resolved EventSource string value.
   *          Giá trị chuỗi EventSource được xác định.
   */
  private resolveActorSource(actor: AccessTokenPayload) {
    if (actor.roleName === roleName.DRIVER) return EVENT_SOURCE.DRIVER_APP
    if (actor.roleName === roleName.WAREHOUSE_STAFF) return EVENT_SOURCE.HUB_SCANNER
    if (actor.roleName === roleName.CUSTOMER) return EVENT_SOURCE.CUSTOMER_APP
    return EVENT_SOURCE.ADMIN_PORTAL
  }
}
