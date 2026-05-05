import { Injectable } from '@nestjs/common'
import { TripRepository } from '../repository/trip.repository'
import { PrismaService } from 'src/database/prisma.service'
import { DispatchBoardResType, DriverAssignmentRequestResType, DriverDispatchBoardResType } from '../model/trip.model'
import { TRIP_STATUS } from 'src/common/constants/trip.constant'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { DISPATCHABLE_PAYMENT_FILTER } from 'src/common/constants/order-query.constant'
import { DriverAssignmentRequestStatus } from 'src/common/constants/driver-assignment-request.constant'
import roleName from 'src/common/constants/role.constant'
import { TripHubHelper } from './trip-hub.helper'
import { DriverAssignmentHelper } from './driver-assignment.helper'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'

/**
 * Service hiển thị Dispatch Board cho Admin/Staff và Driver.
 *
 * Chứa toàn bộ logic query + mapping response cho:
 * - getDispatchBoard: Bảng điều phối cho Admin/Warehouse Staff
 * - getDriverDispatchBoard: Bảng điều phối cho Driver
 */
@Injectable()
export class DispatchBoardService {
  constructor(
    private readonly tripRepo: TripRepository,
    private readonly prismaService: PrismaService,
    private readonly hubHelper: TripHubHelper,
    private readonly assignmentHelper: DriverAssignmentHelper,
  ) {}

