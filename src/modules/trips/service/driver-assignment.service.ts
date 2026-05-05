import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma } from 'generated/prisma'
import { TripRepository } from '../repository/trip.repository'
import { PrismaService } from 'src/database/prisma.service'
import {
  ApproveDriverAssignmentRequestType,
  AssignmentRequestInboxResType,
  CreateDriverAssignmentRequestType,
  DriverAssignmentRequestListResType,
  DriverAssignmentRequestResType,
  RejectDriverAssignmentRequestType,
} from '../model/trip.model'
import { STOP_TYPE, TRIP_STATUS } from 'src/common/constants/trip.constant'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { DISPATCHABLE_PAYMENT_FILTER } from 'src/common/constants/order-query.constant'
import { DriverAssignmentRequestStatus } from 'src/common/constants/driver-assignment-request.constant'
import { calculateHaversineDistance } from 'src/common/utils/geo.util'
import roleName from 'src/common/constants/role.constant'
import { NotificationEventName } from 'src/modules/notification/events/notification.event'
import { NotificationEmitterService } from 'src/common/services/notification-emitter.service'
import { TripHubHelper } from './trip-hub.helper'
import { DriverAssignmentHelper, type DriverAssignmentRequestWithDetails } from './driver-assignment.helper'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import { TripCapacityService } from './trip-capacity.service'
import { OrderStateService } from 'src/common/services/order-state.service'
import { EVENT_SOURCE } from 'src/common/constants/tracking.constant'

type PendingAssignmentTrip = Prisma.TripGetPayload<{
  include: {
    stops: true
    vehicle: true
  }
}>

/**
 * Service xử lý toàn bộ Driver Assignment Request workflow.
 *
 * Bao gồm:
 * - Tài xế tạo yêu cầu nhận đơn
 * - Warehouse Staff duyệt/từ chối yêu cầu
 * - Liệt kê yêu cầu theo role (Driver/Staff)
 */
@Injectable()
export class DriverAssignmentService {
  private readonly logger = new Logger(DriverAssignmentService.name)

  constructor(
    private readonly tripRepo: TripRepository,
    private readonly prismaService: PrismaService,
    private readonly notificationEmitter: NotificationEmitterService,
    private readonly hubHelper: TripHubHelper,
    private readonly assignmentHelper: DriverAssignmentHelper,
    private readonly tripCapacityService: TripCapacityService,
    private readonly orderStateService: OrderStateService,
  ) {}

  /** Liệt kê yêu cầu nhận đơn của tài xế hiện tại */
  async listDriverAssignmentRequests(actor: AccessTokenPayload): Promise<DriverAssignmentRequestListResType> {
    await this.hubHelper.getDriverScopeUser(actor)

    const requests = await this.prismaService.driverAssignmentRequest.findMany({
      where: { driverId: actor.userId },
      include: this.assignmentHelper.getDriverAssignmentRequestInclude(),
      orderBy: [{ createdAt: 'desc' }],
    })

    return {
      data: requests.map((request) => this.assignmentHelper.mapDriverAssignmentRequest(request)),
      totalItems: requests.length,
    }
  }

