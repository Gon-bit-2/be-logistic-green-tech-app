import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { TripRepository } from '../repository/trip.repository'
import { PrismaService } from 'src/database/prisma.service'
import {
  AddOrdersToTripType,
  CancelTripBodyType,
  GetTripsQueryType,
  ManualCreateTripType,
  ReassignTripVehicleType,
} from '../model/trip.model'
import { STOP_TYPE, TRIP_STATUS } from 'src/common/constants/trip.constant'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { calculateHaversineDistance } from 'src/common/utils/geo.util'
import { TripHubHelper } from './trip-hub.helper'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import roleName from 'src/common/constants/role.constant'
import { GamificationService } from 'src/modules/green-tech/service/gamification.service'
import { DISPATCHABLE_PAYMENT_FILTER } from 'src/common/constants/order-query.constant'
import { TripCapacityService } from './trip-capacity.service'
import { EVENT_SOURCE } from 'src/common/constants/tracking.constant'
import { OrderStateService } from 'src/common/services/order-state.service'
import { AuditLogService } from 'src/common/services/audit-log.service'

/**
 * Trip execution service managing the complete lifecycle of delivery trips.
 * Handles querying, manual creation, vehicle reassignment, and status transitions (start, cancel, complete).
 *
 * Dịch vụ thực thi chuyến đi quản lý toàn bộ vòng đời của các chuyến giao hàng.
 * Xử lý truy vấn, tạo thủ công, phân bổ lại phương tiện và chuyển đổi trạng thái (bắt đầu, hủy, hoàn thành).
 */
@Injectable()
export class TripExecutionService {
  private readonly logger = new Logger(TripExecutionService.name)

  constructor(
    private readonly tripRepo: TripRepository,
    private readonly prismaService: PrismaService,
    private readonly hubHelper: TripHubHelper,
    private readonly gamificationService: GamificationService,
    private readonly tripCapacityService: TripCapacityService,
    private readonly orderStateService: OrderStateService,
    @Optional() private readonly auditLogService?: AuditLogService,
  ) {}

  /**
   * Retrieves a paginated list of trips filtered by criteria and scoped by user permissions.
   *
   * Lấy danh sách chuyến đi được phân trang, lọc theo tiêu chí và giới hạn theo quyền hạn của người dùng.
   *
   * @param query The query parameters containing filters, sorting, and pagination options.
   *              Các tham số truy vấn chứa bộ lọc, sắp xếp và tùy chọn phân trang.
   * @param actor The token payload of the user making the request.
   *              Thông tin token của người dùng thực hiện yêu cầu.
   * @returns A promise resolving to the list of trips and pagination metadata.
   *          Một promise trả về danh sách các chuyến đi và dữ liệu phân trang.
   */
  async getTrips(query: GetTripsQueryType, actor: AccessTokenPayload) {
    const hubId = await this.hubHelper.resolveHubScope(query.hubId, actor)
    return this.tripRepo.findAll({ ...query, hubId })
  }

  /**
   * Retrieves a single trip's details by its ID, enforcing hub-level access control for warehouse staff.
   *
   * Lấy chi tiết của một chuyến đi theo ID, áp dụng kiểm soát quyền truy cập cấp kho bãi đối với nhân viên kho.
   *
   * @param id The unique identifier of the trip.
   *           Mã định danh duy nhất của chuyến đi.
   * @param actor The token payload of the user making the request.
   *              Thông tin token của người dùng thực hiện yêu cầu.
   * @returns A promise resolving to the trip details with stops.
   *          Một promise trả về chi tiết chuyến đi cùng các điểm dừng.
   * @throws {NotFoundException} If the trip with the specified ID does not exist.
   *                             Nếu chuyến đi với ID chỉ định không tồn tại.
   * @throws {ForbiddenException} If a warehouse staff tries to access a trip belonging to another hub.
   *                              Nếu nhân viên kho cố gắng truy cập chuyến đi thuộc về kho khác.
   */
  async getTripById(id: number, actor: AccessTokenPayload) {
    const trip = await this.tripRepo.findById(id)
    if (!trip) throw new NotFoundException(`Không tìm thấy chuyến #${id}`)

    const tripHubId = this.hubHelper.inferTripHubId(trip)
    if (tripHubId && actor.roleName === roleName.WAREHOUSE_STAFF) {
      const staffHubId = await this.hubHelper.resolveHubScope(undefined, actor)
      if (tripHubId !== staffHubId) {
        throw new ForbiddenException('Error.PermissionDenied.NotYourHub')
      }
    }

    return trip
  }