  /**
   * Lấy dữ liệu Dispatch Board cho Admin/Staff.
   * Bao gồm: đơn chờ dispatch, tài xế, xe, và chuyến PENDING.
   */
  async getDispatchBoard(requestedHubId: number | undefined, actor: AccessTokenPayload): Promise<DispatchBoardResType> {
    const hubId = await this.hubHelper.resolveDispatchHub(requestedHubId, actor)
    const [dispatchableOrders, drivers, vehicles, pendingTrips] = await Promise.all([
      this.tripRepo.findPendingOrders(hubId),
      this.prismaService.user.findMany({
        where: {
          deletedAt: null,
          hubId,
          isDeleted: false,
          role: { name: roleName.DRIVER },
        },
        select: {
          fullName: true,
          id: true,
          phone: true,
          tripsDriven: {
            orderBy: [{ createdAt: 'desc' }],
            select: { id: true, status: true },
            take: 1,
            where: {
              status: {
                in: [TRIP_STATUS.PENDING, TRIP_STATUS.IN_PROGRESS],
              },
            },
          },
        },
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      }),
      this.prismaService.vehicle.findMany({
        where: {
          deletedAt: null,
          hubId,
          isActive: true,
        },
        select: {
          capacityVolume: true,
          capacityWeight: true,
          id: true,
          licensePlate: true,
          trips: {
            orderBy: [{ createdAt: 'desc' }],
            select: { id: true, status: true },
            take: 1,
            where: {
              status: {
                in: [TRIP_STATUS.PENDING, TRIP_STATUS.IN_PROGRESS],
              },
            },
          },
          type: true,
        },
        orderBy: [{ licensePlate: 'asc' }, { id: 'asc' }],
      }),
      this.prismaService.trip.findMany({
        where: {
          status: TRIP_STATUS.PENDING,
          vehicle: {
            deletedAt: null,
            hubId,
          },
        },
        include: {
          driver: {
            select: {
              fullName: true,
              id: true,
            },
          },
          stops: {
            include: {
              order: {
                select: {
                  id: true,
                  receiverAddress: true,
                  receiverName: true,
                  senderAddress: true,
                  status: true,
                  totalVolume: true,
                  totalWeight: true,
                  trackingCode: true,
                },
              },
            },
            orderBy: { stopSequence: 'asc' },
          },
          vehicle: {
            select: {
              capacityVolume: true,
              capacityWeight: true,
              id: true,
              licensePlate: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
      }),
    ])

    const mappedOrders = dispatchableOrders.map((order) => ({
      id: order.id,
      receiverAddress: order.receiverAddress,
      receiverName: order.receiverName,
      senderAddress: order.senderAddress,
      status: order.status,
      totalVolume: order.totalVolume,
      totalWeight: order.totalWeight,
      trackingCode: order.trackingCode,
    }))

    const mappedDrivers = drivers.map((driver) => {
      const activeTrip = driver.tripsDriven[0] ?? null
      return {
        activeTripId: activeTrip?.id ?? null,
        activeTripStatus: activeTrip?.status ?? null,
        fullName: driver.fullName,
        id: driver.id,
        isAvailable: !activeTrip,
        phone: driver.phone ?? null,
      }
    })

    const mappedVehicles = vehicles.map((vehicle) => {
      const activeTrip = vehicle.trips[0] ?? null
      return {
        activeTripId: activeTrip?.id ?? null,
        activeTripStatus: activeTrip?.status ?? null,
        capacityVolume: vehicle.capacityVolume,
        capacityWeight: vehicle.capacityWeight,
        id: vehicle.id,
        isAvailable: !activeTrip,
        licensePlate: vehicle.licensePlate,
        type: vehicle.type,
      }
    })

    const mappedPendingTrips = pendingTrips.map((trip) => {
      const uniqueOrders = new Map<number, (typeof mappedOrders)[number]>()

      for (const stop of trip.stops) {
        if (!stop.order) continue
        if (!uniqueOrders.has(stop.order.id)) {
          uniqueOrders.set(stop.order.id, {
            id: stop.order.id,
            receiverAddress: stop.order.receiverAddress,
            receiverName: stop.order.receiverName,
            senderAddress: stop.order.senderAddress,
            status: stop.order.status,
            totalVolume: stop.order.totalVolume,
            totalWeight: stop.order.totalWeight,
            trackingCode: stop.order.trackingCode,
          })
        }
      }

      const orders = [...uniqueOrders.values()]
      const totalAssignedWeight = orders.reduce((sum, order) => sum + order.totalWeight, 0)
      const totalAssignedVolume = orders.reduce((sum, order) => sum + order.totalVolume, 0)

      return {
        driverId: trip.driver.id,
        driverName: trip.driver.fullName,
        id: trip.id,
        orderCount: orders.length,
        orderIds: orders.map((order) => order.id),
        orders,
        remainingVolume: Math.max((trip.vehicle.capacityVolume ?? 0) - totalAssignedVolume, 0),
        remainingWeight: Math.max((trip.vehicle.capacityWeight ?? 0) - totalAssignedWeight, 0),
        status: trip.status,
        totalAssignedVolume,
        totalAssignedWeight,
        vehicleId: trip.vehicle.id,
        vehicleLicensePlate: trip.vehicle.licensePlate,
      }
    })

    return {
      dispatchableOrders: mappedOrders,
      drivers: mappedDrivers,
      hubId,
      pendingTrips: mappedPendingTrips,
      summary: {
        availableDriverCount: mappedDrivers.filter((driver) => driver.isAvailable).length,
        availableVehicleCount: mappedVehicles.filter((vehicle) => vehicle.isAvailable).length,
        dispatchableOrderCount: mappedOrders.length,
        dispatchableVolume: mappedOrders.reduce((sum, order) => sum + order.totalVolume, 0),
        dispatchableWeight: mappedOrders.reduce((sum, order) => sum + order.totalWeight, 0),
        pendingTripCount: mappedPendingTrips.length,
      },
      vehicles: mappedVehicles,
    }
  }

  /**
   * Lấy dữ liệu Dispatch Board cho Driver.
   * Bao gồm: chuyến đang chạy, đơn có thể nhận, yêu cầu nhận đơn gần đây.
   */
  async getDriverDispatchBoard(actor: AccessTokenPayload): Promise<DriverDispatchBoardResType> {
    const driver = await this.hubHelper.getDriverScopeUser(actor)
    const [activeTrips, completedTripCount, assignableOrders, recentRequests] = await Promise.all([
      this.prismaService.trip.findMany({
        where: {
          driverId: actor.userId,
          status: {
            in: [TRIP_STATUS.PENDING, TRIP_STATUS.IN_PROGRESS],
          },
        },
        include: {
          vehicle: {
            select: {
              id: true,
              licensePlate: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.prismaService.trip.count({
        where: {
          driverId: actor.userId,
          status: TRIP_STATUS.COMPLETED,
        },
      }),
      driver.hubId
        ? this.prismaService.order.findMany({
            where: {
              currentHubId: driver.hubId,
              currentTripId: null,
              deletedAt: null,
              status: {
                in: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB],
              },
              ...DISPATCHABLE_PAYMENT_FILTER,
            },
            orderBy: [{ preferredDeliveryTimeEnd: 'asc' }, { createdAt: 'asc' }],
            select: {
              id: true,
              preferredDeliveryTimeEnd: true,
              preferredDeliveryTimeStart: true,
              receiverAddress: true,
              receiverLat: true,
              receiverLng: true,
              receiverName: true,
              receiverPhone: true,
              senderAddress: true,
              senderLat: true,
              senderLng: true,
              status: true,
              totalVolume: true,
              totalWeight: true,
              trackingCode: true,
            },
          })
        : Promise.resolve([]),
      this.prismaService.driverAssignmentRequest.findMany({
        where: {
          driverId: actor.userId,
        },
        include: this.assignmentHelper.getDriverAssignmentRequestInclude(),
        orderBy: [{ createdAt: 'desc' }],
        take: 12,
      }),
    ])

    const requestByOrderId = new Map<number, DriverAssignmentRequestResType>()
    const mappedRequests = recentRequests.map((request) => this.assignmentHelper.mapDriverAssignmentRequest(request))
    for (const request of mappedRequests) {
      if (!requestByOrderId.has(request.orderId)) {
        requestByOrderId.set(request.orderId, request)
      }
    }

    const activeTrip =
      activeTrips.find((trip) => trip.status === TRIP_STATUS.IN_PROGRESS) ??
      activeTrips.find((trip) => trip.status === TRIP_STATUS.PENDING) ??
      null

    return {
      activeTrip: this.assignmentHelper.mapTripSummary(activeTrip),
      assignableOrders: assignableOrders.map((order) => ({
        ...order,
        request: requestByOrderId.get(order.id) ?? null,
      })),
      hubId: driver.hubId,
      requests: mappedRequests,
      summary: {
        activeTripCount: activeTrips.length,
        assignableOrderCount: assignableOrders.length,
        completedTripCount,
        inProgressTripCount: activeTrips.filter((trip) => trip.status === TRIP_STATUS.IN_PROGRESS).length,
        pendingRequestCount: mappedRequests.filter(
          (request) => request.status === DriverAssignmentRequestStatus.PENDING,
        ).length,
      },
    }
  }
}
