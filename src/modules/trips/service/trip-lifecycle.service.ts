import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import { CancelTripBodyType } from '../model/trip.model'
import { TRIP_STATUS } from 'src/common/constants/trip.constant'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { calculateHaversineDistance } from 'src/common/utils/geo.util'
import { TripHubHelper } from './trip-hub.helper'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import roleName from 'src/common/constants/role.constant'
import { GamificationService } from 'src/modules/green-tech/service/gamification.service'
import { EVENT_SOURCE } from 'src/common/constants/tracking.constant'
import { OrderStateService } from 'src/common/services/order-state.service'
import { AuditLogService } from 'src/common/services/audit-log.service'

@Injectable()
export class TripLifecycleService {
  private readonly logger = new Logger(TripLifecycleService.name)

  constructor(
    private readonly prismaService: PrismaService,
    private readonly hubHelper: TripHubHelper,
    private readonly gamificationService: GamificationService,
    private readonly orderStateService: OrderStateService,
    @Optional() private readonly auditLogService?: AuditLogService,
  ) {}

  async startTrip(tripId: number, actor: AccessTokenPayload) {
    const trip = await this.prismaService.trip.findUnique({
      where: { id: tripId },
      select: {
        driverId: true,
        id: true,
        status: true,
        stops: {
          select: {
            order: {
              select: {
                id: true,
                payment: {
                  select: { method: true, status: true },
                },
                status: true,
                trackingCode: true,
              },
            },
          },
        },
      },
    })

    if (!trip) throw new NotFoundException(`Không tìm thấy chuyến #${tripId}`)
    if (trip.driverId !== actor.userId) throw new ForbiddenException('Bạn không phải tài xế của chuyến này.')
    if (trip.status !== TRIP_STATUS.PENDING) {
      throw new BadRequestException('Chuyến phải ở trạng thái PENDING mới có thể bắt đầu.')
    }

    for (const stop of trip.stops) {
      if (stop.order) {
        this.hubHelper.assertOrderPaymentReadyForDispatch(stop.order)
      }
    }

    return this.prismaService.$transaction(async (tx) => {
      const orderIds = trip.stops.filter((stop) => stop.order).map((stop) => stop.order!.id)

      if (orderIds.length) {
        await this.orderStateService.transitionOrdersInTransaction({
          createdById: actor.userId,
          description: `Chuyến #${tripId} bắt đầu vận chuyển.`,
          expectedStatuses: [ORDER_STATUS.PENDING, ORDER_STATUS.ASSIGNED, ORDER_STATUS.ARRIVED_AT_HUB],
          orderIds,
          source: EVENT_SOURCE.DRIVER_APP,
          status: ORDER_STATUS.IN_TRANSIT,
          tx,
          validationMode: 'system',
        })
      }

      const updated = await tx.trip.update({
        where: { id: tripId },
        data: { startTime: new Date(), status: TRIP_STATUS.IN_PROGRESS },
      })
      await this.auditLogService?.record(
        {
          action: 'TRIP_STATUS_CHANGED',
          actorUserId: actor.userId,
          after: { status: TRIP_STATUS.IN_PROGRESS },
          before: { status: trip.status },
          entityId: tripId,
          entityType: 'TRIP',
        },
        tx,
      )
      return updated
    })
  }