  /** Tài xế gửi yêu cầu nhận đơn hàng */
  async createDriverAssignmentRequest(
    dto: CreateDriverAssignmentRequestType,
    actor: AccessTokenPayload,
  ): Promise<DriverAssignmentRequestResType> {
    const driver = await this.hubHelper.getDriverScopeUser(actor)

    if (!driver.hubId) {
      throw new ForbiddenException('Bạn chưa được phân bổ vào trạm nào nên không thể nhận đơn.')
    }

    await this.hubHelper.assertDriverHasNoInProgressTrip(actor.userId)

    const [order, existingRequest] = await Promise.all([
      this.prismaService.order.findFirst({
        where: {
          id: dto.orderId,
          currentHubId: driver.hubId,
          currentTripId: null,
          deletedAt: null,
          status: { in: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB] },
          ...DISPATCHABLE_PAYMENT_FILTER,
        },
        select: { id: true, trackingCode: true },
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
      include: this.assignmentHelper.getDriverAssignmentRequestInclude(),
    })

    const recipients = await this.prismaService.user.findMany({
      where: {
        deletedAt: null,
        hubId: driver.hubId,
        isDeleted: false,
        role: { name: roleName.WAREHOUSE_STAFF },
      },
      select: { id: true },
    })

    if (recipients.length > 0) {
      await this.notificationEmitter.emitSafe(NotificationEventName.DRIVER_ASSIGNMENT_REQUEST_SUBMITTED, {
        assignmentRequestId: request.id,
        driverFullName: driver.fullName,
        driverId: actor.userId,
        hubId: driver.hubId,
        orderId: order.id,
        orderTrackingCode: order.trackingCode ?? `ORD-${order.id}`,
        recipientUserIds: recipients.map((recipient) => recipient.id),
      })
    }

    return this.assignmentHelper.mapDriverAssignmentRequest(request)
  }

  /** Liệt kê yêu cầu nhận đơn chờ xử lý (cho Warehouse Staff) */
  async listAssignmentRequests(actor: AccessTokenPayload): Promise<AssignmentRequestInboxResType> {
    const hubId = await this.hubHelper.resolveHubScope(undefined, actor)
    const requests = await this.prismaService.driverAssignmentRequest.findMany({
      where: {
        hubId,
        status: DriverAssignmentRequestStatus.PENDING,
      },
      include: this.assignmentHelper.getDriverAssignmentRequestInclude(),
      orderBy: [{ createdAt: 'desc' }],
    })

    const driverIds = [...new Set(requests.map((request) => request.driverId))]
    const pendingTrips = driverIds.length
      ? await this.prismaService.trip.findMany({
          where: {
            driverId: { in: driverIds },
            status: TRIP_STATUS.PENDING,
            vehicle: { hubId },
          },
          include: {
            vehicle: {
              select: { id: true, licensePlate: true },
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
        ...this.assignmentHelper.mapDriverAssignmentRequest(request),
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
        pendingTripsForDriver: (pendingTripsByDriver[request.driverId] ?? []).map(
          (trip) => this.assignmentHelper.mapTripSummary(trip)!,
        ),
      })),
      totalItems: requests.length,
    }
  }

  /** Warehouse Staff duyệt yêu cầu nhận đơn */
  async approveAssignmentRequest(
    requestId: number,
    dto: ApproveDriverAssignmentRequestType,
    actor: AccessTokenPayload,
  ): Promise<DriverAssignmentRequestResType> {
    const hubId = await this.hubHelper.resolveHubScope(undefined, actor)
    const request = await this.prismaService.driverAssignmentRequest.findUnique({
      where: { id: requestId },
      include: this.assignmentHelper.getDriverAssignmentRequestInclude(),
    })

    if (!request || request.hubId !== hubId) {
      throw new NotFoundException('Không tìm thấy yêu cầu nhận đơn trong hub của bạn.')
    }

    if (request.status !== DriverAssignmentRequestStatus.PENDING) {
      throw new BadRequestException('Yêu cầu này không còn ở trạng thái chờ xử lý.')
    }

    const isAssignableOrderStatus =
      request.order.status === ORDER_STATUS.PENDING || request.order.status === ORDER_STATUS.ARRIVED_AT_HUB

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

    this.hubHelper.assertOrderPaymentReadyForDispatch(request.order)

    const pendingTrips = await this.prismaService.trip.findMany({
      where: {
        driverId: request.driverId,
        status: TRIP_STATUS.PENDING,
        vehicle: { hubId },
      },
      include: { stops: true, vehicle: true },
      orderBy: [{ createdAt: 'desc' }],
    })

    let approvedRequest: DriverAssignmentRequestWithDetails

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

      await this.hubHelper.assertDispatchResourcesBelongToHub(hubId, dto.vehicleId, request.driverId, [request.orderId])
      await this.hubHelper.assertDriverHasNoInProgressTrip(request.driverId)
      await this.tripCapacityService.assertVehicleCapacityForOrders({
        orderIds: [request.orderId],
        vehicleId: dto.vehicleId,
      })

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
          stateCreatedById: actor.userId,
          stateSource: EVENT_SOURCE.HUB_SCANNER,
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
        include: this.assignmentHelper.getDriverAssignmentRequestInclude(),
      })
    }

    await this.notificationEmitter.emitSafe(NotificationEventName.DRIVER_ASSIGNMENT_REQUEST_REVIEWED, {
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

    return this.assignmentHelper.mapDriverAssignmentRequest(approvedRequest)
  }

  /** Warehouse Staff từ chối yêu cầu nhận đơn */
  async rejectAssignmentRequest(
    requestId: number,
    dto: RejectDriverAssignmentRequestType,
    actor: AccessTokenPayload,
  ): Promise<DriverAssignmentRequestResType> {
    const hubId = await this.hubHelper.resolveHubScope(undefined, actor)
    const request = await this.prismaService.driverAssignmentRequest.findUnique({
      where: { id: requestId },
      include: this.assignmentHelper.getDriverAssignmentRequestInclude(),
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
      include: this.assignmentHelper.getDriverAssignmentRequestInclude(),
    })

    await this.notificationEmitter.emitSafe(NotificationEventName.DRIVER_ASSIGNMENT_REQUEST_REVIEWED, {
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

    return this.assignmentHelper.mapDriverAssignmentRequest(rejectedRequest)
  }

  /** Thêm đơn vào chuyến có sẵn khi duyệt assignment request */
  private async addOrderToApprovedAssignmentRequest(
    trip: PendingAssignmentTrip,
    request: DriverAssignmentRequestWithDetails,
    reviewedById: number,
  ): Promise<DriverAssignmentRequestWithDetails> {
    if (trip.status !== TRIP_STATUS.PENDING) {
      throw new BadRequestException('Chỉ có thể thêm đơn vào chuyến đang chờ khởi hành.')
    }

    this.hubHelper.assertOrderPaymentReadyForDispatch(request.order)

    if (!trip.vehicle) {
      throw new BadRequestException('Chuyến chưa có xe hợp lệ để kiểm tra tải.')
    }

    await this.tripCapacityService.assertVehicleCapacityForOrders({
      existingTripId: trip.id,
      orderIds: [request.orderId],
      vehicleId: trip.vehicle.id,
    })

    const nextSequence =
      (trip.stops.length > 0 ? Math.max(...trip.stops.map((stop: { stopSequence: number }) => stop.stopSequence)) : 0) +
      1
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
      await this.orderStateService.transitionOrdersInTransaction({
        createdById: reviewedById,
        description: `Yêu cầu nhận đơn #${request.id} đã được duyệt và thêm vào chuyến #${trip.id}.`,
        expectedCurrentTripId: null,
        expectedStatuses: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB],
        extraWhere: DISPATCHABLE_PAYMENT_FILTER,
        nextOrderData: {
          currentTripId: trip.id,
        },
        orderIds: [request.orderId],
        source: EVENT_SOURCE.HUB_SCANNER,
        status: ORDER_STATUS.ASSIGNED,
        tx,
        validationMode: 'system',
      })

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
        include: this.assignmentHelper.getDriverAssignmentRequestInclude(),
      })
    })

    if (!updatedRequest) {
      throw new NotFoundException('Không thể tải lại yêu cầu sau khi duyệt.')
    }

    return updatedRequest
  }
}
