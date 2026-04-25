import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { TripRepository } from '../repository/trip.repository'
import { AUTO_DISPATCH_QUEUE_NAME } from 'src/common/constants/queue.constant'
import { PrismaService } from 'src/database/prisma.service'
import {
  AddOrdersToTripType,
  AssignVehicleType,
  CreateManualTripType,
  DispatchApproveType,
  GetTripListQueryType,
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

  async approveDispatch(dto: DispatchApproveType, actor: AccessTokenPayload) {
    const hubId = await this.resolveHubScope(dto.hubId, actor)
    await this.assertDispatchResourcesBelongToHub(hubId, dto.vehicleId, dto.driverId, dto.orderIds)

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

    const vehicle = await this.prismaService.vehicle.findUnique({
      where: { id: dto.vehicleId },
    })

    if (!vehicle) {
      throw new NotFoundException(`Vehicle #${dto.vehicleId} không tồn tại`)
    }

    if (actor?.roleName === roleName.WAREHOUSE_STAFF) {
      const hubId = await this.resolveHubScope(undefined, actor)
      if (vehicle.hubId !== hubId || trip.vehicle?.hubId !== hubId) {
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
      data: { vehicleId: dto.vehicleId },
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

    // Giả sử trip.ordersOnBoard chứa các điểm đến của đơn hàng.
    // Ta lấy tọa độ của tất cả đơn hàng
    // Lấy hub hiện tại làm điểm xuất phát (nếu có). Trong CSDL ta cần query.
    const orders = await this.prismaService.order.findMany({
      where: { currentTripId: tripId },
      include: { trackingEvents: { orderBy: { occurredAt: 'desc' }, take: 1 } },
    })

    if (orders.length < 2) return trip

    // Giả định order có vĩ độ, kinh độ từ address - nhưng trong DB ta có trackingEvents hoặc customer address.
    // Tạm lấy một số tọa độ giả định để gọi OSRM nếu không có (demo mục đích Tối ưu lộ trình)
    const coordinates = orders.map((o, idx) => ({
      lat: 10.762622 + idx * 0.01, // Vị trí giả định
      lng: 106.660172 + idx * 0.01,
      orderId: o.id,
    }))

    const result = await optimizeRouteWithOSRM(coordinates)

    return {
      message: 'Đã tối ưu lộ trình thành công',
      distance: result.distance,
      duration: result.duration,
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
