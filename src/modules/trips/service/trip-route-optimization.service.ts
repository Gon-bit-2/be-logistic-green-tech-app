import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { STOP_TYPE } from 'src/common/constants/trip.constant'
import { PrismaService } from 'src/database/prisma.service'
import { OsrmRoutingClient, RouteWaypoint } from './osrm-routing.client'

type TripStopForRoute = {
  actualArrivalTime: Date | null
  expectedArrivalTime: Date | null
  hub: { latitude: number | null; longitude: number | null } | null
  hubId: number | null
  id: number
  order: {
    receiverLat: number | null
    receiverLng: number | null
    senderLat: number | null
    senderLng: number | null
  } | null
  orderId: number | null
  stopSequence: number
  stopType: string
}

@Injectable()
export class TripRouteOptimizationService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly routingClient: OsrmRoutingClient,
  ) {}

  async optimizeRouteForTrip(tripId: number) {
    const trip = await this.prismaService.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        stops: {
          orderBy: { stopSequence: 'asc' },
          select: {
            actualArrivalTime: true,
            expectedArrivalTime: true,
            hub: { select: { latitude: true, longitude: true } },
            hubId: true,
            id: true,
            order: {
              select: {
                receiverLat: true,
                receiverLng: true,
                senderLat: true,
                senderLng: true,
              },
            },
            orderId: true,
            stopSequence: true,
            stopType: true,
          },
        },
        vehicle: {
          select: {
            hub: { select: { latitude: true, longitude: true } },
          },
        },
      },
    })

    if (!trip) throw new NotFoundException(`Không tìm thấy chuyến #${tripId}`)

    const startHub = trip.vehicle?.hub
    if (!this.hasCoordinates(startHub)) {
      throw new BadRequestException('Không xác định được tọa độ hub xuất phát của chuyến.')
    }

    if (!trip.stops.length) {
      throw new BadRequestException('Không đủ điểm dừng để tối ưu tuyến đường.')
    }

    const stopWaypoints = trip.stops.map((stop) => this.buildStopWaypoint(stop))
    const waypoints: RouteWaypoint[] = [
      {
        id: `trip:${trip.id}:hub:start`,
        lat: startHub.latitude,
        lng: startHub.longitude,
      },
      ...stopWaypoints,
    ]

    if (waypoints.length < 2) {
      throw new BadRequestException('Không đủ điểm dừng để tối ưu tuyến đường.')
    }

    const optimizedRoute = await this.routingClient.optimizeRoute(waypoints, false)
    const optimizedStops = optimizedRoute.waypoints
      .filter((waypoint) => waypoint.stopId != null)
      .sort((a, b) => a.optimizedSequence - b.optimizedSequence)
      .map((waypoint, index) => {
        const originalStop = trip.stops.find((stop) => stop.id === waypoint.stopId)!
        return {
          actualArrivalTime: originalStop.actualArrivalTime,
          expectedArrivalTime: originalStop.expectedArrivalTime,
          hubId: originalStop.hubId,
          id: originalStop.id,
          orderId: originalStop.orderId,
          stopSequence: index + 1,
          stopType: originalStop.stopType,
        }
      })

    const totalDistance = optimizedRoute.distanceMeters / 1000

    await this.prismaService.$transaction(async (tx) => {
      for (let index = 0; index < optimizedStops.length; index++) {
        await tx.tripStop.update({
          where: { id: optimizedStops[index].id },
          data: { stopSequence: -(index + 1) },
        })
      }

      for (const stop of optimizedStops) {
        await tx.tripStop.update({
          where: { id: stop.id },
          data: { stopSequence: stop.stopSequence },
        })
      }

      await tx.trip.update({
        where: { id: tripId },
        data: { totalDistance },
      })
    })

    return {
      fallbackUsed: optimizedRoute.fallbackUsed,
      provider: optimizedRoute.provider,
      stops: optimizedStops,
      totalDistance,
      totalDuration: optimizedRoute.durationSeconds,
      tripId,
    }
  }

  private buildStopWaypoint(stop: TripStopForRoute): RouteWaypoint {
    const coordinates = this.resolveStopCoordinates(stop)
    return {
      id: `trip-stop:${stop.id}`,
      lat: coordinates.lat,
      lng: coordinates.lng,
      stopId: stop.id,
    }
  }

  private resolveStopCoordinates(stop: TripStopForRoute): { lat: number; lng: number } {
    if (stop.stopType === STOP_TYPE.PICKUP) {
      return this.requireCoordinates(stop.order?.senderLat, stop.order?.senderLng, stop.id, 'sender')
    }

    if (stop.stopType === STOP_TYPE.HUB_TRANSFER && this.hasCoordinates(stop.hub)) {
      return { lat: stop.hub.latitude, lng: stop.hub.longitude }
    }

    if (stop.order) {
      return this.requireCoordinates(stop.order.receiverLat, stop.order.receiverLng, stop.id, 'receiver')
    }

    if (this.hasCoordinates(stop.hub)) {
      return { lat: stop.hub.latitude, lng: stop.hub.longitude }
    }

    throw new BadRequestException(`Stop #${stop.id} thiếu tọa độ để tối ưu tuyến đường.`)
  }

  private requireCoordinates(
    lat: number | null | undefined,
    lng: number | null | undefined,
    stopId: number,
    label: string,
  ): { lat: number; lng: number } {
    if (!this.isValidCoordinate(lat) || !this.isValidCoordinate(lng)) {
      throw new BadRequestException(`Stop #${stopId} thiếu tọa độ ${label} để tối ưu tuyến đường.`)
    }

    return { lat, lng }
  }

  private hasCoordinates(value: { latitude: number | null; longitude: number | null } | null | undefined): value is {
    latitude: number
    longitude: number
  } {
    return this.isValidCoordinate(value?.latitude) && this.isValidCoordinate(value?.longitude)
  }

  private isValidCoordinate(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value)
  }
}