  /**
   * Manually creates a new trip with assigned vehicle, driver, and orders.
   * Validates hub scoping, resource availability, and vehicle capacity.
   *
   * Tạo chuyến đi thủ công với phương tiện, tài xế và các đơn hàng được chỉ định.
   * Xác thực phạm vi kho bãi, tính khả dụng của tài nguyên và tải trọng phương tiện.
   *
   * @param dto The data transfer object containing vehicle, driver, orders, and hub details.
   *            Đối tượng truyền dữ liệu chứa thông tin phương tiện, tài xế, đơn hàng và kho bãi.
   * @param actor The token payload of the user making the request.
   *              Thông tin token của người dùng thực hiện yêu cầu.
   * @returns A promise resolving to the newly created trip.
   *          Một promise trả về chuyến đi mới được tạo.
   * @throws {BadRequestException} If resources do not belong to the hub or driver/vehicle is unavailable.
   *                               Nếu tài nguyên không thuộc kho bãi hoặc tài xế/phương tiện không khả dụng.
   */
  async manualCreateTrip(dto: ManualCreateTripType, actor: AccessTokenPayload) {
    const hubId = await this.hubHelper.resolveHubScope(dto.hubId, actor)
    await this.hubHelper.assertDispatchResourcesBelongToHub(hubId, dto.vehicleId, dto.driverId, dto.orderIds)
    await this.hubHelper.assertDriverAndVehicleAvailability(dto.vehicleId, dto.driverId)
    await this.tripCapacityService.assertVehicleCapacityForOrders({
      orderIds: dto.orderIds,
      vehicleId: dto.vehicleId,
    })

    const stops = dto.orderIds.map((orderId, index) => ({
      orderId,
      hubId: null as number | null,
      stopSequence: index + 1,
      stopType: STOP_TYPE.DROPOFF,
    }))

    return this.tripRepo.createTripWithStops(dto.vehicleId, dto.driverId, dto.orderIds, stops, undefined, {
      stateCreatedById: actor.userId,
      stateSource: actor.roleName === roleName.WAREHOUSE_STAFF ? EVENT_SOURCE.HUB_SCANNER : EVENT_SOURCE.ADMIN_PORTAL,
    })
  }

