import { Injectable, NotFoundException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { EVENT_SOURCE, TRACKING_EVENT_TYPE } from 'src/common/constants/tracking.constant'
import roleName from 'src/common/constants/role.constant'
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

@Injectable()
export class EtaService {
  private readonly etaWriteThresholdMs = 5 * 60 * 1000

  constructor(
    private readonly prismaService: PrismaService,
    private readonly routeOptimizationService: TripRouteOptimizationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async recalculateTripEta(tripId: number) {
    const optimizedRoute = await this.routeOptimizationService.optimizeRouteForTrip(tripId)
    const trip = await this.prismaService.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        startTime: true,
        stops: {
          orderBy: { stopSequence: 'asc' },
          select: {
            expectedArrivalTime: true,
            id: true,
            order: {
              select: {
                id: true,
                preferredDeliveryTimeEnd: true,
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
        await this.syncSlaAlert(tx, {
          deadlineAt: stop.order.preferredDeliveryTimeEnd,
          etaAt: eta,
          orderId: stop.orderId,
          tripId,
        })
      }
    })

    if (updates.length) {
      this.eventEmitter.emit('eta.updated', { stops: updates, tripId })
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

  private shouldWriteEta(currentEta: Date | null, nextEta: Date) {
    if (!currentEta) return true
    return Math.abs(currentEta.getTime() - nextEta.getTime()) >= this.etaWriteThresholdMs
  }

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

  private async syncSlaAlert(
    tx: Prisma.TransactionClient,
    input: { deadlineAt: Date; etaAt: Date; orderId: number; tripId: number },
  ) {
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
        await tx.slaAlert.create({
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
      }
      return
    }

    if (activeAlert) {
      await tx.slaAlert.update({
        where: { id: activeAlert.id },
        data: {
          resolvedAt: new Date(),
          status: SlaAlertStatus.RESOLVED,
        },
      })
    }
  }
}
