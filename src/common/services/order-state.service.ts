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

@Injectable()
export class OrderStateService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly codSettlementService: CodSettlementService,
    private readonly notificationEmitter: NotificationEmitterService,
    @Optional() private readonly auditLogService?: AuditLogService,
  ) {}

  async transitionOrderStatus(input: TransitionOrderStatusInput) {
    const result = input.tx
      ? await this.transitionSingleWithClient(input.tx, input)
      : await this.prismaService.$transaction((tx) => this.transitionSingleWithClient(tx, input))

    await this.emitOrderStatusNotification(result.order)
    return result
  }

  async recordSystemTransition(input: Omit<TransitionOrderStatusInput, 'createdById' | 'source' | 'validationMode'>) {
    return this.transitionOrderStatus({
      ...input,
      createdById: null,
      source: EVENT_SOURCE.SYSTEM,
      validationMode: 'system',
    })
  }

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
