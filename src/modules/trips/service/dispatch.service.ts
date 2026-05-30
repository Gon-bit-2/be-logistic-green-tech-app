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
import { TripCreationService } from './trip-creation.service'

/**
 * Service xử lý logic điều phối tự động (Auto-Dispatch).
 *
 * Bao gồm:
 * - autoDispatchLocalTask: Đẩy job dispatch cho 1 Hub vào BullMQ
 * - autoDispatchGlobalTask: Fan-out N jobs cho N Hubs
 * - previewDispatch: Xem trước kết quả gom chuyến (Bin Packing preview)
 * - approveDispatch: Duyệt gợi ý dispatch thành Trip thực tế
 */
/**
 * Service managing automated and previewed trip dispatches.
 * Service quản lý việc điều phối chuyến đi tự động và xem trước.
 *
 * Implements BullMQ background queues scheduling, bin-packing dispatch previews,
 * and suggested dispatch approvals into persistent database models.
 * Triển khai lập lịch hàng đợi chạy ngầm BullMQ, xem trước điều phối bin-packing,
 * và phê duyệt các gợi ý điều phối thành các chuyến đi lưu vào cơ sở dữ liệu.
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
    private readonly tripCreationService: TripCreationService,
  ) {}

  /**
   * Pushes a local hub auto-dispatch optimization request into BullMQ.
   * Đẩy yêu cầu tối ưu hóa điều phối tự động của Hub cục bộ vào BullMQ.
   *
   * Enforces single-active job constraints per hub utilizing unique hub-specific job IDs.
   * Áp đặt ràng buộc một tác vụ hoạt động duy nhất cho mỗi Hub bằng cách sử dụng ID tác vụ duy nhất.
   *
   * @param {number} hubId - Hub ID.
   * @param {number} hubId - ID của Hub.
   * @returns {Promise<{ message: string; jobId: string }>} Queued job details.
   * @returns {Promise<{ message: string; jobId: string }>} Chi tiết tác vụ đã đưa vào hàng đợi.
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
   * Fan-outs independent auto-dispatch jobs for all active hubs concurrently.
   * Phân tách và đẩy đồng thời các tác vụ điều phối tự động cho tất cả các Hub đang hoạt động.
   *
   * @returns {Promise<{ message: string; jobId: string }>} Triggered global task details.
   * @returns {Promise<{ message: string; jobId: string }>} Chi tiết các tác vụ toàn cầu đã kích hoạt.
   * @throws {NotFoundException} If no active hubs are available.
   * @throws {NotFoundException} Nếu không có Hub nào đang hoạt động trong hệ thống.
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
   * Evaluates available fleet, packages, and drivers to construct preview dispatch suggestions.
   * Đánh giá đội xe, hàng hóa và tài xế khả dụng để xây dựng các gợi ý xem trước điều phối.
   *
   * Implements a greedy bin-packing algorithm matching cargo constraints to electric van capacities.
   * Triển khai thuật toán bin-packing tham lam khớp các ràng buộc hàng hóa với sức chứa xe điện.
   *
   * @param {number | undefined} requestedHubId - Target Hub scope filter.
   * @param {number | undefined} requestedHubId - Bộ lọc phạm vi Hub mục tiêu.
   * @param {AccessTokenPayload} actor - Session request actor.
   * @param {AccessTokenPayload} actor - Tác nhân yêu cầu phiên.
   * @returns {Promise<any>} Suggested group dispatches and unassigned items.
   * @returns {Promise<any>} Gợi ý các nhóm điều phối và các đơn hàng chưa gán.
   * @throws {NotFoundException} If no active hubs found for Admin scope.
   * @throws {NotFoundException} Nếu không tìm thấy Hub hoạt động cho phạm vi Admin.
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
   * Confirms suggested dispatches, verifies availability, and commits trip records.
   * Xác nhận các gợi ý điều phối, kiểm tra tính khả dụng và lưu các bản ghi chuyến đi.
   *
   * @param {DispatchApproveType} dto - Tripping stops and resources parameters.
   * @param {DispatchApproveType} dto - Các tham số điểm dừng chuyến đi và tài nguyên.
   * @param {AccessTokenPayload} actor - Administrative actor session.
   * @param {AccessTokenPayload} actor - Phiên tác nhân quản trị xác thực.
   * @returns Created trip database record details.
   * @returns Chi tiết bản ghi chuyến đi cơ sở dữ liệu đã tạo.
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

    return this.tripCreationService.createTripWithStops(dto.vehicleId, dto.driverId, dto.orderIds, stops, undefined, {
      stateCreatedById: actor.userId,
      stateSource: actor.roleName === roleName.WAREHOUSE_STAFF ? EVENT_SOURCE.HUB_SCANNER : EVENT_SOURCE.ADMIN_PORTAL,
    })
  }

  /**
   * Normalizes and validates incoming stop data configurations.
   * Chuẩn hóa và xác thực các cấu hình dữ liệu điểm dừng gửi lên.
   *
   * @param {DispatchApproveType} dto - Approved dispatch parameters.
   * @param {DispatchApproveType} dto - Các tham số điều phối đã duyệt.
   * @returns Normalized stops arrays.
   * @returns Mảng điểm dừng đã được chuẩn hóa.
   * @throws {BadRequestException} If stop contains orders not in dispatch or has missing items.
   * @throws {BadRequestException} Nếu điểm dừng chứa đơn không thuộc dispatch hoặc bị thiếu.
   */
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