  async cancelTrip(tripId: number, dto: CancelTripBodyType, actor: AccessTokenPayload) {
    const trip = await this.prismaService.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        status: true,
        driverId: true,
        stops: {
          select: {
            order: { select: { id: true, status: true } },
          },
        },
      },
    })

    if (!trip) throw new NotFoundException(`Không tìm thấy chuyến #${tripId}`)
    if (trip.status !== TRIP_STATUS.PENDING) {
      throw new BadRequestException('Chỉ có thể hủy chuyến đang ở trạng thái PENDING.')
    }

    const orderIds = trip.stops.filter((stop) => stop.order).map((stop) => stop.order!.id)

    return this.prismaService.$transaction(async (tx) => {
      if (orderIds.length) {
        await this.orderStateService.transitionOrdersInTransaction({
          createdById: actor.userId,
          description: dto.reason ?? `Chuyến #${tripId} bị hủy trước khi khởi hành.`,
          expectedStatuses: [ORDER_STATUS.ASSIGNED],
          nextOrderData: {
            currentTripId: null,
          },
          orderIds,
          source: actor.roleName === roleName.DRIVER ? EVENT_SOURCE.DRIVER_APP : EVENT_SOURCE.ADMIN_PORTAL,
          status: ORDER_STATUS.PENDING,
          tx,
          validationMode: 'system',
        })
      }

      const updated = await tx.trip.update({
        where: { id: tripId },
        data: {
          status: TRIP_STATUS.CANCELLED,
        },
      })
      await this.auditLogService?.record(
        {
          action: 'TRIP_STATUS_CHANGED',
          actorUserId: actor.userId,
          after: { status: TRIP_STATUS.CANCELLED },
          before: { status: trip.status },
          entityId: tripId,
          entityType: 'TRIP',
          metadata: { reason: dto.reason ?? null },
        },
        tx,
      )
      return updated
    })
  }

  async completeTrip(tripId: number, actor: AccessTokenPayload) {
    const trip = await this.prismaService.trip.findUnique({
      where: { id: tripId },
      include: {
        stops: {
          include: {
            order: {
              select: {
                id: true,
                receiverLat: true,
                receiverLng: true,
                senderLat: true,
                senderLng: true,
                status: true,
              },
            },
          },
        },
        vehicle: { select: { id: true } },
      },
    })

    if (!trip) throw new NotFoundException(`Không tìm thấy chuyến #${tripId}`)
    if (trip.status !== TRIP_STATUS.IN_PROGRESS) {
      throw new BadRequestException('Chuyến phải đang ở trạng thái IN_PROGRESS mới có thể hoàn thành.')
    }
    if (trip.driverId !== actor.userId) {
      throw new ForbiddenException('Bạn không phải tài xế của chuyến này.')
    }

    const activeStops = trip.stops.filter((stop) => stop.order && stop.order.status !== ORDER_STATUS.CANCELLED)
    const hasUnfinishedOrder = activeStops.some((stop) => stop.order?.status !== ORDER_STATUS.DELIVERED)

    if (hasUnfinishedOrder) {
      throw new BadRequestException('Còn đơn hàng chưa giao xong. Hãy cập nhật trạng thái từng đơn trước.')
    }

    const totalDistance = activeStops.reduce((sum, stop) => {
      if (!stop.order) return sum
      return (
        sum +
        calculateHaversineDistance(
          stop.order.senderLat,
          stop.order.senderLng,
          stop.order.receiverLat,
          stop.order.receiverLng,
        )
      )
    }, 0)

    const completedTrip = await this.prismaService.$transaction(async (tx) => {
      const updated = await tx.trip.update({
        where: { id: tripId },
        data: {
          endTime: new Date(),
          status: TRIP_STATUS.COMPLETED,
          ...(totalDistance > 0 ? { totalDistance } : {}),
        },
      })
      await this.auditLogService?.record(
        {
          action: 'TRIP_STATUS_CHANGED',
          actorUserId: actor.userId,
          after: { status: TRIP_STATUS.COMPLETED, totalDistance: updated.totalDistance },
          before: { status: trip.status, totalDistance: trip.totalDistance },
          entityId: tripId,
          entityType: 'TRIP',
        },
        tx,
      )
      return updated
    })

    try {
      if (trip.vehicle) {
        await this.gamificationService.processTripEmission(tripId)
      }
    } catch (error) {
      this.logger.warn(
        `Gamification failed for trip #${tripId}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    return completedTrip
  }
}
