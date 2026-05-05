import { BadRequestException } from '@nestjs/common'
import { STOP_TYPE } from 'src/common/constants/trip.constant'
import { PrismaService } from 'src/database/prisma.service'
import { OsrmRoutingClient } from '../service/osrm-routing.client'
import { TripRouteOptimizationService } from '../service/trip-route-optimization.service'

describe('TripRouteOptimizationService', () => {
  let service: TripRouteOptimizationService
  let prismaService: {
    $transaction: jest.Mock
    trip: { findUnique: jest.Mock }
  }
  let routingClient: jest.Mocked<OsrmRoutingClient>
  let tx: {
    trip: { update: jest.Mock }
    tripStop: { update: jest.Mock }
  }

  const baseTrip = {
    id: 10,
    vehicle: { hub: { latitude: 10, longitude: 106 } },
    stops: [
      {
        actualArrivalTime: null,
        expectedArrivalTime: null,
        hub: null,
        hubId: null,
        id: 101,
        order: { receiverLat: 10.1, receiverLng: 106.1, senderLat: 10.01, senderLng: 106.01 },
        orderId: 1,
        stopSequence: 1,
        stopType: STOP_TYPE.PICKUP,
      },
      {
        actualArrivalTime: null,
        expectedArrivalTime: null,
        hub: null,
        hubId: null,
        id: 102,
        order: { receiverLat: 10.2, receiverLng: 106.2, senderLat: 10.02, senderLng: 106.02 },
        orderId: 2,
        stopSequence: 2,
        stopType: STOP_TYPE.DROPOFF,
      },
    ],
  }

  beforeEach(() => {
    tx = {
      trip: { update: jest.fn().mockResolvedValue(undefined) },
      tripStop: { update: jest.fn().mockResolvedValue(undefined) },
    }
    prismaService = {
      $transaction: jest.fn(async (callback) => callback(tx)),
      trip: { findUnique: jest.fn().mockResolvedValue(baseTrip) },
    }
    routingClient = {
      optimizeRoute: jest.fn(),
    } as unknown as jest.Mocked<OsrmRoutingClient>
    service = new TripRouteOptimizationService(prismaService as unknown as PrismaService, routingClient)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('map waypoint OSRM về đúng TripStop id và ghi totalDistance theo km', async () => {
    routingClient.optimizeRoute.mockResolvedValue({
      distanceMeters: 12500,
      durationSeconds: 1800,
      fallbackUsed: false,
      provider: 'OSRM',
      waypoints: [
        { id: 'trip:10:hub:start', inputIndex: 0, lat: 10, lng: 106, optimizedSequence: 0 },
        { id: 'trip-stop:101', inputIndex: 1, lat: 10.01, lng: 106.01, optimizedSequence: 2, stopId: 101 },
        { id: 'trip-stop:102', inputIndex: 2, lat: 10.2, lng: 106.2, optimizedSequence: 1, stopId: 102 },
      ],
    })

    const result = await service.optimizeRouteForTrip(10)

    expect(result).toMatchObject({
      fallbackUsed: false,
      provider: 'OSRM',
      totalDistance: 12.5,
      totalDuration: 1800,
      tripId: 10,
    })
    expect(result.stops.map((stop) => ({ id: stop.id, stopSequence: stop.stopSequence }))).toEqual([
      { id: 102, stopSequence: 1 },
      { id: 101, stopSequence: 2 },
    ])
    expect(tx.tripStop.update).toHaveBeenNthCalledWith(1, {
      data: { stopSequence: -1 },
      where: { id: 102 },
    })
    expect(tx.tripStop.update).toHaveBeenNthCalledWith(2, {
      data: { stopSequence: -2 },
      where: { id: 101 },
    })
    expect(tx.trip.update).toHaveBeenCalledWith({
      data: { totalDistance: 12.5 },
      where: { id: 10 },
    })
  })

  it('fallback Haversine giữ thứ tự hiện tại và không ghi distance 0', async () => {
    routingClient.optimizeRoute.mockResolvedValue({
      distanceMeters: 1500,
      durationSeconds: 180,
      fallbackUsed: true,
      provider: 'HAVERSINE',
      waypoints: [
        { id: 'trip:10:hub:start', inputIndex: 0, lat: 10, lng: 106, optimizedSequence: 0 },
        { id: 'trip-stop:101', inputIndex: 1, lat: 10.01, lng: 106.01, optimizedSequence: 1, stopId: 101 },
        { id: 'trip-stop:102', inputIndex: 2, lat: 10.2, lng: 106.2, optimizedSequence: 2, stopId: 102 },
      ],
    })

    const result = await service.optimizeRouteForTrip(10)

    expect(result.fallbackUsed).toBe(true)
    expect(result.totalDistance).toBe(1.5)
    expect(result.stops.map((stop) => stop.id)).toEqual([101, 102])
    expect(tx.trip.update).toHaveBeenCalledWith({
      data: { totalDistance: 1.5 },
      where: { id: 10 },
    })
  })

  it('reject khi stop thiếu tọa độ', async () => {
    prismaService.trip.findUnique.mockResolvedValue({
      ...baseTrip,
      stops: [
        {
          ...baseTrip.stops[0],
          order: { receiverLat: 10.1, receiverLng: 106.1, senderLat: null, senderLng: 106.01 },
        },
      ],
    })

    await expect(service.optimizeRouteForTrip(10)).rejects.toThrow(BadRequestException)
    expect(routingClient.optimizeRoute).not.toHaveBeenCalled()
  })
})