  /**
   * Reassigns a new vehicle and/or driver to an existing trip in PENDING status.
   *
   * Chỉ định lại phương tiện và/hoặc tài xế mới cho một chuyến đi đang ở trạng thái PENDING.
   *
   * @param tripId The unique identifier of the trip to modify.
   *               Mã định danh duy nhất của chuyến đi cần sửa đổi.
   * @param dto The data transfer object containing new vehicle and optional driver ID.
   *            Đối tượng truyền dữ liệu chứa phương tiện mới và ID tài xế (tùy chọn).
   * @param actor The token payload of the user making the request.
   *              Thông tin token của người dùng thực hiện yêu cầu.
   * @returns A promise resolving to the updated trip details.
   *          Một promise trả về chi tiết chuyến đi đã được cập nhật.
   * @throws {NotFoundException} If the trip, vehicle, or driver is not found.
   *                             Nếu không tìm thấy chuyến đi, phương tiện hoặc tài xế.
   * @throws {BadRequestException} If the trip is not PENDING, resources do not belong to the same hub, or capacity is exceeded.
   *                               Nếu chuyến đi không ở trạng thái PENDING, tài nguyên không thuộc cùng kho, hoặc vượt quá tải trọng.
   * @throws {ForbiddenException} If warehouse staff attempts to reassign resources for a trip belonging to another hub.
   *                              Nếu nhân viên kho cố gắng phân bổ lại tài nguyên cho chuyến đi thuộc kho khác.
   */
  async reassignTripVehicle(tripId: number, dto: ReassignTripVehicleType, actor: AccessTokenPayload) {
    const trip = await this.tripRepo.findById(tripId)
    if (!trip) throw new NotFoundException(`Không tìm thấy chuyến #${tripId}`)
    if (trip.status !== TRIP_STATUS.PENDING) {
      throw new BadRequestException('Chỉ có thể thay đổi xe cho chuyến đang chờ khởi hành.')
    }

    const tripHubId = this.hubHelper.inferTripHubId(trip)
    if (!tripHubId) throw new BadRequestException('Không xác định được Hub cho chuyến này.')

    if (actor.roleName === roleName.WAREHOUSE_STAFF) {
      const staffHubId = await this.hubHelper.resolveHubScope(undefined, actor)
      if (tripHubId !== staffHubId) {
        throw new ForbiddenException('Error.PermissionDenied.NotYourHub')
      }
    }

    const vehicle = await this.prismaService.vehicle.findFirst({
      where: { id: dto.vehicleId, deletedAt: null, isActive: true },
      select: { id: true, hubId: true },
    })

    if (!vehicle) throw new NotFoundException(`Vehicle #${dto.vehicleId} không tồn tại`)
    if (vehicle.hubId !== tripHubId) {
      throw new BadRequestException('Xe mới không thuộc cùng hub với chuyến.')
    }

    const nextDriverId = dto.driverId ?? trip.driverId

    if (dto.driverId) {
      const driver = await this.prismaService.user.findFirst({
        where: {
          id: dto.driverId,
          deletedAt: null,
          isDeleted: false,
          role: { name: roleName.DRIVER },
        },
        select: { id: true, hubId: true },
      })

      if (!driver) throw new NotFoundException(`Driver #${dto.driverId} không tồn tại`)
      if (driver.hubId !== tripHubId) {
        throw new BadRequestException('Tài xế mới không thuộc cùng hub với chuyến.')
      }
    }

    await this.hubHelper.assertDriverAndVehicleAvailability(dto.vehicleId, nextDriverId, tripId)
    await this.tripCapacityService.assertVehicleCapacityForTrip({
      tripId,
      vehicleId: dto.vehicleId,
    })

    const updatedTrip = await this.prismaService.trip.update({
      where: { id: tripId },
      data: {
        vehicleId: dto.vehicleId,
        ...(dto.driverId ? { driverId: dto.driverId } : {}),
      },
    })

    await this.auditLogService?.record({
      action: 'TRIP_REASSIGNED',
      actorUserId: actor.userId,
      after: { driverId: updatedTrip.driverId, vehicleId: updatedTrip.vehicleId },
      before: { driverId: trip.driverId, vehicleId: trip.vehicleId },
      entityId: tripId,
      entityType: 'TRIP',
    })

    return updatedTrip
  }

  /**
   * Starts a trip by transitioning its status from PENDING to IN_PROGRESS.
   * Also transitions all associated orders to IN_TRANSIT status.
   *
   * Bắt đầu chuyến đi bằng cách chuyển trạng thái từ PENDING sang IN_PROGRESS.
   * Đồng thời chuyển tất cả đơn hàng liên quan sang trạng thái IN_TRANSIT (đang vận chuyển).
   *
   * @param tripId The unique identifier of the trip to start.
   *               Mã định danh duy nhất của chuyến đi cần bắt đầu.
   * @param actor The token payload of the driver starting the trip.
   *              Thông tin token của tài xế bắt đầu chuyến đi.
   * @returns A promise resolving to the updated trip.
   *          Một promise trả về chuyến đi đã được cập nhật.
   * @throws {NotFoundException} If the trip is not found.
   *                             Nếu không tìm thấy chuyến đi.
   * @throws {ForbiddenException} If the actor is not the assigned driver of this trip.
   *                              Nếu người dùng không phải tài xế được chỉ định của chuyến đi này.
   * @throws {BadRequestException} If the trip is not in PENDING status or order payments are not ready.
   *                               Nếu chuyến đi không ở trạng thái PENDING hoặc thanh toán đơn hàng chưa sẵn sàng.
   */
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

