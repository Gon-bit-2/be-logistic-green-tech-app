import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common'
import { TrackingRepository } from '../repository/tracking.repo'
import { CreateTrackingEventType } from '../model/tracking.model'
import { PrismaService } from 'src/database/prisma.service'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { EventEmitter2 } from '@nestjs/event-emitter'
import {
  TRACKING_EVENT_TYPE,
  VALID_STATUS_TRANSITIONS,
  MAX_DELIVERY_ATTEMPTS,
} from 'src/common/constants/tracking.constant'
import { GREEN_TECH_QUEUE_NAME, CALCULATE_EMISSION_JOB_NAME } from 'src/common/constants/queue.constant'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { NotificationEventName, OrderStatusUpdatedEvent } from 'src/modules/notification/events/notification.event'
import roleName from 'src/common/constants/role.constant'
import type { AccessTokenPayload } from 'src/types/jwt.type'

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name)
  private readonly notifiableOrderStatuses: OrderStatusUpdatedEvent['status'][] = [
    ORDER_STATUS.OUT_FOR_DELIVERY,
    ORDER_STATUS.DELIVERED,
    ORDER_STATUS.CANCELLED,
  ]

  constructor(
    private readonly trackingRepo: TrackingRepository,
    private readonly prismaService: PrismaService,
    @InjectQueue(GREEN_TECH_QUEUE_NAME) private readonly greenTechQueue: Queue,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Tạo tracking event mới
   * Bao gồm: validate state machine, kiểm tra POD, kiểm tra failed attempts
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

    if (actor.roleName === roleName.WAREHOUSE_STAFF) {
      const warehouseUser = await this.prismaService.user.findFirst({
        where: {
          id: actor.userId,
          deletedAt: null,
          isDeleted: false,
        },
        select: {
          hubId: true,
        },
      })

      if (!warehouseUser?.hubId || warehouseUser.hubId !== order.currentHubId) {
        throw new ForbiddenException('Error.PermissionDenied.NotYourHub')
      }
    }

    // 2. Nếu là STATUS_CHANGE → validate State Machine
    let shouldUpdateOrderStatus = false

    if (payload.eventType === TRACKING_EVENT_TYPE.STATUS_CHANGE && payload.status) {
      this.validateStatusTransition(order.status, payload.status)
      shouldUpdateOrderStatus = true

      this.logger.log(
        `[TRACKING] Order #${payload.orderId}: ${order.status} → ${payload.status} | by User #${createdById}`,
      )
    }

    const shouldCollectCodOnDelivery =
      shouldUpdateOrderStatus &&
      payload.status === ORDER_STATUS.DELIVERED &&
      order.payment?.method === 'COD' &&
      order.payment.status !== 'COMPLETED' &&
      !order.isCodCollected

    if (shouldCollectCodOnDelivery && actor.roleName !== roleName.DRIVER) {
      throw new ForbiddenException('Error.PermissionDenied.CodCollectionRequiresDriver')
    }

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

    // 4. Gọi Repository tạo event + update status (trong Transaction)
    const event = await this.trackingRepo.createEventWithStatusUpdate(createdById, payload, shouldUpdateOrderStatus, {
      codCollection: shouldCollectCodOnDelivery
        ? {
            amount: Number(order.payment?.amount ?? 0),
            driverId: createdById,
            orderReference: order.trackingCode || String(order.id),
          }
        : undefined,
    })

    if (shouldUpdateOrderStatus && payload.status && this.shouldNotifyOrderStatus(payload.status)) {
      await this.emitNotificationEvent(NotificationEventName.ORDER_STATUS_UPDATED, {
        userId: order.customerId,
        orderId: order.id,
        trackingCode: order.trackingCode,
        status: payload.status,
      })
    }

    // 5. Nếu DELIVERED → kiểm tra Trip có hoàn thành chưa (tất cả đơn đều DELIVERED)
    if (payload.status === ORDER_STATUS.DELIVERED && order.currentTripId) {
      await this.checkAndCompleteTrip(order.currentTripId)
    }

    return event
  }

  /**
   * State Machine: Validate chuyển trạng thái hợp lệ
   * Chặn mọi chuyển trạng thái bậy bạ (ví dụ: PENDING → DELIVERED)
   */
  private validateStatusTransition(currentStatus: string, newStatus: string): void {
    const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus]

    if (!allowedTransitions) {
      throw new BadRequestException(`Trạng thái "${currentStatus}" là trạng thái cuối, không thể chuyển tiếp.`)
    }

    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Không thể chuyển từ "${currentStatus}" sang "${newStatus}". Chỉ cho phép: [${allowedTransitions.join(', ')}]`,
      )
    }
  }

  /**
   * Kiểm tra Trip: nếu tất cả đơn trên Trip đều DELIVERED → tự động chuyển Trip sang COMPLETED
   * Đây là trigger tự nhiên để Green Tech module tính CO₂
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
   * Lấy timeline tracking của 1 đơn hàng (cần login)
   */
  async getTimeline(orderId: number) {
    const order = await this.prismaService.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { id: true, trackingCode: true, status: true },
    })

    if (!order) {
      throw new NotFoundException(`Đơn hàng #${orderId} không tồn tại`)
    }

    const events = await this.trackingRepo.findByOrderId(orderId)

    return {
      trackingCode: order.trackingCode,
      currentStatus: order.status,
      events,
    }
  }

  /**
   * Lấy timeline tracking công khai bằng mã vận đơn (không cần login)
   * Ẩn thông tin nhạy cảm (createdById, coordinates nội bộ)
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
      events: sanitizedEvents,
    }
  }

  private shouldNotifyOrderStatus(status: string): status is OrderStatusUpdatedEvent['status'] {
    return this.notifiableOrderStatuses.some((item) => item === status)
  }

  private async emitNotificationEvent(
    eventName: typeof NotificationEventName.ORDER_STATUS_UPDATED,
    payload: OrderStatusUpdatedEvent,
  ) {
    try {
      await this.eventEmitter.emitAsync(eventName, payload)
    } catch (error) {
      this.logger.warn(
        `Notification event failed for ${eventName}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
