import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { TripRepository } from '../repository/trip.repository'
import { AUTO_DISPATCH_QUEUE_NAME } from 'src/common/constants/queue.constant'
import { PrismaService } from 'src/database/prisma.service'
import {
  AddOrdersToTripType,
  ApproveDriverAssignmentRequestType,
  AssignmentRequestInboxResType,
  AssignVehicleType,
  CreateDriverAssignmentRequestType,
  CreateManualTripType,
  DispatchBoardResType,
  DispatchApproveType,
  DriverAssignmentRequestListResType,
  DriverAssignmentRequestResType,
  DriverDispatchBoardResType,
  GetTripListQueryType,
  RejectDriverAssignmentRequestType,
  UpdateTripStatusType,
} from '../model/trip.model'
import { TripStatusType, TRIP_STATUS, STOP_TYPE } from 'src/common/constants/strip.constant'
import { GamificationService } from '../../green-tech/service/gamification.service'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { BadRequestException } from '@nestjs/common'
import { optimizeRouteWithOSRM } from 'src/common/utils/routing.util'
import { calculateHaversineDistance } from 'src/common/utils/geo.util'
import roleName from 'src/common/constants/role.constant'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import { TrackingRepository } from 'src/modules/tracking/repository/tracking.repo'
import { EVENT_SOURCE, TRACKING_EVENT_TYPE } from 'src/common/constants/tracking.constant'
import type { ProofOfDeliveryInputType } from 'src/modules/tracking/model/tracking.model'
import { DriverAssignmentRequestStatus } from 'src/common/constants/driver-assignment-request.constant'
import { NotificationEventName } from 'src/modules/notification/events/notification.event'

@Injectable()
export class TripsService {
  constructor(
    @InjectQueue(AUTO_DISPATCH_QUEUE_NAME)
    private readonly autoDispatchQueue: Queue,
    private readonly tripRepo: TripRepository,
    private readonly prismaService: PrismaService, // Dùng để fetch danh sách Hub khi chạy Global
    private readonly gamificationService: GamificationService,
    private readonly eventEmitter: EventEmitter2,
    private readonly trackingRepo: TrackingRepository,
  ) {}

  /**
   * Truyền 1 Hub id vào Queue để worker ngầm xử lý riêng cho cụm Hub này.
   * Sử dụng jobId cố định theo hubId để BullMQ tự chặn duplicate job.
   */
  async autoDispatchLocalTask(hubId: number) {
    const jobId = `dispatch-hub-${hubId}`

    // BullMQ enqueue với jobId cố định → nếu job trùng ID đang pending/active thì bị reject
    const job = await this.autoDispatchQueue.add('dispatch-local', { hubId }, { jobId })

    return {
      message: `Đã đưa yêu cầu gom chuyến cho Hub ${hubId} vào hàng đợi xử lý ngầm.`,
      jobId: job.id,
    }
  }