    const updatedTrip = await this.prismaService.$transaction(async (tx) => {
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

    return updatedTrip
  }

  /**
   * Cancels a PENDING trip, releasing its driver, vehicle, and returning all associated orders back to PENDING status.
   *
   * Hủy chuyến đi đang ở trạng thái PENDING, giải phóng tài xế, phương tiện và đưa tất cả đơn hàng liên quan trở lại trạng thái PENDING.
   *
   * @param tripId The unique identifier of the trip to cancel.
   *               Mã định danh duy nhất của chuyến đi cần hủy.
   * @param dto The data transfer object containing the cancellation reason.
   *            Đối tượng truyền dữ liệu chứa lý do hủy chuyến.
   * @param actor The token payload of the user cancelling the trip.
   *              Thông tin token của người dùng thực hiện hủy chuyến.
   * @returns A promise resolving to the cancelled trip.
   *          Một promise trả về chuyến đi đã hủy.
   * @throws {NotFoundException} If the trip is not found.
   *                             Nếu không tìm thấy chuyến đi.
   * @throws {BadRequestException} If the trip is not in PENDING status.
   *                               Nếu chuyến đi không ở trạng thái PENDING.
   */
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

    const cancelledTrip = await this.prismaService.$transaction(async (tx) => {
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

    return cancelledTrip
  }

  /**
   * Completes an IN_PROGRESS trip. Calculates total distance, transitions status to COMPLETED,
   * and triggers gamification/emission calculation for eco-friendly vehicles.
   *
   * Hoàn thành một chuyến đi đang thực hiện (IN_PROGRESS). Tính toán tổng quãng đường,
   * chuyển trạng thái sang COMPLETED và kích hoạt tính toán giảm phát thải/trò chơi hóa cho xe thân thiện môi trường.
   *
   * @param tripId The unique identifier of the trip to complete.
   *               Mã định danh duy nhất của chuyến đi cần hoàn thành.
   * @param actor The token payload of the driver completing the trip.
   *              Thông tin token của tài xế hoàn thành chuyến đi.
   * @returns A promise resolving to the completed trip.
   *          Một promise trả về chuyến đi đã hoàn thành.
   * @throws {NotFoundException} If the trip is not found.
   *                             Nếu không tìm thấy chuyến đi.
   * @throws {ForbiddenException} If the actor is not the assigned driver of this trip.
   *                              Nếu người dùng không phải tài xế được chỉ định của chuyến đi này.
   * @throws {BadRequestException} If the trip is not IN_PROGRESS, or if there are unfinished/undelivered orders on this trip.
   *                               Nếu chuyến đi không ở trạng thái IN_PROGRESS, hoặc còn đơn hàng chưa giao xong.
   */
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

  /**
   * Adds multiple orders to an existing PENDING trip.
   * Validates capacity constraints, hub scope, and payment status of added orders.
   *
   * Thêm nhiều đơn hàng vào một chuyến đi đang ở trạng thái PENDING.
   * Xác thực ràng buộc tải trọng, phạm vi kho bãi và trạng thái thanh toán của các đơn hàng được thêm.
   *
   * @param tripId The unique identifier of the trip.
   *               Mã định danh duy nhất của chuyến đi.
   * @param dto The data transfer object containing the order IDs to add.
   *            Đối tượng truyền dữ liệu chứa danh sách ID đơn hàng cần thêm.
   * @param actor The token payload of the user performing the action.
   *              Thông tin token của người dùng thực hiện hành động.
   * @returns A promise resolving to the updated trip details including stops.
   *          Một promise trả về chi tiết chuyến đi đã cập nhật gồm các điểm dừng.
   * @throws {NotFoundException} If the trip is not found.
   *                             Nếu không tìm thấy chuyến đi.
   * @throws {BadRequestException} If the trip is not PENDING, orders do not belong to the same hub, or vehicle capacity is exceeded.
   *                               Nếu chuyến đi không ở trạng thái PENDING, đơn hàng không thuộc cùng kho, hoặc vượt quá tải trọng xe.
   * @throws {ForbiddenException} If warehouse staff attempts to add orders to a trip belonging to another hub.
   *                              Nếu nhân viên kho cố gắng thêm đơn hàng vào chuyến đi thuộc kho khác.
   */
  async addOrdersToTrip(tripId: number, dto: AddOrdersToTripType, actor: AccessTokenPayload) {
    const trip = await this.tripRepo.findById(tripId)
    if (!trip) throw new NotFoundException(`Không tìm thấy chuyến #${tripId}`)
    if (trip.status !== TRIP_STATUS.PENDING) {
      throw new BadRequestException('Chỉ có thể thêm đơn vào chuyến đang chờ khởi hành.')
    }

    const tripHubId = this.hubHelper.inferTripHubId(trip)
    if (!tripHubId) throw new BadRequestException('Không xác định được Hub cho chuyến này.')

    if (actor.roleName === roleName.WAREHOUSE_STAFF) {
      const staffHubId = await this.hubHelper.resolveHubScope(undefined, actor)
      if (tripHubId !== staffHubId) {
        throw new ForbiddenException('Error.PermissionDenied.NotYourHub')
      }
    }

    await this.hubHelper.assertOrdersBelongToHub(tripHubId, dto.orderIds)
    await this.tripCapacityService.assertVehicleCapacityForOrders({
      existingTripId: tripId,
      orderIds: dto.orderIds,
      vehicleId: trip.vehicleId,
    })

    const orders = await this.prismaService.order.findMany({
      where: { id: { in: dto.orderIds } },
      select: {
        id: true,
        payment: { select: { method: true, status: true } },
        receiverLat: true,
        receiverLng: true,
        senderLat: true,
        senderLng: true,
        trackingCode: true,
      },
    })

    for (const order of orders) {
      this.hubHelper.assertOrderPaymentReadyForDispatch(order)
    }

    const existingMaxSequence = trip.stops?.length
      ? Math.max(...trip.stops.map((stop: { stopSequence: number }) => stop.stopSequence))
      : 0

    const newStops = dto.orderIds.map((orderId, index) => {
      const order = orders.find((item) => item.id === orderId)

      return {
        hubId: null as number | null,
        orderId,
        stopSequence: existingMaxSequence + index + 1,
        stopType:
          order &&
          calculateHaversineDistance(order.senderLat, order.senderLng, order.receiverLat, order.receiverLng) < 100
            ? STOP_TYPE.DROPOFF
            : STOP_TYPE.HUB_TRANSFER,
      }
    })

    return this.prismaService.$transaction(async (tx) => {
      await this.orderStateService.transitionOrdersInTransaction({
        createdById: actor.userId,
        description: `Đơn hàng được thêm vào chuyến #${tripId}.`,
        expectedCurrentTripId: null,
        expectedStatuses: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB],
        extraWhere: DISPATCHABLE_PAYMENT_FILTER,
        nextOrderData: {
          currentTripId: tripId,
        },
        orderIds: dto.orderIds,
        source: actor.roleName === roleName.WAREHOUSE_STAFF ? EVENT_SOURCE.HUB_SCANNER : EVENT_SOURCE.ADMIN_PORTAL,
        status: ORDER_STATUS.ASSIGNED,
        tx,
        validationMode: 'system',
      })

      await tx.tripStop.createMany({
        data: newStops.map((stop) => ({
          hubId: stop.hubId,
          orderId: stop.orderId,
          stopSequence: stop.stopSequence,
          stopType: stop.stopType,
          tripId,
        })),
      })

      return tx.trip.findUnique({
        where: { id: tripId },
        include: {
          driver: true,
          stops: { include: { order: true }, orderBy: { stopSequence: 'asc' } },
          vehicle: true,
        },
      })
    })
  }

  /**
   * Cancels/removes a specific order from an active or pending trip.
   *
   * Hủy hoặc gỡ bỏ một đơn hàng cụ thể ra khỏi một chuyến đi đang hoạt động hoặc đang chờ.
   *
   * @param tripId The unique identifier of the trip.
   *               Mã định danh duy nhất của chuyến đi.
   * @param orderId The unique identifier of the order to remove.
   *                Mã định danh duy nhất của đơn hàng cần gỡ bỏ.
   * @returns A promise resolving to the trip after order removal.
   *          Một promise trả về thông tin chuyến đi sau khi gỡ bỏ đơn hàng.
   * @throws {NotFoundException} If the trip is not found.
   *                             Nếu không tìm thấy chuyến đi.
   */
  async cancelOrderFromTrip(tripId: number, orderId: number) {
    const trip = await this.tripRepo.findById(tripId)
    if (!trip) throw new NotFoundException(`Không tìm thấy chuyến #${tripId}`)

    return this.tripRepo.cancelOrderFromTrip(tripId, orderId)
  }
}
