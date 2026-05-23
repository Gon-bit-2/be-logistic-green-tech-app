import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { Prisma } from 'generated/prisma'
import { ORDER_STATUS, OrderStatusType } from 'src/common/constants/order.constant'
import {
  EVENT_SOURCE,
  EventSourceValue,
  FailureReasonCodeValue,
  TRACKING_EVENT_TYPE,
  TrackingEventTypeValue,
  VALID_STATUS_TRANSITIONS,
} from 'src/common/constants/tracking.constant'
import { isNotifiableOrderStatus } from 'src/common/constants/notification.constant'
import { PrismaService } from 'src/database/prisma.service'
import { NotificationEventName, OrderStatusUpdatedEvent } from 'src/modules/notification/events/notification.event'
import { ProofOfDeliveryInputType } from 'src/modules/tracking/model/tracking.model'
import { CodSettlementService } from './cod-settlement.service'
import { NotificationEmitterService } from './notification-emitter.service'
import { AuditLogService } from './audit-log.service'

type OrderStateTransaction = Prisma.TransactionClient
type TransitionValidationMode = 'strict' | 'system' | 'none'

type TrackingEventInput = {
  attemptNumber?: number | null
  createdById?: number | null
  description?: string | null
  failureReasonCode?: FailureReasonCodeValue | null
  latitude?: number | null
  location?: string | null
  longitude?: number | null
  occurredAt?: Date | null
  pod?: ProofOfDeliveryInputType
  source: EventSourceValue
}

type TransitionOrderStatusInput = TrackingEventInput & {
  codCollection?: {
    amount?: number
    driverId: number
    orderReference?: string
  }
  nextOrderData?: Record<string, unknown>
  orderId: number
  status: OrderStatusType
  tx?: OrderStateTransaction
  validationMode?: TransitionValidationMode
}

type TransitionOrdersInTransactionInput = {
  createdById?: number | null
  description?: string | null
  expectedCurrentTripId?: number | null
  expectedStatuses?: OrderStatusType[]
  extraWhere?: Prisma.OrderWhereInput
  nextOrderData?: Record<string, unknown>
  orderIds: number[]
  source: EventSourceValue
  status: OrderStatusType
  tx: OrderStateTransaction
  validationMode?: TransitionValidationMode
}

type RecordTrackingEventInput = TrackingEventInput & {
  eventType: TrackingEventTypeValue
  orderId: number
  status?: OrderStatusType | null
  tx?: OrderStateTransaction
}

const SYSTEM_STATUS_TRANSITIONS: Record<string, string[]> = {
  [ORDER_STATUS.PENDING]: [ORDER_STATUS.ASSIGNED, ORDER_STATUS.IN_TRANSIT, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.ASSIGNED]: [ORDER_STATUS.PENDING, ORDER_STATUS.IN_TRANSIT, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.IN_TRANSIT]: [ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.ARRIVED_AT_HUB]: [ORDER_STATUS.ASSIGNED, ORDER_STATUS.IN_TRANSIT],
}

/**
 * Service that manages state transitions and lifecycle of orders.
 * Service quản lý chuyển đổi trạng thái và vòng đời của đơn hàng.
 *
 * Handles status validation, audit logging, proof-of-delivery (POD) attachments,
 * COD collection triggers, tracking events, and user notifications.
 * Xử lý xác thực trạng thái, ghi log kiểm toán, đính kèm chứng thực giao hàng (POD),
 * kích hoạt thu hộ COD, ghi nhận sự kiện hành trình và thông báo cho người dùng.
 */