  /**
   * Khi gọi trigger Global, Service đẩy (fan-out) N jobs cho N hubs tương ứng để chạy song song.
   * Mỗi job dùng jobId riêng theo hubId để tránh duplicate.
   */
  async autoDispatchGlobalTask() {
    const activeHubs = await this.prismaService.hub.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
    })

    if (!activeHubs.length) {
      throw new NotFoundException('Không có Hub nào đang hoạt động trong hệ thống.')
    }

    // Chèn hàng loạt Job vào Queue, mỗi Hub 1 jobId riêng biệt
    const jobsToQueue = activeHubs.map((hub) => ({
      name: 'dispatch-local',
      data: { hubId: hub.id },
      opts: { jobId: `dispatch-hub-${hub.id}` },
    }))

    const addedJobs = await this.autoDispatchQueue.addBulk(jobsToQueue)

    return {
      message: `Quá trình gom chuyến toàn hệ thống đã khởi tạo. Hệ thống sẽ tối ưu đồng thời trên ${activeHubs.length} cụm kho trung chuyển.`,
      jobId: addedJobs.map((j) => j.id).join(','), // Trả về list job ID nếu Admin cần debug
    }
  }

  async previewDispatch(requestedHubId: number | undefined, actor: AccessTokenPayload) {
    let hubId: number
    if (actor.roleName === roleName.ADMIN && !requestedHubId) {
      const firstHub = await this.prismaService.hub.findFirst({
        where: { isActive: true, deletedAt: null },
        orderBy: { id: 'asc' },
        select: { id: true },
      })
      if (!firstHub) {
        throw new NotFoundException('Không có Hub nào đang hoạt động trong hệ thống.')
      }
      hubId = firstHub.id
    } else {
      hubId = await this.resolveHubScope(requestedHubId, actor)
    }
    const [vehicles, orders, drivers] = await Promise.all([
      this.tripRepo.findAvailableVehicles(hubId),
      this.tripRepo.findPendingOrders(hubId),
      this.tripRepo.findAvailableDrivers(hubId),
    ])

    const suggestions: {
      hubId: number
      vehicleId: number
      driverId: number
      driverName: string
      orderIds: number[]
      orders: { id: number; trackingCode: string | null; totalWeight: number; totalVolume: number }[]
      totalWeight: number
      totalVolume: number
      vehicleLicensePlate: string
      stops: {
        orderId: number | null
        hubId: number | null
        stopSequence: number
        stopType: string
        expectedArrivalTime?: Date | null
        actualArrivalTime?: Date | null
      }[]
    }[] = []
    const remainingOrders = [...orders]
    const availableDrivers = [...drivers]

    for (const vehicle of vehicles) {
      if (!remainingOrders.length || !availableDrivers.length) break

      let remWeight = vehicle.capacityWeight
      let remVolume = vehicle.capacityVolume
      const assignedOrders: (typeof orders)[number][] = []

      for (const order of remainingOrders) {
        if (order.totalWeight <= remWeight && order.totalVolume <= remVolume) {
          assignedOrders.push(order)
          remWeight -= order.totalWeight
          remVolume -= order.totalVolume
        }
      }

      if (!assignedOrders.length) continue

      const assignedIds = new Set(assignedOrders.map((order) => order.id))
      for (let i = remainingOrders.length - 1; i >= 0; i--) {
        if (assignedIds.has(remainingOrders[i].id)) {
          remainingOrders.splice(i, 1)
        }
      }

      const driver = availableDrivers.shift()!
      suggestions.push({
        hubId,
        vehicleId: vehicle.id,
        driverId: driver.id,
        driverName: driver.fullName,
        orderIds: assignedOrders.map((order) => order.id),
        orders: assignedOrders.map((order) => ({
          id: order.id,
          trackingCode: order.trackingCode,
          totalWeight: order.totalWeight,
          totalVolume: order.totalVolume,
        })),
        totalWeight: assignedOrders.reduce((sum, order) => sum + order.totalWeight, 0),
        totalVolume: assignedOrders.reduce((sum, order) => sum + order.totalVolume, 0),
        vehicleLicensePlate: vehicle.licensePlate,
        stops: assignedOrders.flatMap((order, index) => [
          {
            orderId: order.id,
            hubId: null,
            stopSequence: index * 2 + 1,
            stopType: STOP_TYPE.PICKUP,
            expectedArrivalTime: null,
            actualArrivalTime: null,
          },
          {
            orderId: order.id,
            hubId: null,
            stopSequence: index * 2 + 2,
            stopType:
              calculateHaversineDistance(order.senderLat, order.senderLng, order.receiverLat, order.receiverLng) < 100
                ? STOP_TYPE.DROPOFF
                : STOP_TYPE.HUB_TRANSFER,
            expectedArrivalTime: order.preferredDeliveryTimeEnd ?? null,
            actualArrivalTime: null,
          },
        ]),
      })
    }

    return {
      hubId,
      suggestions,
      unassignedOrderIds: remainingOrders.map((order) => order.id),
      availableDriverIds: availableDrivers.map((driver) => driver.id),
    }
  }

  async getDispatchBoard(requestedHubId: number | undefined, actor: AccessTokenPayload): Promise<DispatchBoardResType> {
    const hubId = await this.resolveDispatchHub(requestedHubId, actor)
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

  async getDriverDispatchBoard(actor: AccessTokenPayload): Promise<DriverDispatchBoardResType> {
    const driver = await this.getDriverScopeUser(actor)
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
        include: this.getDriverAssignmentRequestInclude(),
        orderBy: [{ createdAt: 'desc' }],
        take: 12,
      }),
    ])

    const requestByOrderId = new Map<number, DriverAssignmentRequestResType>()
    const mappedRequests = recentRequests.map((request) => this.mapDriverAssignmentRequest(request))
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
      activeTrip: this.mapTripSummary(activeTrip),
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
        pendingRequestCount: mappedRequests.filter((request) => request.status === DriverAssignmentRequestStatus.PENDING)
          .length,
      },
    }
  }

  async listDriverAssignmentRequests(actor: AccessTokenPayload): Promise<DriverAssignmentRequestListResType> {
    await this.getDriverScopeUser(actor)

    const requests = await this.prismaService.driverAssignmentRequest.findMany({
      where: {
        driverId: actor.userId,
      },
      include: this.getDriverAssignmentRequestInclude(),
      orderBy: [{ createdAt: 'desc' }],
    })

    return {
      data: requests.map((request) => this.mapDriverAssignmentRequest(request)),
      totalItems: requests.length,
    }
  }

  async createDriverAssignmentRequest(
    dto: CreateDriverAssignmentRequestType,
    actor: AccessTokenPayload,
  ): Promise<DriverAssignmentRequestResType> {
    const driver = await this.getDriverScopeUser(actor)
    
    if (!driver.hubId) {
      throw new ForbiddenException('Bạn chưa được phân bổ vào trạm nào nên không thể nhận đơn.')
    }
    
    await this.assertDriverCanRequestOrder(actor.userId)

    const [order, existingRequest] = await Promise.all([
      this.prismaService.order.findFirst({
        where: {
          id: dto.orderId,
          currentHubId: driver.hubId,
          currentTripId: null,
          deletedAt: null,
          status: {
            in: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB],
          },
        },
        select: {
          id: true,
          trackingCode: true,
        },
      }),
      this.prismaService.driverAssignmentRequest.findFirst({
        where: {
          orderId: dto.orderId,
          driverId: actor.userId,
          status: DriverAssignmentRequestStatus.PENDING,
        },
        select: { id: true },
      }),
    ])

    if (!order) {
      throw new BadRequestException('Đơn hàng không còn khả dụng để gửi yêu cầu nhận.')
    }

    if (existingRequest) {
      throw new BadRequestException('Bạn đã gửi yêu cầu nhận đơn này và đang chờ staff xử lý.')
    }

    const request = await this.prismaService.driverAssignmentRequest.create({
      data: {
        driverId: actor.userId,
        hubId: driver.hubId,
        orderId: dto.orderId,
      },
      include: this.getDriverAssignmentRequestInclude(),
    })

    const recipients = await this.prismaService.user.findMany({
      where: {
        deletedAt: null,
        hubId: driver.hubId,
        isDeleted: false,
        role: {
          name: roleName.WAREHOUSE_STAFF,
        },
      },
      select: { id: true },
    })

    if (recipients.length > 0) {
      await this.emitNotificationEvent(NotificationEventName.DRIVER_ASSIGNMENT_REQUEST_SUBMITTED, {
        assignmentRequestId: request.id,
        driverFullName: driver.fullName,
        driverId: actor.userId,
        hubId: driver.hubId,
        orderId: order.id,
        orderTrackingCode: order.trackingCode ?? `ORD-${order.id}`,
        recipientUserIds: recipients.map((recipient) => recipient.id),
      })
    }

    return this.mapDriverAssignmentRequest(request)
  }

  async listAssignmentRequests(actor: AccessTokenPayload): Promise<AssignmentRequestInboxResType> {
    const hubId = await this.resolveHubScope(undefined, actor)
    const requests = await this.prismaService.driverAssignmentRequest.findMany({
      where: {
        hubId,
        status: DriverAssignmentRequestStatus.PENDING,
      },
      include: this.getDriverAssignmentRequestInclude(),
      orderBy: [{ createdAt: 'desc' }],
    })

    const driverIds = [...new Set(requests.map((request) => request.driverId))]
    const pendingTrips = driverIds.length
      ? await this.prismaService.trip.findMany({
          where: {
            driverId: { in: driverIds },
            status: TRIP_STATUS.PENDING,
            vehicle: {
              hubId,
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
        })
      : []

    const pendingTripsByDriver = pendingTrips.reduce<Record<number, typeof pendingTrips>>((acc, trip) => {
      if (!acc[trip.driverId]) {
        acc[trip.driverId] = []
      }
      acc[trip.driverId].push(trip)
      return acc
    }, {})

    return {
      data: requests.map((request) => ({
        ...this.mapDriverAssignmentRequest(request),
        order: {
          id: request.order.id,
          receiverAddress: request.order.receiverAddress,
          receiverName: request.order.receiverName,
          senderAddress: request.order.senderAddress,
          status: request.order.status,
          totalVolume: request.order.totalVolume,
          totalWeight: request.order.totalWeight,
          trackingCode: request.order.trackingCode,
        },
        pendingTripsForDriver: (pendingTripsByDriver[request.driverId] ?? []).map((trip) => this.mapTripSummary(trip)!),
      })),
      totalItems: requests.length,
    }
  }

  async approveAssignmentRequest(
    requestId: number,
    dto: ApproveDriverAssignmentRequestType,
    actor: AccessTokenPayload,
  ): Promise<DriverAssignmentRequestResType> {
    const hubId = await this.resolveHubScope(undefined, actor)
    const request = await this.prismaService.driverAssignmentRequest.findUnique({
      where: { id: requestId },
      include: this.getDriverAssignmentRequestInclude(),
    })

    if (!request || request.hubId !== hubId) {
      throw new NotFoundException('Không tìm thấy yêu cầu nhận đơn trong hub của bạn.')
    }

    if (request.status !== DriverAssignmentRequestStatus.PENDING) {
      throw new BadRequestException('Yêu cầu này không còn ở trạng thái chờ xử lý.')
    }

    const isAssignableOrderStatus =
      request.order.status === ORDER_STATUS.PENDING ||
      request.order.status === ORDER_STATUS.ARRIVED_AT_HUB

    if (request.order.currentTripId || !isAssignableOrderStatus) {
      await this.prismaService.driverAssignmentRequest.update({
        where: { id: requestId },
        data: {
          reviewedAt: new Date(),
          reviewedById: actor.userId,
          status: DriverAssignmentRequestStatus.CANCELLED,
        },
      })
      throw new BadRequestException('Đơn hàng không còn khả dụng để duyệt yêu cầu này.')
    }

    const pendingTrips = await this.prismaService.trip.findMany({
      where: {
        driverId: request.driverId,
        status: TRIP_STATUS.PENDING,
        vehicle: {
          hubId,
        },
      },
      include: {
        stops: true,
        vehicle: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    })

    let approvedRequest

    if (pendingTrips.length === 1) {
      approvedRequest = await this.addOrderToApprovedAssignmentRequest(pendingTrips[0], request, actor.userId)
    } else if (pendingTrips.length > 1) {
      if (!dto.tripId) {
        throw new BadRequestException('Tài xế đang có nhiều chuyến chờ. Hãy chọn đúng chuyến để thêm đơn.')
      }

      const selectedTrip = pendingTrips.find((trip) => trip.id === dto.tripId)
      if (!selectedTrip) {
        throw new BadRequestException('Chuyến chờ được chọn không hợp lệ cho tài xế này.')
      }

      approvedRequest = await this.addOrderToApprovedAssignmentRequest(selectedTrip, request, actor.userId)
    } else {
      if (!dto.vehicleId) {
        throw new BadRequestException('Cần chọn xe để tạo chuyến mới cho tài xế.')
      }

      await this.assertDispatchResourcesBelongToHub(hubId, dto.vehicleId, request.driverId, [request.orderId])
      await this.assertDriverHasNoInProgressTrip(request.driverId)

      const createdTrip = await this.tripRepo.createTripWithStops(
        dto.vehicleId,
        request.driverId,
        [request.orderId],
        [
          {
            orderId: request.orderId,
            hubId: request.order.currentHubId,
            stopSequence: 1,
            stopType:
              calculateHaversineDistance(
                request.order.senderLat,
                request.order.senderLng,
                request.order.receiverLat,
                request.order.receiverLng,
              ) < 100
                ? STOP_TYPE.DROPOFF
                : STOP_TYPE.HUB_TRANSFER,
          },
        ],
        undefined,
        {
          assignmentRequestToApproveId: requestId,
        },
      )

      if (!createdTrip) {
        throw new BadRequestException('Không thể tạo chuyến mới từ yêu cầu này vì đơn hàng đã thay đổi trạng thái.')
      }

      approvedRequest = await this.prismaService.driverAssignmentRequest.update({
        where: { id: requestId },
        data: {
          reviewedAt: new Date(),
          reviewedById: actor.userId,
          status: DriverAssignmentRequestStatus.APPROVED,
        },
        include: this.getDriverAssignmentRequestInclude(),
      })
    }

    await this.emitNotificationEvent(NotificationEventName.DRIVER_ASSIGNMENT_REQUEST_REVIEWED, {
      assignmentRequestId: approvedRequest.id,
      driverId: approvedRequest.driverId,
      hubId: approvedRequest.hubId,
      orderId: approvedRequest.orderId,
      orderTrackingCode: approvedRequest.order.trackingCode ?? `ORD-${approvedRequest.orderId}`,
      reviewNote: approvedRequest.reviewNote ?? null,
      reviewedById: actor.userId,
      status: DriverAssignmentRequestStatus.APPROVED,
      userId: approvedRequest.driverId,
    })

    return this.mapDriverAssignmentRequest(approvedRequest)
  }

  async rejectAssignmentRequest(
    requestId: number,
    dto: RejectDriverAssignmentRequestType,
    actor: AccessTokenPayload,
  ): Promise<DriverAssignmentRequestResType> {
    const hubId = await this.resolveHubScope(undefined, actor)
    const request = await this.prismaService.driverAssignmentRequest.findUnique({
      where: { id: requestId },
      include: this.getDriverAssignmentRequestInclude(),
    })

    if (!request || request.hubId !== hubId) {
      throw new NotFoundException('Không tìm thấy yêu cầu nhận đơn trong hub của bạn.')
    }

    if (request.status !== DriverAssignmentRequestStatus.PENDING) {
      throw new BadRequestException('Yêu cầu này không còn ở trạng thái chờ xử lý.')
    }

    const rejectedRequest = await this.prismaService.driverAssignmentRequest.update({
      where: { id: requestId },
      data: {
        reviewNote: dto.reviewNote,
        reviewedAt: new Date(),
        reviewedById: actor.userId,
        status: DriverAssignmentRequestStatus.REJECTED,
      },
      include: this.getDriverAssignmentRequestInclude(),
    })

    await this.emitNotificationEvent(NotificationEventName.DRIVER_ASSIGNMENT_REQUEST_REVIEWED, {
      assignmentRequestId: rejectedRequest.id,
      driverId: rejectedRequest.driverId,
      hubId: rejectedRequest.hubId,
      orderId: rejectedRequest.orderId,
      orderTrackingCode: rejectedRequest.order.trackingCode ?? `ORD-${rejectedRequest.orderId}`,
      reviewNote: rejectedRequest.reviewNote ?? null,
      reviewedById: actor.userId,
      status: DriverAssignmentRequestStatus.REJECTED,
      userId: rejectedRequest.driverId,
    })

    return this.mapDriverAssignmentRequest(rejectedRequest)
  }

  async approveDispatch(dto: DispatchApproveType, actor: AccessTokenPayload) {
    const hubId = await this.resolveHubScope(dto.hubId, actor)
    await this.assertDispatchResourcesBelongToHub(hubId, dto.vehicleId, dto.driverId, dto.orderIds)
    await this.assertDriverAndVehicleAvailability(dto.vehicleId, dto.driverId)

    return this.tripRepo.createTripWithStops(
      dto.vehicleId,
      dto.driverId,
      dto.orderIds,
      dto.stops?.map((stop) => ({
        orderId: stop.orderId ?? null,
        hubId: stop.hubId ?? null,
        stopSequence: stop.stopSequence,
        stopType: stop.stopType,
        expectedArrivalTime: stop.expectedArrivalTime ?? null,
        actualArrivalTime: stop.actualArrivalTime ?? null,
      })) ??
        dto.orderIds.map((orderId, index) => ({
          orderId,
          hubId: null,
          stopSequence: index + 1,
          stopType: STOP_TYPE.DROPOFF,
          expectedArrivalTime: null,
          actualArrivalTime: null,
        })),
    )
  }

  async findAll(query: GetTripListQueryType, actor?: AccessTokenPayload) {
    if (actor?.roleName === roleName.WAREHOUSE_STAFF) {
      const hubId = await this.resolveHubScope(undefined, actor)
      return this.tripRepo.findAll({ ...query, hubId })
    }

    return this.tripRepo.findAll(query)
  }

  async createManualTrip(dto: CreateManualTripType, actor?: AccessTokenPayload) {
    const { orderIds, vehicleId, driverId } = dto
    const hubId = actor ? await this.resolveHubScope(dto.hubId, actor) : dto.hubId
    if (hubId) {
      await this.assertDispatchResourcesBelongToHub(hubId, vehicleId, driverId, orderIds)
    }
    await this.assertDriverAndVehicleAvailability(vehicleId, driverId)

    const vehicle = await this.prismaService.vehicle.findUnique({
      where: { id: vehicleId },
    })

    if (!vehicle) {
      throw new NotFoundException(`Vehicle #${vehicleId} không tồn tại`)
    }

    const orders = await this.prismaService.order.findMany({
      where: {
        id: { in: orderIds },
        status: { in: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB] },
      },
    })

    if (orders.length === 0) {
      throw new BadRequestException('Không có đơn hàng hợp lệ nào được chọn')
    }

    const totalWeight = orders.reduce((sum, o) => sum + o.totalWeight, 0)

    if (totalWeight > vehicle.capacityWeight) {
      throw new BadRequestException(
        `Tổng trọng lượng đơn hàng (${totalWeight}kg) vượt quá tải trọng xe (${vehicle.capacityWeight}kg)`,
      )
    }

    // Map orders as simple stops for demonstration (in reality, requires proper route planning)
    const stopsData = orders.map((o, idx) => ({
      orderId: o.id,
      hubId: o.currentHubId,
      stopSequence: idx + 1,
      stopType: STOP_TYPE.DROPOFF,
    }))

    const trip = await this.tripRepo.createTripWithStops(
      vehicleId,
      driverId,
      orders.map((o) => o.id),
      stopsData,
    )

    if (!trip) {
      throw new BadRequestException('Không thể tạo chuyến xe, vui lòng thử lại')
    }

    this.eventEmitter.emit('trip.created', { trip })

    return trip
  }

  async assignVehicleToTrip(tripId: number, dto: AssignVehicleType, actor?: AccessTokenPayload) {
    const trip = await this.tripRepo.findById(tripId)
    if (!trip) {
      throw new NotFoundException(`Trip #${tripId} không tồn tại`)
    }
    if (trip.status !== TRIP_STATUS.PENDING) {
      throw new BadRequestException('Chỉ có thể điều chỉnh chuyến đang chờ khởi hành')
    }

    const vehicle = await this.prismaService.vehicle.findUnique({
      where: { id: dto.vehicleId },
    })

    if (!vehicle) {
      throw new NotFoundException(`Vehicle #${dto.vehicleId} không tồn tại`)
    }

    const driverId = dto.driverId ?? trip.driverId
    const tripHubId = this.inferTripHubId(trip)

    if (tripHubId) {
      const currentOrderIds = trip.stops.map((s) => s.orderId).filter((id): id is number => id !== null)
      await this.assertDispatchResourcesBelongToHub(tripHubId, dto.vehicleId, driverId, currentOrderIds)
    }
    await this.assertDriverAndVehicleAvailability(dto.vehicleId, driverId, tripId)

    if (actor?.roleName === roleName.WAREHOUSE_STAFF) {
      const hubId = await this.resolveHubScope(undefined, actor)
      if (vehicle.hubId !== hubId || tripHubId !== hubId) {
        throw new ForbiddenException('Error.PermissionDenied.NotYourHub')
      }
    }

    // Calculate current trip weight
    const currentOrdersCount = trip.stops.filter((s) => s.orderId).length
    if (currentOrdersCount > 0) {
      const orderIds = trip.stops.map((s) => s.orderId).filter((id): id is number => id !== null)
      const orders = await this.prismaService.order.findMany({
        where: { id: { in: orderIds } },
      })
      const currentWeight = orders.reduce((sum, o) => sum + o.totalWeight, 0)
      if (currentWeight > vehicle.capacityWeight) {
        throw new BadRequestException(
          `Trọng lượng chuyến xe hiện tại (${currentWeight}kg) vượt quá tải trọng xe mới (${vehicle.capacityWeight}kg)`,
        )
      }
    }

    const updatedTrip = await this.prismaService.trip.update({
      where: { id: tripId },
      data: { driverId, vehicleId: dto.vehicleId },
      include: { stops: true },
    })

    return updatedTrip
  }

  async addOrdersToTrip(tripId: number, dto: AddOrdersToTripType, actor?: AccessTokenPayload) {
    const trip = await this.tripRepo.findById(tripId)
    if (!trip) {
      throw new NotFoundException(`Trip #${tripId} không tồn tại`)
    }

    if (trip.status !== TRIP_STATUS.PENDING) {
      throw new BadRequestException('Chỉ có thể thêm đơn hàng vào chuyến xe đang chờ')
    }

    if (actor?.roleName === roleName.WAREHOUSE_STAFF) {
      const hubId = await this.resolveHubScope(undefined, actor)
      await this.assertOrdersBelongToHub(hubId, dto.orderIds)
      if (trip.vehicle?.hubId !== hubId) {
        throw new ForbiddenException('Error.PermissionDenied.NotYourHub')
      }
    }

    const ordersToAdd = await this.prismaService.order.findMany({
      where: {
        id: { in: dto.orderIds },
        status: { in: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB] },
      },
    })

    if (ordersToAdd.length === 0) {
      throw new BadRequestException('Không có đơn hàng nào hợp lệ để thêm')
    }

    // Get current orders
    const currentOrderIds = trip.stops.map((s) => s.orderId).filter((id): id is number => id !== null)
    const currentOrders = await this.prismaService.order.findMany({
      where: { id: { in: currentOrderIds } },
    })

    const totalWeight =
      currentOrders.reduce((sum, o) => sum + o.totalWeight, 0) + ordersToAdd.reduce((sum, o) => sum + o.totalWeight, 0)

    const vehicle = await this.prismaService.vehicle.findUnique({
      where: { id: trip.vehicleId },
    })

    if (!vehicle || totalWeight > vehicle.capacityWeight) {
      throw new BadRequestException(
        `Tổng trọng lượng mới (${totalWeight}kg) sẽ vượt quá tải trọng xe (${vehicle?.capacityWeight}kg)`,
      )
    }

    let lastSequence = trip.stops.length > 0 ? Math.max(...trip.stops.map((s) => s.stopSequence)) : 0

    const newStops = ordersToAdd.map((o) => {
      lastSequence++
      return {
        tripId,
        orderId: o.id,
        hubId: o.currentHubId,
        stopSequence: lastSequence,
        stopType: STOP_TYPE.DROPOFF,
      }
    })

    const updatedTrip = await this.prismaService.$transaction(async (tx) => {
      await tx.tripStop.createMany({ data: newStops })

      await tx.order.updateMany({
        where: { id: { in: ordersToAdd.map((o) => o.id) } },
        data: { status: ORDER_STATUS.ASSIGNED, currentTripId: tripId },
      })

      await tx.driverAssignmentRequest.updateMany({
        where: {
          orderId: { in: ordersToAdd.map((o) => o.id) },
          status: DriverAssignmentRequestStatus.PENDING,
        },
        data: {
          reviewedAt: new Date(),
          status: DriverAssignmentRequestStatus.CANCELLED,
        },
      })

      return tx.trip.findUnique({
        where: { id: tripId },
        include: { stops: true },
      })
    })

    return updatedTrip
  }

  async findById(id: number) {
    const trip = await this.tripRepo.findById(id)
    if (!trip) {
      throw new NotFoundException(`Không tìm thấy Trip #${id}`)
    }
    return trip
  }

  private getDriverAssignmentRequestInclude() {
    return {
      driver: {
        select: {
          fullName: true,
          id: true,
        },
      },
      order: {
        select: {
          currentHubId: true,
          currentTrip: {
            include: {
              vehicle: {
                select: {
                  id: true,
                  licensePlate: true,
                },
              },
            },
          },
          currentTripId: true,
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
      },
    } as const
  }

  private mapTripSummary(trip: any) {
    if (!trip?.vehicle) {
      return null
    }

    return {
      id: trip.id,
      status: trip.status,
      vehicleId: trip.vehicle.id,
      vehicleLicensePlate: trip.vehicle.licensePlate,
    }
  }

  private mapDriverAssignmentRequest(request: any): DriverAssignmentRequestResType {
    return {
      createdAt: request.createdAt,
      driverId: request.driverId,
      driverName: request.driver?.fullName ?? `Tài xế #${request.driverId}`,
      hubId: request.hubId,
      id: request.id,
      orderId: request.orderId,
      orderTrackingCode: request.order?.trackingCode ?? `ORD-${request.orderId}`,
      reviewNote: request.reviewNote ?? null,
      reviewedAt: request.reviewedAt ?? null,
      reviewedById: request.reviewedById ?? null,
      status: request.status,
      trip: this.mapTripSummary(request.order?.currentTrip),
    }
  }

  private async getDriverScopeUser(actor: AccessTokenPayload) {
    if (actor.roleName !== roleName.DRIVER) {
      throw new ForbiddenException('Error.PermissionDenied.NotDriver')
    }

    const driver = await this.prismaService.user.findFirst({
      where: {
        id: actor.userId,
        deletedAt: null,
        isDeleted: false,
        role: {
          name: roleName.DRIVER,
        },
      },
      select: {
        fullName: true,
        hubId: true,
        id: true,
      },
    })

    return {
      ...driver,
      hubId: driver?.hubId ?? null,
    }
  }

  private async assertDriverHasNoInProgressTrip(driverId: number) {
    const activeTrip = await this.prismaService.trip.findFirst({
      where: {
        driverId,
        status: TRIP_STATUS.IN_PROGRESS,
      },
      select: { id: true },
    })

    if (activeTrip) {
      throw new BadRequestException(`Tài xế #${driverId} đang chạy chuyến #${activeTrip.id}, chưa thể xin thêm đơn.`)
    }
  }

  private async assertDriverCanRequestOrder(driverId: number) {
    await this.assertDriverHasNoInProgressTrip(driverId)
  }

  private async addOrderToApprovedAssignmentRequest(trip: any, request: any, reviewedById: number) {
    if (trip.status !== TRIP_STATUS.PENDING) {
      throw new BadRequestException('Chỉ có thể thêm đơn vào chuyến đang chờ khởi hành.')
    }

    const currentOrderIds = trip.stops.map((stop: { orderId?: number | null }) => stop.orderId).filter((id: number | null) => id != null)
    const currentOrders = currentOrderIds.length
      ? await this.prismaService.order.findMany({
          where: {
            id: { in: currentOrderIds },
          },
          select: {
            totalWeight: true,
          },
        })
      : []
    const totalWeight =
      currentOrders.reduce((sum: number, order: { totalWeight: number }) => sum + order.totalWeight, 0) +
      request.order.totalWeight

    if (!trip.vehicle || totalWeight > trip.vehicle.capacityWeight) {
      throw new BadRequestException(
        `Tổng trọng lượng mới (${totalWeight}kg) sẽ vượt quá tải trọng xe (${trip.vehicle?.capacityWeight}kg)`,
      )
    }

    const nextSequence =
      (trip.stops.length > 0 ? Math.max(...trip.stops.map((stop: { stopSequence: number }) => stop.stopSequence)) : 0) + 1
    const nextStopType =
      calculateHaversineDistance(
        request.order.senderLat,
        request.order.senderLng,
        request.order.receiverLat,
        request.order.receiverLng,
      ) < 100
        ? STOP_TYPE.DROPOFF
        : STOP_TYPE.HUB_TRANSFER

    const updatedRequest = await this.prismaService.$transaction(async (tx) => {
      const orderUpdate = await tx.order.updateMany({
        where: {
          currentTripId: null,
          id: request.orderId,
          status: {
            in: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB],
          },
        },
        data: {
          currentTripId: trip.id,
          status: ORDER_STATUS.ASSIGNED,
        },
      })

      if (orderUpdate.count === 0) {
        throw new BadRequestException('Đơn hàng không còn khả dụng để thêm vào chuyến.')
      }

      await tx.tripStop.create({
        data: {
          hubId: request.order.currentHubId,
          orderId: request.orderId,
          stopSequence: nextSequence,
          stopType: nextStopType,
          tripId: trip.id,
        },
      })

      await tx.driverAssignmentRequest.updateMany({
        where: {
          id: { not: request.id },
          orderId: request.orderId,
          status: DriverAssignmentRequestStatus.PENDING,
        },
        data: {
          reviewedAt: new Date(),
          status: DriverAssignmentRequestStatus.CANCELLED,
        },
      })

      await tx.driverAssignmentRequest.update({
        where: { id: request.id },
        data: {
          reviewedAt: new Date(),
          reviewedById,
          status: DriverAssignmentRequestStatus.APPROVED,
        },
      })

      return tx.driverAssignmentRequest.findUnique({
        where: { id: request.id },
        include: this.getDriverAssignmentRequestInclude(),
      })
    })

    if (!updatedRequest) {
      throw new NotFoundException('Không thể tải lại yêu cầu sau khi duyệt.')
    }

    return updatedRequest
  }

  private async emitNotificationEvent(eventName: string, payload: unknown) {
    try {
      await this.eventEmitter.emitAsync(eventName, payload)
    } catch (error) {
      console.warn(
        `Notification event failed for ${eventName}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async resolveHubScope(requestedHubId: number | undefined, actor: AccessTokenPayload) {
    if (actor.roleName !== roleName.WAREHOUSE_STAFF) {
      if (!requestedHubId) {
        throw new BadRequestException('Cần chọn hub để điều phối chuyến')
      }
      return requestedHubId
    }

    const warehouseUser = await this.prismaService.user.findFirst({
      where: { id: actor.userId, deletedAt: null, isDeleted: false },
      select: { hubId: true },
    })

    if (!warehouseUser?.hubId) {
      throw new ForbiddenException('Error.PermissionDenied.UserHasNoHub')
    }

    if (requestedHubId && requestedHubId !== warehouseUser.hubId) {
      throw new ForbiddenException('Error.PermissionDenied.NotYourHub')
    }

    return warehouseUser.hubId
  }

  private async resolveDispatchHub(requestedHubId: number | undefined, actor: AccessTokenPayload) {
    if (actor.roleName === roleName.ADMIN && !requestedHubId) {
      const firstHub = await this.prismaService.hub.findFirst({
        where: { isActive: true, deletedAt: null },
        orderBy: { id: 'asc' },
        select: { id: true },
      })

      if (!firstHub) {
        throw new NotFoundException('Không có Hub nào đang hoạt động trong hệ thống.')
      }

      return firstHub.id
    }

    return this.resolveHubScope(requestedHubId, actor)
  }

  private inferTripHubId(trip: {
    stops?: Array<{ order?: { currentHubId?: number | null } | null }>
    vehicle?: { hubId?: number | null } | null
  }) {
    if (trip.vehicle?.hubId) {
      return trip.vehicle.hubId
    }

    return trip.stops?.find((stop) => stop.order?.currentHubId)?.order?.currentHubId ?? null
  }

  private async assertDispatchResourcesBelongToHub(
    hubId: number,
    vehicleId: number,
    driverId: number,
    orderIds: number[],
  ) {
    const [vehicle, driver] = await Promise.all([
      this.prismaService.vehicle.findFirst({
        where: { id: vehicleId, deletedAt: null, isActive: true },
        select: { id: true, hubId: true },
      }),
      this.prismaService.user.findFirst({
        where: {
          id: driverId,
          deletedAt: null,
          isDeleted: false,
          role: { name: roleName.DRIVER },
        },
        select: { id: true, hubId: true },
      }),
    ])

    if (!vehicle) throw new NotFoundException(`Vehicle #${vehicleId} không tồn tại`)
    if (!driver) throw new NotFoundException(`Driver #${driverId} không tồn tại`)
    if (vehicle.hubId !== hubId) throw new BadRequestException('Xe không thuộc hub đang điều phối')
    if (driver.hubId !== hubId) throw new BadRequestException('Tài xế không thuộc hub đang điều phối')

    await this.assertOrdersBelongToHub(hubId, orderIds)
  }

  private async assertOrdersBelongToHub(hubId: number, orderIds: number[]) {
    const orders = await this.prismaService.order.findMany({
      where: {
        id: { in: orderIds },
        deletedAt: null,
        status: { in: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB] },
        currentTripId: null,
      },
      select: { id: true, currentHubId: true },
    })

    const validIds = new Set(orders.filter((order) => order.currentHubId === hubId).map((order) => order.id))
    const invalidIds = orderIds.filter((orderId) => !validIds.has(orderId))
    if (invalidIds.length) {
      throw new BadRequestException(`Đơn hàng không hợp lệ hoặc không thuộc hub: ${invalidIds.join(', ')}`)
    }
  }

  private async assertDriverAndVehicleAvailability(vehicleId: number, driverId: number, excludedTripId?: number) {
    const [activeVehicleTrip, activeDriverTrip] = await Promise.all([
      this.prismaService.trip.findFirst({
        where: {
          id: excludedTripId ? { not: excludedTripId } : undefined,
          status: { in: [TRIP_STATUS.PENDING, TRIP_STATUS.IN_PROGRESS] },
          vehicleId,
        },
        select: { id: true },
      }),
      this.prismaService.trip.findFirst({
        where: {
          driverId,
          id: excludedTripId ? { not: excludedTripId } : undefined,
          status: { in: [TRIP_STATUS.PENDING, TRIP_STATUS.IN_PROGRESS] },
        },
        select: { id: true },
      }),
    ])

    if (activeVehicleTrip) {
      throw new BadRequestException(`Xe #${vehicleId} đang bận ở chuyến #${activeVehicleTrip.id}`)
    }

    if (activeDriverTrip) {
      throw new BadRequestException(`Tài xế #${driverId} đang bận ở chuyến #${activeDriverTrip.id}`)
    }
  }

  private getTrackingSource(actor?: AccessTokenPayload) {
    if (actor?.roleName === roleName.DRIVER) return EVENT_SOURCE.DRIVER_APP
    if (actor?.roleName === roleName.WAREHOUSE_STAFF) return EVENT_SOURCE.HUB_SCANNER
    return EVENT_SOURCE.ADMIN_PORTAL
  }

  private async createStatusEvent(
    createdById: number,
    orderId: number,
    status: (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS],
    source: (typeof EVENT_SOURCE)[keyof typeof EVENT_SOURCE],
    description: string,
    options?: {
      pod?: ProofOfDeliveryInputType
      extraOrderUpdate?: Record<string, unknown>
      codCollection?: {
        amount: number
        driverId: number
        orderReference: string
      }
    },
  ) {
    return this.trackingRepo.createEventWithStatusUpdate(
      createdById,
      {
        orderId,
        eventType: TRACKING_EVENT_TYPE.STATUS_CHANGE,
        status,
        source,
        description,
        pod: options?.pod,
      },
      true,
      {
        extraOrderUpdate: options?.extraOrderUpdate,
        codCollection: options?.codCollection,
      },
    )
  }

  private async startTripWithTracking(tripId: number, actor?: AccessTokenPayload) {
    const trip = await this.tripRepo.findById(tripId)
    if (!trip) throw new NotFoundException(`Trip #${tripId} không tồn tại`)
    if (trip.status !== TRIP_STATUS.PENDING) {
      throw new BadRequestException('Chỉ có thể bắt đầu chuyến đang chờ')
    }

    const createdById = actor?.userId ?? trip.driverId
    const source = this.getTrackingSource(actor)
    const orderMap = new Map<number, any>()
    for (const stop of trip.stops) {
      if (stop.orderId && stop.order) {
        orderMap.set(stop.orderId, stop.order)
      }
    }

    for (const order of orderMap.values()) {
      if (order.status === ORDER_STATUS.ASSIGNED) {
        await this.createStatusEvent(
          createdById,
          order.id,
          ORDER_STATUS.PICKED_UP,
          source,
          `Tài xế đã nhận đơn trên chuyến #${tripId}.`,
        )
        await this.createStatusEvent(
          createdById,
          order.id,
          ORDER_STATUS.IN_TRANSIT,
          source,
          `Chuyến #${tripId} bắt đầu vận chuyển.`,
          { extraOrderUpdate: { currentHubId: null } },
        )
      } else if (order.status === ORDER_STATUS.PICKED_UP) {
        await this.createStatusEvent(
          createdById,
          order.id,
          ORDER_STATUS.IN_TRANSIT,
          source,
          `Chuyến #${tripId} bắt đầu vận chuyển.`,
          { extraOrderUpdate: { currentHubId: null } },
        )
      } else if (order.status !== ORDER_STATUS.IN_TRANSIT) {
        throw new BadRequestException(`Đơn #${order.id} không ở trạng thái sẵn sàng bắt đầu chuyến`)
      }
    }

    return this.tripRepo.updateTripStatus(tripId, TRIP_STATUS.IN_PROGRESS, { startTime: new Date() })
  }

  async updateStatus(id: number, body: UpdateTripStatusType | TripStatusType, actor?: AccessTokenPayload) {
    const status = typeof body === 'string' ? body : body.status
    const trip = await this.tripRepo.findById(id)
    if (!trip) throw new NotFoundException(`Trip #${id} không tồn tại`)

    if (actor?.roleName === roleName.WAREHOUSE_STAFF) {
      const hubId = await this.resolveHubScope(undefined, actor)
      if (trip.vehicle?.hubId !== hubId) {
        throw new ForbiddenException('Error.PermissionDenied.NotYourHub')
      }
    }

    if (status === 'IN_PROGRESS') {
      return this.startTripWithTracking(id, actor)
    }

    // Nếu chuyển sang COMPLETED → chạy logic nghiệp vụ hoàn thành chuyến xe
    if (status === 'COMPLETED') {
      return this.completeTripWithTracking(id, typeof body === 'string' ? undefined : body.podByOrderId, actor)
    }

    // Các trạng thái khác chỉ cần update đơn giản
    return this.tripRepo.updateTripStatus(id, status)
  }

  /**
   * Hoàn thành chuyến xe và xử lý luồng chuyển trạng thái đơn hàng.
   * - Đơn nội ô (DROPOFF)      → DELIVERED
   * - Đơn liên tỉnh (HUB_TRANSFER) → ARRIVED_AT_HUB + chuyển sang Hub đích
   *   → Đơn tự động hiện trong lượt dispatch tiếp ở Hub đích (khép kín vòng lặp)
   */
  async optimizeRouteForTrip(tripId: number) {
    const trip = await this.tripRepo.findById(tripId)
    if (!trip) throw new NotFoundException('Trip not found')

    const coordinates = trip.stops
      .map((stop) => {
        if (stop.stopType === STOP_TYPE.PICKUP && stop.order) {
          return {
            lat: stop.order.senderLat,
            lng: stop.order.senderLng,
            orderId: stop.order.id,
          }
        }

        if (stop.stopType === STOP_TYPE.HUB_TRANSFER && stop.hub) {
          return {
            lat: stop.hub.latitude,
            lng: stop.hub.longitude,
            orderId: stop.orderId ?? 0,
          }
        }

        if (stop.order) {
          return {
            lat: stop.order.receiverLat,
            lng: stop.order.receiverLng,
            orderId: stop.order.id,
          }
        }

        return null
      })
      .filter((coordinate): coordinate is { lat: number; lng: number; orderId: number } => coordinate !== null)

    if (coordinates.length < 2) {
      return {
        distance: 0,
        duration: 0,
        message: 'Không đủ điểm dừng để tối ưu lộ trình',
        polyline: null,
        waypoints: coordinates,
      }
    }

    const result = await optimizeRouteWithOSRM(coordinates)

    return {
      message: 'Đã tối ưu lộ trình thành công',
      distance: result.distance,
      duration: result.duration,
      polyline: result.polyline ?? null,
      waypoints: result.waypoints,
    }
  }

  private async findDestinationHubId(order: { receiverLat: number; receiverLng: number; totalVolume: number }) {
    const allHubs = await this.prismaService.hub.findMany({
      where: { isActive: true, deletedAt: null },
      select: {
        id: true,
        latitude: true,
        longitude: true,
        capacityVolume: true,
        ordersCurrentlyHere: {
          select: { totalVolume: true }, // Lấy thể tích các đơn đang tồn kho để check sức chứa
        },
      },
    })

    let nearestHubId: number | null = null
    let backupHubId: number | null = null
    let minDist = Infinity
    let minAvailableDist = Infinity

    for (const hub of allHubs) {
      const dist = Math.pow(hub.latitude - order.receiverLat, 2) + Math.pow(hub.longitude - order.receiverLng, 2)
      if (dist < minDist) {
        minDist = dist
        backupHubId = hub.id
      }

      const currentOccupiedVolume = hub.ordersCurrentlyHere.reduce((sum, item) => sum + item.totalVolume, 0)
      if (currentOccupiedVolume + order.totalVolume > hub.capacityVolume * 0.9) {
        continue
      }

      if (dist < minAvailableDist) {
        minAvailableDist = dist
        nearestHubId = hub.id
      }
    }

    return nearestHubId ?? backupHubId
  }

  private async completeTripWithTracking(
    tripId: number,
    podByOrderId: Record<string, ProofOfDeliveryInputType> | undefined,
    actor?: AccessTokenPayload,
  ) {
    const trip = await this.tripRepo.findById(tripId)
    if (!trip) throw new NotFoundException(`Trip #${tripId} không tồn tại`)
    if (trip.status !== TRIP_STATUS.IN_PROGRESS) {
      throw new BadRequestException('Chỉ có thể hoàn tất chuyến đang vận chuyển')
    }

    const createdById = actor?.userId ?? trip.driverId
    const source = this.getTrackingSource(actor)
    const terminalStops = trip.stops.filter(
      (stop) => stop.orderId && stop.order && [STOP_TYPE.DROPOFF, STOP_TYPE.HUB_TRANSFER].includes(stop.stopType as any),
    )

    for (const stop of terminalStops) {
      const order = stop.order!
      if (stop.stopType === STOP_TYPE.HUB_TRANSFER) {
        if (order.status !== ORDER_STATUS.IN_TRANSIT) {
          throw new BadRequestException(`Đơn #${order.id} không ở trạng thái sẵn sàng nhập hub`)
        }
        const destinationHubId = await this.findDestinationHubId(order)
        if (!destinationHubId) {
          throw new NotFoundException('Không có hub hoạt động để nhận hàng trung chuyển')
        }
        await this.createStatusEvent(
          createdById,
          order.id,
          ORDER_STATUS.ARRIVED_AT_HUB,
          source,
          `Đơn đã về hub trung chuyển từ chuyến #${tripId}.`,
          {
            extraOrderUpdate: {
              currentTripId: null,
              currentHubId: destinationHubId,
            },
          },
        )
        continue
      }

      const pod = podByOrderId?.[String(order.id)]
      if (!pod) {
        throw new BadRequestException(`Thiếu Proof of Delivery cho đơn #${order.id}`)
      }

      if (order.status === ORDER_STATUS.IN_TRANSIT) {
        await this.createStatusEvent(
          createdById,
          order.id,
          ORDER_STATUS.OUT_FOR_DELIVERY,
          source,
          `Tài xế đang giao đơn từ chuyến #${tripId}.`,
        )
      } else if (order.status !== ORDER_STATUS.OUT_FOR_DELIVERY) {
        throw new BadRequestException(`Đơn #${order.id} không ở trạng thái sẵn sàng giao thành công`)
      }

      const paymentState = await this.prismaService.order.findFirst({
        where: { id: order.id, deletedAt: null },
        select: {
          trackingCode: true,
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
      const shouldCollectCod =
        paymentState?.payment?.method === 'COD' &&
        paymentState.payment.status !== 'COMPLETED' &&
        !paymentState.isCodCollected

      await this.createStatusEvent(
        createdById,
        order.id,
        ORDER_STATUS.DELIVERED,
        source,
        `Đơn đã giao thành công từ chuyến #${tripId}.`,
        {
          pod,
          codCollection: shouldCollectCod
            ? {
                amount: Number(paymentState.payment?.amount ?? 0),
                driverId: trip.driverId,
                orderReference: paymentState.trackingCode || String(order.id),
              }
            : undefined,
        },
      )
    }

    const result = await this.tripRepo.updateTripStatus(tripId, TRIP_STATUS.COMPLETED, { endTime: new Date() })

    // Kích hoạt logic tính toán Gamification CO2 sau khi hoàn thành chuyến (Non-blocking)
    this.gamificationService.processTripEmission(tripId).catch((err) => {
      console.error(`[Gamification Error] Lỗi xử lý điểm cống hiến chuyến xe ${tripId}:`, err)
    })

    return result
  }

  /**
   * Hủy đơn hàng giữa chuyến xe.
   * Cập nhật trạng thái Trip và Order an toàn trong Transaction.
   */
  async cancelOrderFromTrip(tripId: number, orderId: number) {
    const trip = await this.tripRepo.findById(tripId)
    if (!trip) throw new NotFoundException(`Trip #${tripId} không tồn tại`)

    // Gọi repo hủy đơn, reindex các stop sequence và có thể tự hủy trip luôn
    return this.tripRepo.cancelOrderFromTrip(tripId, orderId)
  }
}
