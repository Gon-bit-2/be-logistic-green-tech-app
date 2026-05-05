import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { TripRepository } from '../repository/trip.repository'
import { PrismaService } from 'src/database/prisma.service'
import { AUTO_DISPATCH_QUEUE_NAME } from 'src/common/constants/queue.constant'
import { STOP_TYPE } from 'src/common/constants/trip.constant'
import { calculateHaversineDistance } from 'src/common/utils/geo.util'
import { DispatchApproveType } from '../model/trip.model'
import { TripHubHelper } from './trip-hub.helper'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import roleName from 'src/common/constants/role.constant'
import { TripCapacityService } from './trip-capacity.service'
import { EVENT_SOURCE } from 'src/common/constants/tracking.constant'

/**
 * Service xử lý logic điều phối tự động (Auto-Dispatch).
 *
 * Bao gồm:
 * - autoDispatchLocalTask: Đẩy job dispatch cho 1 Hub vào BullMQ
 * - autoDispatchGlobalTask: Fan-out N jobs cho N Hubs
 * - previewDispatch: Xem trước kết quả gom chuyến (Bin Packing preview)
 * - approveDispatch: Duyệt gợi ý dispatch thành Trip thực tế
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name)

  constructor(
    @InjectQueue(AUTO_DISPATCH_QUEUE_NAME)
    private readonly autoDispatchQueue: Queue,
    private readonly tripRepo: TripRepository,
    private readonly prismaService: PrismaService,
    private readonly hubHelper: TripHubHelper,
    private readonly tripCapacityService: TripCapacityService,
  ) {}

  /**
   * Truyền 1 Hub id vào Queue để worker ngầm xử lý riêng cho cụm Hub này.
   * Sử dụng jobId cố định theo hubId để BullMQ tự chặn duplicate job.
   */
  async autoDispatchLocalTask(hubId: number) {
    const jobId = `dispatch-hub-${hubId}`
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

    const jobsToQueue = activeHubs.map((hub) => ({
      name: 'dispatch-local',
      data: { hubId: hub.id },
      opts: { jobId: `dispatch-hub-${hub.id}` },
    }))

    const addedJobs = await this.autoDispatchQueue.addBulk(jobsToQueue)

    return {
      message: `Quá trình gom chuyến toàn hệ thống đã khởi tạo. Hệ thống sẽ tối ưu đồng thời trên ${activeHubs.length} cụm kho trung chuyển.`,
      jobId: addedJobs.map((j) => j.id).join(','),
    }
  }

  /**
   * Xem trước kết quả gom chuyến (Bin Packing preview) cho 1 Hub.
   * Trả về danh sách gợi ý: mỗi xe chở đơn nào, stops thế nào.
   */
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
      hubId = await this.hubHelper.resolveHubScope(requestedHubId, actor)
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

  /**
   * Duyệt gợi ý dispatch: Tạo Trip thực tế từ gợi ý đã được Admin/Staff chấp thuận.
   */
  async approveDispatch(dto: DispatchApproveType, actor: AccessTokenPayload) {
    const hubId = await this.hubHelper.resolveHubScope(dto.hubId, actor)
    await this.hubHelper.assertDispatchResourcesBelongToHub(hubId, dto.vehicleId, dto.driverId, dto.orderIds)
    await this.hubHelper.assertDriverAndVehicleAvailability(dto.vehicleId, dto.driverId)
    await this.tripCapacityService.assertVehicleCapacityForOrders({
      orderIds: dto.orderIds,
      vehicleId: dto.vehicleId,
    })

    const stops = this.normalizeAndValidateApproveStops(dto)

    return this.tripRepo.createTripWithStops(
      dto.vehicleId,
      dto.driverId,
      dto.orderIds,
      stops,
      undefined,
      {
        stateCreatedById: actor.userId,
        stateSource: actor.roleName === roleName.WAREHOUSE_STAFF ? EVENT_SOURCE.HUB_SCANNER : EVENT_SOURCE.ADMIN_PORTAL,
      },
    )
  }

  private normalizeAndValidateApproveStops(dto: DispatchApproveType) {
    const orderIdSet = new Set(dto.orderIds)
    const stops =
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
      }))

    const invalidStopOrderIds = stops
      .map((stop) => stop.orderId)
      .filter((orderId): orderId is number => orderId != null && !orderIdSet.has(orderId))

    if (invalidStopOrderIds.length) {
      throw new BadRequestException(`Stop chứa đơn không thuộc dispatch: ${invalidStopOrderIds.join(', ')}`)
    }

    const stopsByOrderId = new Set(
      stops.map((stop) => stop.orderId).filter((orderId): orderId is number => orderId != null),
    )
    const missingStopOrderIds = dto.orderIds.filter((orderId) => !stopsByOrderId.has(orderId))
    if (missingStopOrderIds.length) {
      throw new BadRequestException(`Thiếu stop cho đơn hàng: ${missingStopOrderIds.join(', ')}`)
    }

    const invalidHubOnlyStops = stops.filter((stop) => stop.orderId == null && stop.hubId == null)
    if (invalidHubOnlyStops.length) {
      throw new BadRequestException('Stop không gắn đơn hàng phải gắn hub hợp lệ.')
    }

    return stops
  }
}