@Injectable()
export class OrderStateService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly codSettlementService: CodSettlementService,
    private readonly notificationEmitter: NotificationEmitterService,
    @Optional() private readonly auditLogService?: AuditLogService,
  ) {}

  /**
   * Transitions the status of a single order and emits notifications.
   * Chuyển đổi trạng thái của một đơn hàng duy nhất và phát thông báo.
   *
   * Automatically manages transaction boundaries if no active transaction `tx` is provided.
   * Tự động quản lý biên giao dịch nếu không cung cấp giao dịch hoạt động `tx`.
   *
   * @param {TransitionOrderStatusInput} input - Data needed for the state transition.
   * @param {TransitionOrderStatusInput} input - Dữ liệu cần thiết cho việc chuyển đổi trạng thái.
   * @returns {Promise<{ event: any; order: any }>} Resolved transition event and order information.
   * @returns {Promise<{ event: any; order: any }>} Thông tin sự kiện hành trình và đơn hàng sau chuyển đổi.
   */
  async transitionOrderStatus(input: TransitionOrderStatusInput) {
    const result = input.tx
      ? await this.transitionSingleWithClient(input.tx, input)
      : await this.prismaService.$transaction((tx) => this.transitionSingleWithClient(tx, input))

    await this.emitOrderStatusNotification(result.order)
    return result
  }

  /**
   * Helper method to record state transitions triggered automatically by the system.
   * Phương thức bổ trợ để ghi nhận chuyển đổi trạng thái được kích hoạt tự động bởi hệ thống.
   *
   * Uses 'system' validation mode and bypasses user-specific actor checks.
   * Sử dụng chế độ xác thực 'system' và bỏ qua các kiểm tra tác nhân người dùng cụ thể.
   *
   * @param {Omit<TransitionOrderStatusInput, 'createdById' | 'source' | 'validationMode'>} input - Transition input excluding actor details.
   * @param {Omit<TransitionOrderStatusInput, 'createdById' | 'source' | 'validationMode'>} input - Dữ liệu đầu vào chuyển đổi không bao gồm chi tiết tác nhân.
   * @returns {Promise<any>} The resolved transition result.
   * @returns {Promise<any>} Kết quả chuyển đổi đã phân giải.
   */
  async recordSystemTransition(input: Omit<TransitionOrderStatusInput, 'createdById' | 'source' | 'validationMode'>) {
    return this.transitionOrderStatus({
      ...input,
      createdById: null,
      source: EVENT_SOURCE.SYSTEM,
      validationMode: 'system',
    })
  }

  /**
   * Transitions statuses of multiple orders within a single active transaction.
   * Chuyển đổi trạng thái của nhiều đơn hàng trong một giao dịch hoạt động duy nhất.
   *
   * Performs uniqueness checks, queries existing statuses, validates transitions, and records
   * bulk tracking events and audit logs.
   * Thực hiện kiểm tra tính duy nhất, truy vấn trạng thái hiện tại, xác thực chuyển đổi, và ghi nhận
   * hàng loạt sự kiện hành trình cũng như nhật ký kiểm toán.
   *
   * @param {TransitionOrdersInTransactionInput} input - Bulk transition parameters.
   * @param {TransitionOrdersInTransactionInput} input - Các tham số chuyển đổi hàng loạt.
   * @returns {Promise<{ count: number }>} Number of successfully transitioned orders.
   * @returns {Promise<{ count: number }>} Số lượng đơn hàng chuyển đổi trạng thái thành công.
   * @throws {BadRequestException} If duplicate IDs are found, orders are missing, or transition fails.
   * @throws {BadRequestException} Nếu phát hiện ID trùng lặp, thiếu đơn hàng hoặc chuyển đổi thất bại.
   */
  async transitionOrdersInTransaction(input: TransitionOrdersInTransactionInput) {
    const orderIds = this.assertUniqueOrderIds(input.orderIds)
    const baseWhere: Prisma.OrderWhereInput = {
      deletedAt: null,
      id: { in: orderIds },
      ...(input.expectedStatuses?.length ? { status: { in: input.expectedStatuses } } : {}),
      ...(input.expectedCurrentTripId !== undefined ? { currentTripId: input.expectedCurrentTripId } : {}),
    }
    const where: Prisma.OrderWhereInput = input.extraWhere ? { AND: [baseWhere, input.extraWhere] } : baseWhere

    const orders = await input.tx.order.findMany({
      where,
      select: {
        customerId: true,
        currentHubId: true,
        currentTripId: true,
        id: true,
        status: true,
        trackingCode: true,
      },
    })

    if (orders.length !== orderIds.length) {
      throw new BadRequestException('Một hoặc nhiều đơn hàng không còn khả dụng để cập nhật trạng thái.')
    }

    for (const order of orders) {
      this.validateStatusTransition(order.status, input.status, input.validationMode ?? 'strict')
    }

    const now = new Date()
    const orderUpdate = await input.tx.order.updateMany({
      where,
      data: {
        status: input.status,
        ...(input.createdById != null ? { updatedById: input.createdById } : {}),
        ...(input.nextOrderData ?? {}),
      },
    })

    if (orderUpdate.count !== orderIds.length) {
      throw new BadRequestException('Một hoặc nhiều đơn hàng đã được cập nhật bởi thao tác khác.')
    }

    await input.tx.orderTrackingEvent.createMany({
      data: orders.map((order) => ({
        createdById: input.createdById ?? null,
        description: input.description ?? null,
        eventType: TRACKING_EVENT_TYPE.STATUS_CHANGE,
        orderId: order.id,
        occurredAt: now,
        recordedAt: now,
        source: input.source,
        status: input.status,
      })),
    })

    for (const order of orders) {
      await this.auditLogService?.record(
        {
          action: 'ORDER_STATUS_CHANGED',
          actorUserId: input.createdById ?? null,
          after: { status: input.status },
          before: { currentHubId: order.currentHubId, currentTripId: order.currentTripId, status: order.status },
          entityId: order.id,
          entityType: 'ORDER',
          metadata: { source: input.source, trackingCode: order.trackingCode },
        },
        input.tx,
      )
    }

    return { count: orderUpdate.count }
  }

  /**
   * Records an arbitrary tracking event for an order without changing its main status.
   * Ghi nhận một sự kiện hành trình tùy ý cho đơn hàng mà không thay đổi trạng thái chính của nó.
   *
   * @param {RecordTrackingEventInput} input - Tracking event details.
   * @param {RecordTrackingEventInput} input - Chi tiết sự kiện hành trình.
   * @returns {Promise<any>} The created tracking event record.
   * @returns {Promise<any>} Bản ghi sự kiện hành trình đã tạo.
   * @throws {NotFoundException} If the order does not exist.
   * @throws {NotFoundException} Nếu đơn hàng không tồn tại.
   */
  async recordTrackingEvent(input: RecordTrackingEventInput) {
    const run = async (tx: OrderStateTransaction) => {
      const order = await tx.order.findFirst({
        where: { deletedAt: null, id: input.orderId },
        select: { id: true },
      })
      if (!order) {
        throw new NotFoundException(`Đơn hàng #${input.orderId} không tồn tại`)
      }
      return this.createTrackingEvent(tx, input)
    }

    return input.tx ? run(input.tx) : this.prismaService.$transaction(run)
  }

  /**
   * Performs the core business logic of transitioning a single order using a Prisma transaction client.
   * Thực hiện logic nghiệp vụ cốt lõi của việc chuyển đổi một đơn hàng sử dụng client giao dịch Prisma.
   *
   * Verifies transitions, checks POD requirement, updates order database record, registers audit logs,
   * and conditionally triggers COD collection service.
   * Xác minh chuyển đổi, kiểm tra yêu cầu POD, cập nhật bản ghi CSDL đơn hàng, đăng ký nhật ký kiểm toán,
   * và kích hoạt dịch vụ thu hộ COD dưới điều kiện phù hợp.
   *
   * @param {OrderStateTransaction} tx - The Prisma transaction client.
   * @param {OrderStateTransaction} tx - Client giao dịch Prisma.
   * @param {TransitionOrderStatusInput} input - Single transition inputs.
   * @param {TransitionOrderStatusInput} input - Dữ liệu đầu vào chuyển đổi đơn lẻ.
   * @returns {Promise<{ event: any; order: any }>} The created tracking event and updated order database record.
   * @returns {Promise<{ event: any; order: any }>} Sự kiện hành trình đã tạo và bản ghi đơn hàng đã cập nhật trong CSDL.
   * @throws {NotFoundException} If the order does not exist.
   * @throws {NotFoundException} Nếu đơn hàng không tồn tại.
   * @throws {BadRequestException} If transition is illegal or POD is missing for DELIVERED status.
   * @throws {BadRequestException} Nếu chuyển đổi không hợp lệ hoặc thiếu POD cho trạng thái DELIVERED.
   */
  private async transitionSingleWithClient(tx: OrderStateTransaction, input: TransitionOrderStatusInput) {
    const order = await tx.order.findFirst({
      where: { deletedAt: null, id: input.orderId },
      select: {
        codAmount: true,
        customerId: true,
        currentHubId: true,
        currentTripId: true,
        id: true,
        isCodCollected: true,
        payment: {
          select: {
            amount: true,
            method: true,
            status: true,
          },
        },
        status: true,
        trackingCode: true,
      },
    })

    if (!order) {
      throw new NotFoundException(`Đơn hàng #${input.orderId} không tồn tại`)
    }

    this.validateStatusTransition(order.status, input.status, input.validationMode ?? 'strict')

    if (input.status === ORDER_STATUS.DELIVERED && !input.pod) {
      throw new BadRequestException('Phải cung cấp Proof of Delivery (POD) khi giao thành công.')
    }

    const event = await this.createTrackingEvent(tx, {
      ...input,
      eventType: TRACKING_EVENT_TYPE.STATUS_CHANGE,
      status: input.status,
    })

    const shouldClearTripAndHub = input.status === ORDER_STATUS.DELIVERED
    const updateData: Record<string, unknown> = {
      status: input.status,
      ...(input.createdById != null ? { updatedById: input.createdById } : {}),
      ...(shouldClearTripAndHub ? { currentHubId: null, currentTripId: null } : {}),
      ...(input.nextOrderData ?? {}),
    }

    const updatedOrder = await tx.order.update({
      where: { id: input.orderId },
      data: updateData,
      select: {
        customerId: true,
        id: true,
        status: true,
        trackingCode: true,
      },
    })

    await this.auditLogService?.record(
      {
        action: 'ORDER_STATUS_CHANGED',
        actorUserId: input.createdById ?? null,
        after: { status: updatedOrder.status },
        before: { currentHubId: order.currentHubId, currentTripId: order.currentTripId, status: order.status },
        entityId: order.id,
        entityType: 'ORDER',
        metadata: { source: input.source, trackingCode: order.trackingCode },
      },
      tx,
    )

    const shouldCollectCod =
      input.status === ORDER_STATUS.DELIVERED &&
      input.codCollection &&
      order.payment?.method === 'COD' &&
      order.payment.status !== 'COMPLETED' &&
      !order.isCodCollected

    if (shouldCollectCod) {
      await this.codSettlementService.collectCodForOrder(order.id, input.codCollection!.driverId, {
        amount: input.codCollection!.amount ?? Number(order.payment?.amount ?? order.codAmount ?? 0),
        orderReference: input.codCollection!.orderReference ?? order.trackingCode ?? String(order.id),
        tx,
      })
    }

    return { event, order: updatedOrder }
  }

  /**
   * Helper utility to insert a tracking event record and optional Proof of Delivery (POD) attachments.
   * Tiện ích bổ trợ để chèn bản ghi sự kiện hành trình và đính kèm Proof of Delivery (POD) tùy chọn.
   *
   * @param {OrderStateTransaction} tx - The Prisma transaction client.
   * @param {OrderStateTransaction} tx - Client giao dịch Prisma.
   * @param {object} input - Properties of the tracking event and POD payload.
   * @param {object} input - Các thuộc tính của sự kiện hành trình và payload POD.
   * @returns {Promise<any>} The created tracking event database record.
   * @returns {Promise<any>} Bản ghi sự kiện hành trình CSDL đã tạo.
   */
  private async createTrackingEvent(
    tx: OrderStateTransaction,
    input: TrackingEventInput & {
      eventType: TrackingEventTypeValue
      orderId: number
      status?: OrderStatusType | null
    },
  ) {
    const now = new Date()
    const event = await tx.orderTrackingEvent.create({
      data: {
        attemptNumber: input.attemptNumber ?? null,
        createdById: input.createdById ?? null,
        description: input.description ?? null,
        eventType: input.eventType,
        failureReasonCode: input.failureReasonCode ?? null,
        latitude: input.latitude ?? null,
        location: input.location ?? null,
        longitude: input.longitude ?? null,
        occurredAt: input.occurredAt ?? now,
        orderId: input.orderId,
        recordedAt: now,
        source: input.source,
        status: input.status ?? null,
      },
    })

    if (input.pod) {
      await tx.proofOfDelivery.create({
        data: {
          deliveryNote: input.pod.deliveryNote ?? null,
          images: {
            create: input.pod.images.map((image) => ({
              type: image.type,
              url: image.url,
            })),
          },
          packageCondition: input.pod.packageCondition,
          receiverName: input.pod.receiverName,
          receiverRelation: input.pod.receiverRelation ?? null,
          trackingEventId: event.id,
        },
      })
    }

    return event
  }

  /**
   * Standardizes transition validation rules under strict or system modes.
   * Tiêu chuẩn hóa các quy tắc xác thực chuyển đổi dưới chế độ strict hoặc system.
   *
   * Checks if transition from current to new status is allowed based on the system state machine.
   * Kiểm tra xem việc chuyển từ trạng thái hiện tại sang trạng thái mới có được phép dựa trên máy trạng thái hệ thống không.
   *
   * @param {string} currentStatus - The current status of the order.
   * @param {string} currentStatus - Trạng thái hiện tại của đơn hàng.
   * @param {string} newStatus - The targeted new status.
   * @param {string} newStatus - Trạng thái mới nhắm tới.
   * @param {TransitionValidationMode} validationMode - 'strict', 'system' or 'none'.
   * @param {TransitionValidationMode} validationMode - Chế độ xác thực: 'strict', 'system' hoặc 'none'.
   * @throws {BadRequestException} If transition is invalid or attempt is redundant.
   * @throws {BadRequestException} Nếu chuyển đổi không hợp lệ hoặc thao tác bị thừa.
   */
  private validateStatusTransition(
    currentStatus: string,
    newStatus: string,
    validationMode: TransitionValidationMode,
  ): void {
    if (validationMode === 'none') return
    if (currentStatus === newStatus) {
      throw new BadRequestException(`Đơn hàng đã ở trạng thái "${newStatus}".`)
    }

    const allowedTransitions =
      validationMode === 'system'
        ? [...(VALID_STATUS_TRANSITIONS[currentStatus] ?? []), ...(SYSTEM_STATUS_TRANSITIONS[currentStatus] ?? [])]
        : VALID_STATUS_TRANSITIONS[currentStatus]

    if (!allowedTransitions?.length) {
      throw new BadRequestException(`Trạng thái "${currentStatus}" là trạng thái cuối, không thể chuyển tiếp.`)
    }

    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Không thể chuyển từ "${currentStatus}" sang "${newStatus}". Chỉ cho phép: [${allowedTransitions.join(', ')}]`,
      )
    }
  }

  /**
   * Helper to emit push/realtime updates when order status changes to a user-notifiable state.
   * Bổ trợ để phát các cập nhật push/realtime khi trạng thái đơn hàng thay đổi sang trạng thái cần báo cho người dùng.
   *
   * @param {object} order - The basic order properties.
   * @param {object} order - Các thuộc tính cơ bản của đơn hàng.
   * @returns {Promise<void>}
   */
  private async emitOrderStatusNotification(order: {
    customerId: number
    id: number
    status: string
    trackingCode: string
  }) {
    if (!isNotifiableOrderStatus(order.status)) return

    await this.notificationEmitter.emitSafe(NotificationEventName.ORDER_STATUS_UPDATED, {
      userId: order.customerId,
      orderId: order.id,
      trackingCode: order.trackingCode,
      status: order.status as OrderStatusUpdatedEvent['status'],
    })
  }

  /**
   * Validates array of order IDs for uniqueness and non-emptiness.
   * Xác thực mảng ID đơn hàng để đảm bảo tính duy nhất và không trống rỗng.
   *
   * @param {number[]} orderIds - Array of order IDs.
   * @param {number[]} orderIds - Mảng ID các đơn hàng.
   * @returns {number[]} The array of unique order IDs.
   * @returns {number[]} Mảng các ID đơn hàng duy nhất.
   * @throws {BadRequestException} If duplicate IDs are found or array is empty.
   * @throws {BadRequestException} Nếu phát hiện ID trùng lặp hoặc mảng trống.
   */
  private assertUniqueOrderIds(orderIds: number[]) {
    const uniqueOrderIds = [...new Set(orderIds)]
    if (uniqueOrderIds.length !== orderIds.length) {
      throw new BadRequestException('Danh sách đơn hàng không được chứa trùng lặp.')
    }
    if (!uniqueOrderIds.length) {
      throw new BadRequestException('Cần chọn ít nhất một đơn hàng.')
    }
    return uniqueOrderIds
  }
}
