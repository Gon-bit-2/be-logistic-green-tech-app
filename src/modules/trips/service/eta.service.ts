import { Injectable, NotFoundException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { EVENT_SOURCE, TRACKING_EVENT_TYPE } from 'src/common/constants/tracking.constant'
import roleName from 'src/common/constants/role.constant'
import { NotificationEventName } from 'src/modules/notification/events/notification.event'
import { PrismaService } from 'src/database/prisma.service'
import { Prisma, SlaAlertSeverity, SlaAlertStatus, SlaAlertType } from 'generated/prisma'
import { TripRouteOptimizationService } from './trip-route-optimization.service'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import { ForbiddenException } from '@nestjs/common'

type EtaStopUpdate = {
  eta: Date
  orderId: number | null
  stopId: number
  stopSequence: number
}

/**
 * Service responsible for calculating and managing the Estimated Time of Arrival (ETA) for delivery trips.
 * Integrates route optimization, monitors SLA compliance, and creates alerts when delivery windows are breached.
 *
 * Dịch vụ chịu trách nhiệm tính toán và quản lý Thời gian dự kiến đến (ETA) cho các chuyến giao hàng.
 * Tích hợp tối ưu hóa lộ trình, giám sát việc tuân thủ SLA và tạo cảnh báo khi vi phạm khung giờ giao hàng.
 */
@Injectable()
export class EtaService {
  private readonly etaWriteThresholdMs = 5 * 60 * 1000

  constructor(
    private readonly prismaService: PrismaService,
    private readonly routeOptimizationService: TripRouteOptimizationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Recalculates ETA for all remaining stops of a trip.
   * Optimizes stop sequence, updates trip stop times in database, and manages SLA alerts/notifications.
   *
   * Tính toán lại ETA cho tất cả các điểm dừng còn lại của một chuyến đi.
   * Tối ưu hóa thứ tự dừng, cập nhật thời gian dự kiến trong cơ sở dữ liệu và quản lý các cảnh báo/thông báo SLA.
   *
   * @param tripId The unique identifier of the trip.
   *               Mã định danh duy nhất của chuyến đi.
   * @returns A promise resolving to the list of stops with updated ETAs and counts.
   *          Một promise trả về danh sách các điểm dừng cùng ETA đã cập nhật và số lượng cập nhật.
   * @throws {NotFoundException} If the trip is not found.
   *                             Nếu không tìm thấy chuyến đi.
   */
  async recalculateTripEta(tripId: number) {
    const optimizedRoute = await this.routeOptimizationService.optimizeRouteForTrip(tripId)
    const trip = await this.prismaService.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        startTime: true,
        vehicle: { select: { hubId: true } },
        stops: {
          orderBy: { stopSequence: 'asc' },
          select: {
            expectedArrivalTime: true,
            id: true,
            order: {
              select: {
                customerId: true,
                id: true,
                preferredDeliveryTimeEnd: true,
                trackingCode: true,
              },
            },
            orderId: true,
            stopSequence: true,
          },
        },
      },
    })

    if (!trip) throw new NotFoundException(`Không tìm thấy chuyến #${tripId}`)
    if (!trip.stops.length) return { tripId, stops: [], updatedStopCount: 0 }

    const startAt = trip.startTime ?? new Date()
    const secondsPerStop = optimizedRoute.totalDuration / trip.stops.length
    const etaByStopId = new Map<number, Date>()

    for (let index = 0; index < trip.stops.length; index++) {
      etaByStopId.set(
        trip.stops[index].id,
        new Date(startAt.getTime() + Math.round(secondsPerStop * (index + 1)) * 1000),
      )
    }

    const updates: EtaStopUpdate[] = []
    const slaNotificationEvents: { eventName: string; payload: Record<string, unknown> }[] = []
    await this.prismaService.$transaction(async (tx) => {
      for (const stop of trip.stops) {
        const eta = etaByStopId.get(stop.id)!
        if (!this.shouldWriteEta(stop.expectedArrivalTime, eta)) continue

        await tx.tripStop.update({
          where: { id: stop.id },
          data: { expectedArrivalTime: eta },
        })

        updates.push({
          eta,
          orderId: stop.orderId,
          stopId: stop.id,
          stopSequence: stop.stopSequence,
        })

        // ETA_UPDATE là event append-only để timeline giải thích vì sao ETA đã thay đổi.
        if (stop.orderId) {
          await tx.orderTrackingEvent.create({
            data: {
              description: `ETA cập nhật: ${eta.toISOString()}`,
              eventType: TRACKING_EVENT_TYPE.ETA_UPDATE,
              occurredAt: new Date(),
              orderId: stop.orderId,
              recordedAt: new Date(),
              source: EVENT_SOURCE.SYSTEM,
            },
          })
        }
      }

      for (const stop of trip.stops) {
        if (!stop.orderId || !stop.order?.preferredDeliveryTimeEnd) continue
        const eta = etaByStopId.get(stop.id)!
        const alertChange = await this.syncSlaAlert(tx, {
          deadlineAt: stop.order.preferredDeliveryTimeEnd,
          etaAt: eta,
          orderId: stop.orderId,
          tripId,
        })

        if (alertChange) {
          const recipientUserIds = await this.resolveSlaRecipients(stop.order.customerId, trip.vehicle?.hubId ?? null)
          slaNotificationEvents.push({
            eventName:
              alertChange.action === 'resolved'
                ? NotificationEventName.SLA_ALERT_RESOLVED
                : NotificationEventName.SLA_ALERT_CREATED,
            payload: {
              alertId: alertChange.alert.id,
              deadlineAt: alertChange.alert.deadlineAt,
              etaAt: alertChange.alert.etaAt,
              orderId: stop.orderId,
              recipientUserIds,
              trackingCode: stop.order.trackingCode,
              tripId,
            },
          })
        }
      }
    })

    if (updates.length) {
      this.eventEmitter.emit('eta.updated', { stops: updates, tripId })
    }
    for (const event of slaNotificationEvents) {
      this.eventEmitter.emit(event.eventName, event.payload)
    }

    return {
      fallbackUsed: optimizedRoute.fallbackUsed,
      provider: optimizedRoute.provider,
      stops: trip.stops.map((stop) => ({
        eta: etaByStopId.get(stop.id),
        orderId: stop.orderId,
        stopId: stop.id,
        stopSequence: stop.stopSequence,
      })),
      totalDuration: optimizedRoute.totalDuration,
      tripId,
      updatedStopCount: updates.length,
    }
  }

  /**
   * Retrieves the current estimated stopping times (ETA) for a specific trip.
   * Enforces role-based visibility rules (Admin, Driver, Customer, Warehouse Staff).
   *
   * Lấy thời gian dự kiến đến (ETA) hiện tại cho một chuyến đi cụ thể.
   * Áp dụng quy tắc hiển thị theo vai trò người dùng (Admin, Tài xế, Khách hàng, Nhân viên kho).
   *
   * @param actor The token payload of the user making the request.
   *              Thông tin token của người dùng thực hiện yêu cầu.
   * @param tripId The unique identifier of the trip.
   *               Mã định danh duy nhất của chuyến đi.
   * @returns A promise resolving to the trip's stops and their respective arrival times/deadlines.
   *          Một promise trả về các điểm dừng của chuyến đi cùng thời gian đến và deadline tương ứng.
   * @throws {NotFoundException} If the trip is not found.
   *                             Nếu không tìm thấy chuyến đi.
   * @throws {ForbiddenException} If the user does not have permission to view this trip's ETA.
   *                              Nếu người dùng không có quyền xem ETA của chuyến đi này.
   */
  async getTripEta(actor: AccessTokenPayload, tripId: number) {
    const trip = await this.prismaService.trip.findUnique({
      where: { id: tripId },
      select: {
        driverId: true,
        id: true,
        vehicle: { select: { hubId: true } },
        ordersOnBoard: { select: { customerId: true } },
        stops: {
          orderBy: { stopSequence: 'asc' },
          select: {
            actualArrivalTime: true,
            expectedArrivalTime: true,
            id: true,
            order: {
              select: {
                id: true,
                preferredDeliveryTimeEnd: true,
                trackingCode: true,
              },
            },
            orderId: true,
            stopSequence: true,
            stopType: true,
          },
        },
      },
    })

    if (!trip) throw new NotFoundException(`Không tìm thấy chuyến #${tripId}`)
    this.assertCanViewTripEta(actor, trip)

    return {
      stops: trip.stops.map((stop) => ({
        actualArrivalTime: stop.actualArrivalTime,
        expectedArrivalTime: stop.expectedArrivalTime,
        orderDeadline: stop.order?.preferredDeliveryTimeEnd ?? null,
        orderId: stop.orderId,
        stopId: stop.id,
        stopSequence: stop.stopSequence,
        stopType: stop.stopType,
        trackingCode: stop.order?.trackingCode ?? null,
      })),
      tripId,
    }
  }

  /**
   * Evaluates if the change in ETA is significant enough to warrant a database write operation.
   * Prevents database thrashing by filtering out small time variations (below a specific threshold).
   *
   * Đánh giá xem thay đổi ETA có đủ lớn để thực hiện ghi cơ sở dữ liệu hay không.
   * Ngăn chặn ghi DB liên tục bằng cách bỏ qua các thay đổi thời gian nhỏ (dưới ngưỡng quy định).
   *
   * @param currentEta The current ETA in database.
   *                   ETA hiện tại trong cơ sở dữ liệu.
   * @param nextEta The newly calculated ETA.
   *                ETA mới được tính toán.
   * @returns True if the new ETA should be written.
   *          True nếu nên ghi ETA mới.
   */
  private shouldWriteEta(currentEta: Date | null, nextEta: Date) {
    if (!currentEta) return true
    return Math.abs(currentEta.getTime() - nextEta.getTime()) >= this.etaWriteThresholdMs
  }

  /**
   * Asserts that a user has permission to view a trip's ETA information.
   *
   * Xác minh người dùng có quyền xem thông tin ETA của chuyến đi.
   *
   * @param actor The token payload of the user.
   *              Thông tin token của người dùng.
   * @param trip The trip data with driver and scoped entities.
   *             Dữ liệu chuyến đi với tài xế và các thực thể liên quan.
   * @throws {ForbiddenException} If the user is not authorized.
   *                              Nếu người dùng không được ủy quyền.
   */
  private assertCanViewTripEta(
    actor: AccessTokenPayload,
    trip: {
      driverId: number
      ordersOnBoard: { customerId: number }[]
      vehicle: { hubId: number | null }
    },
  ) {
    if (actor.roleName === roleName.ADMIN) return
    if (actor.roleName === roleName.DRIVER && trip.driverId === actor.userId) return
    if (actor.roleName === roleName.CUSTOMER && trip.ordersOnBoard.some((order) => order.customerId === actor.userId))
      return
    if (actor.roleName === roleName.WAREHOUSE_STAFF && actor.hubId && trip.vehicle.hubId === actor.hubId) return

    throw new ForbiddenException('Error.Forbidden')
  }

  /**
   * Synchronizes SLA breach alerts. Creates an active alert if the ETA exceeds preferred delivery time,
   * or resolves an existing active alert if the ETA is back within the deadline.
   *
   * Đồng bộ hóa cảnh báo vi phạm SLA. Tạo cảnh báo nếu ETA vượt quá thời gian giao hàng ưu tiên,
   * hoặc hoàn thành cảnh báo hiện có nếu ETA trở lại trong thời hạn cho phép.
   *
   * @param tx The Prisma Transaction Client.
   *           Prisma Transaction Client.
   * @param input Object containing the deadline, calculated ETA, order ID, and trip ID.
   *              Đối tượng chứa deadline, ETA đã tính, mã đơn hàng và mã chuyến đi.
   * @returns A promise resolving to the alert status change object or null.
   *          Một promise trả về đối tượng thay đổi trạng thái cảnh báo hoặc null.
   */
  private async syncSlaAlert(
    tx: Prisma.TransactionClient,
    input: { deadlineAt: Date; etaAt: Date; orderId: number; tripId: number },
  ): Promise<{ action: 'created' | 'resolved'; alert: { deadlineAt: Date | null; etaAt: Date | null; id: number } } | null> {
    const activeAlert = await tx.slaAlert.findFirst({
      where: {
        alertType: SlaAlertType.DELIVERY_WINDOW_BREACH,
        orderId: input.orderId,
        status: SlaAlertStatus.ACTIVE,
      },
    })

    if (input.etaAt > input.deadlineAt) {
      const message = `ETA ${input.etaAt.toISOString()} vượt deadline ${input.deadlineAt.toISOString()}`
      if (activeAlert) {
        await tx.slaAlert.update({
          where: { id: activeAlert.id },
          data: { etaAt: input.etaAt, message, tripId: input.tripId },
        })
      } else {
        const alert = await tx.slaAlert.create({
          data: {
            alertType: SlaAlertType.DELIVERY_WINDOW_BREACH,
            deadlineAt: input.deadlineAt,
            etaAt: input.etaAt,
            message,
            orderId: input.orderId,
            severity: SlaAlertSeverity.WARNING,
            status: SlaAlertStatus.ACTIVE,
            tripId: input.tripId,
          },
        })
        return { action: 'created', alert }
      }
      return null
    }

    if (activeAlert) {
      const alert = await tx.slaAlert.update({
        where: { id: activeAlert.id },
        data: {
          resolvedAt: new Date(),
          status: SlaAlertStatus.RESOLVED,
        },
      })
      return { action: 'resolved', alert }
    }

    return null
  }

  /**
   * Resolves list of users who should receive notification about an SLA alert.
   * Includes the customer, admins, and warehouse staff associated with the hub.
   *
   * Xác định danh sách người dùng sẽ nhận thông báo về cảnh báo SLA.
   * Bao gồm khách hàng, quản trị viên và nhân viên kho liên kết với hub.
   *
   * @param customerId The ID of the customer.
   *                   ID của khách hàng.
   * @param hubId The ID of the hub.
   *              ID của kho bãi.
   * @returns A promise resolving to an array of recipient user IDs.
   *          Một promise trả về mảng chứa ID của những người nhận.
   */
  private async resolveSlaRecipients(customerId: number, hubId: number | null) {
    const users = await this.prismaService.user.findMany({
      where: {
        deletedAt: null,
        isDeleted: false,
        OR: [
          { id: customerId },
          { role: { name: roleName.ADMIN } },
          ...(hubId ? [{ hubId, role: { name: roleName.WAREHOUSE_STAFF } }] : []),
        ],
      },
      select: { id: true },
    })

    return users.map((user) => user.id)
  }
}
