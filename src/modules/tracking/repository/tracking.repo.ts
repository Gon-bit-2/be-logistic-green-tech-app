import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/database/prisma.service'
import { CreateTrackingEventType } from '../model/tracking.model'
import { ORDER_STATUS } from 'src/common/constants/order.constant'

type CodCollectionOptions = {
  amount: number
  driverId: number
  orderReference: string
}

@Injectable()
export class TrackingRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Tạo tracking event + cập nhật status đơn hàng trong 1 Transaction
   * Đảm bảo tính toàn vẹn: event và order.status luôn đồng bộ
   */
  async createEventWithStatusUpdate(
    createdById: number,
    payload: CreateTrackingEventType,
    shouldUpdateOrderStatus: boolean,
    options?: {
      codCollection?: CodCollectionOptions
      extraOrderUpdate?: Record<string, unknown>
    },
  ) {
    return this.prismaService.$transaction(async (tx) => {
      const now = new Date()

      // 1. Insert tracking event (append-only log)
      const event = await tx.orderTrackingEvent.create({
        data: {
          orderId: payload.orderId,
          eventType: payload.eventType,
          status: payload.status ?? null,
          latitude: payload.latitude ?? null,
          longitude: payload.longitude ?? null,
          location: payload.location ?? null,
          description: payload.description ?? null,
          source: payload.source,
          failureReasonCode: payload.failureReasonCode ?? null,
          attemptNumber: payload.attemptNumber ?? null,
          occurredAt: payload.occurredAt ?? now,
          recordedAt: now,
          createdById,
        },
      })

      // 2. Tạo POD nếu có (event giao thành công)
      if (payload.pod) {
        await tx.proofOfDelivery.create({
          data: {
            trackingEventId: event.id,
            receiverName: payload.pod.receiverName,
            receiverRelation: payload.pod.receiverRelation ?? null,
            packageCondition: payload.pod.packageCondition,
            deliveryNote: payload.pod.deliveryNote ?? null,
            images: {
              create: payload.pod.images.map((img) => ({
                url: img.url,
                type: img.type,
              })),
            },
          },
        })
      }

      // 3. Cập nhật status đơn hàng (chỉ khi eventType = STATUS_CHANGE)
      if (shouldUpdateOrderStatus && payload.status) {
        const updateData: Record<string, unknown> = {
          status: payload.status,
          updatedById: createdById,
        }

        // Nếu DELIVERED → xóa currentTripId (đã giao xong, đơn không còn trên xe)
        if (payload.status === ORDER_STATUS.DELIVERED) {
          updateData.currentTripId = null
          updateData.currentHubId = null
          if (options?.codCollection) {
            updateData.isCodCollected = true
            updateData.codCollectedAt = now
          }
        }

        if (options?.extraOrderUpdate) {
          Object.assign(updateData, options.extraOrderUpdate)
        }

        await tx.order.update({
          where: { id: payload.orderId },
          data: updateData,
        })
      }

      if (options?.codCollection) {
        const wallet = await tx.wallet.upsert({
          where: { userId: options.codCollection.driverId },
          create: { userId: options.codCollection.driverId },
          update: {},
        })

        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            amount: options.codCollection.amount,
            type: 'COD_COLLECTION',
            status: 'COMPLETED',
            referenceId: `ORDER_${payload.orderId}`,
            description: `Thu hộ COD cho đơn hàng #${options.codCollection.orderReference}`,
          },
        })

        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            codCollected: {
              increment: options.codCollection.amount,
            },
          },
        })

        await tx.payment.update({
          where: { orderId: payload.orderId },
          data: {
            status: 'COMPLETED',
            paidAt: now,
            updatedById: options.codCollection.driverId,
          },
        })
      }

      return event
    })
  }

  /**
   * Lấy timeline tracking của 1 đơn hàng (sort theo thời gian xảy ra)
   * Include POD + images nếu có
   */
  async findByOrderId(orderId: number) {
    return this.prismaService.orderTrackingEvent.findMany({
      where: { orderId },
      include: {
        pod: {
          include: {
            images: true,
          },
        },
        createdBy: {
          select: { id: true, fullName: true, role: { select: { name: true } } },
        },
      },
      orderBy: { occurredAt: 'asc' },
    })
  }

  /**
   * Lấy event mới nhất có STATUS_CHANGE của 1 đơn
   * Dùng để kiểm tra trạng thái hiện tại trước khi chuyển trạng thái mới
   */
  async findLatestStatusEvent(orderId: number) {
    return this.prismaService.orderTrackingEvent.findFirst({
      where: {
        orderId,
        eventType: 'STATUS_CHANGE',
      },
      orderBy: { occurredAt: 'desc' },
    })
  }

  /**
   * Đếm số lần giao thất bại (EXCEPTION) cho 1 đơn
   * Dùng để check đã vượt MAX_DELIVERY_ATTEMPTS chưa
   */
  async countFailedAttempts(orderId: number): Promise<number> {
    return this.prismaService.orderTrackingEvent.count({
      where: {
        orderId,
        eventType: 'EXCEPTION',
        failureReasonCode: { not: null },
      },
    })
  }
}
