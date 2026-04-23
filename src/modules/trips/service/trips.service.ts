import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { TripRepository } from '../repository/trip.repository'
import { AUTO_DISPATCH_QUEUE_NAME } from 'src/common/constants/queue.constant'
import { PrismaService } from 'src/database/prisma.service'
import { AddOrdersToTripType, AssignVehicleType, CreateManualTripType, GetTripListQueryType } from '../model/trip.model'
import { TripStatusType, TRIP_STATUS, STOP_TYPE } from 'src/common/constants/strip.constant'
import { GamificationService } from '../../green-tech/service/gamification.service'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { BadRequestException } from '@nestjs/common'
import { optimizeRouteWithOSRM } from 'src/common/utils/routing.util'

@Injectable()
export class TripsService {
  constructor(
    @InjectQueue(AUTO_DISPATCH_QUEUE_NAME)
    private readonly autoDispatchQueue: Queue,
    private readonly tripRepo: TripRepository,
    private readonly prismaService: PrismaService, // Dùng để fetch danh sách Hub khi chạy Global
    private readonly gamificationService: GamificationService,
    private readonly eventEmitter: EventEmitter2,
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

  async findAll(query: GetTripListQueryType) {
    return this.tripRepo.findAll(query)
  }

  async createManualTrip(dto: CreateManualTripType) {
    const { orderIds, vehicleId, driverId } = dto

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

  async assignVehicleToTrip(tripId: number, dto: AssignVehicleType) {
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

  async addOrdersToTrip(tripId: number, dto: AddOrdersToTripType) {
    const trip = await this.tripRepo.findById(tripId)
    if (!trip) {
      throw new NotFoundException(`Trip #${tripId} không tồn tại`)
    }

    if (trip.status !== TRIP_STATUS.PENDING) {
      throw new BadRequestException('Chỉ có thể thêm đơn hàng vào chuyến xe đang chờ')
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

  async updateStatus(id: number, status: TripStatusType) {
    const trip = await this.tripRepo.findById(id)
    if (!trip) throw new NotFoundException(`Trip #${id} không tồn tại`)

    // Nếu chuyển sang COMPLETED → chạy logic nghiệp vụ hoàn thành chuyến xe
    if (status === 'COMPLETED') {
      return this.completeTrip(id)
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

  private async completeTrip(tripId: number) {
    // Lấy danh sách tất cả Hub active để tìm Hub đích cho đơn liên tỉnh
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

    const result = await this.tripRepo.completeTrip(tripId, allHubs)

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
