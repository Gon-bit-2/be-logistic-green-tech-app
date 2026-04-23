import { Injectable, Logger } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import {
  CreateOrderBodyType,
  GetOrderListQueryType,
  UpdateOrderStatusType,
  OrderQuoteBodyType,
} from '../model/order.model'
import { OrderRepository } from '../repository/order.repo'
import { MapsService } from 'src/modules/maps/service/maps.service'
import { calculateHaversineDistance } from 'src/utils/geo.util'
import { PrismaService } from 'src/database/prisma.service'
import {
  NotificationEventName,
  OrderCreatedEvent,
  OrderStatusUpdatedEvent,
} from 'src/modules/notification/events/notification.event'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import roleName from 'src/common/constants/role.constant'
import type { AccessTokenPayload } from 'src/types/jwt.type'

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name)
  private readonly notifiableOrderStatuses: OrderStatusUpdatedEvent['status'][] = [
    ORDER_STATUS.OUT_FOR_DELIVERY,
    ORDER_STATUS.DELIVERED,
    ORDER_STATUS.CANCELLED,
  ]

  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly prismaService: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly mapsService: MapsService,
  ) {}

  async quote(payload: OrderQuoteBodyType) {
    let totalWeight = 0
    let totalVolume = 0

    payload.items.forEach((item) => {
      const itemWeight = item.weight * item.quantity
      totalWeight += itemWeight
      let itemVolume = 0
      if (item.length && item.width && item.height) {
        itemVolume = ((item.length * item.width * item.height) / 1000000) * item.quantity
      }
      totalVolume += itemVolume
    })

    const distanceKm = calculateHaversineDistance(
      payload.senderLat,
      payload.senderLng,
      payload.receiverLat,
      payload.receiverLng,
    )

    const shippingFee = this.calculateShippingFee(distanceKm, totalWeight)

    const averageDieselEmissionPerKm = 0.25
    const avgVehicleCapacityWeight = 1000
    const loadRatio = Math.min(totalWeight / avgVehicleCapacityWeight, 1)
    const effectiveLoadRatio = Math.max(loadRatio, 0.05)
    const estimatedCo2Saved = averageDieselEmissionPerKm * distanceKm * effectiveLoadRatio

    const directions = await this.mapsService.directions({
      origin: { lat: payload.senderLat, lng: payload.senderLng },
      destination: { lat: payload.receiverLat, lng: payload.receiverLng },
      vehicle: 'car',
    })

    return {
      distanceMeters: directions.distanceMeters,
      durationSeconds: directions.durationSeconds,
      shippingFee,
      currency: 'VND',
      serviceType: payload.serviceType,
      estimatedCo2Saved,
      polyline: directions.polyline,
    }
  }

  // ====== #10: HUB GEOSPATIAL CACHE ======
  // Thay vì query `SELECT * FROM hubs` mỗi lần tạo đơn, cache list Hub trên RAM Node.js
  // Node.js v8 engine thừa sức tính Haversine cho 10,000 phần tử mảng trong <2ms (cực chuẩn cho Enterprise).
  private cachedActiveHubs: { id: number; latitude: number; longitude: number; name: string }[] | null = null
  private lastHubsCacheTime = 0
  private readonly HUBS_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

  /**
   * Tìm Hub gần nhất với tọa độ người gửi (Geo-Fencing Assignment).
   * Sử dụng Haversine Distance để so sánh khoảng cách chim bay từ sender tới toàn bộ Hub.
   * Giải quyết bài toán "Đơn mồ côi" - đơn hàng mới tạo không thuộc Hub nào.
   */
  private async findNearestHubId(senderLat: number, senderLng: number): Promise<number | null> {
    const now = Date.now()
    if (!this.cachedActiveHubs || now - this.lastHubsCacheTime > this.HUBS_CACHE_TTL_MS) {
      this.cachedActiveHubs = await this.prismaService.hub.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true, latitude: true, longitude: true, name: true },
      })
      this.lastHubsCacheTime = now
      this.logger.debug(`[CACHE] Refreshed Hubs Geo-Cache (${this.cachedActiveHubs.length} hubs)`)
    }

    const activeHubs = this.cachedActiveHubs

    if (!activeHubs.length) {
      this.logger.warn('[ORDER] Không có Hub nào đang hoạt động. Đơn hàng sẽ không được gán Hub.')
      return null
    }

    let nearestHubId: number | null = null
    let minDistance = Infinity

    for (const hub of activeHubs) {
      const dist = calculateHaversineDistance(senderLat, senderLng, hub.latitude, hub.longitude)
      if (dist < minDistance) {
        minDistance = dist
        nearestHubId = hub.id
      }
    }

    this.logger.log(
      `[ORDER] Gán đơn hàng về Hub gần nhất (ID: ${nearestHubId}, khoảng cách: ${minDistance.toFixed(2)}km)`,
    )
    return nearestHubId
  }

  async create(createdById: number, customerId: number, payload: CreateOrderBodyType) {
    let totalWeight = 0
    let totalVolume = 0

    // 1. Tính toán Tổng quan: Khối lượng và Thể tích
    payload.items.forEach((item) => {
      const itemWeight = item.weight * item.quantity
      totalWeight += itemWeight

      let itemVolume = 0
      if (item.length && item.width && item.height) {
        // Volume = (L * W * H) / 1,000,000 (m3) với giả định đầu vào là cm
        itemVolume = ((item.length * item.width * item.height) / 1000000) * item.quantity
      }
      totalVolume += itemVolume
    })

    // 2. Tính Khoảng cách (Haversine Formula) bằng km
    const distanceKm = calculateHaversineDistance(
      payload.senderLat,
      payload.senderLng,
      payload.receiverLat,
      payload.receiverLng,
    )

    // 3. Tính Phí Vận Chuyển
    const shippingFee = this.calculateShippingFee(distanceKm, totalWeight)

    // 4. Tính toán lượng CO2 tiết kiệm ước tính (Green Tech)
    // Hệ số tham khảo thực tế:
    // - Xe tải Diesel nhẹ (~1 tấn) xả khoảng 0.25 kg CO2 / km
    // - Xe điện (EV Van) xả 0 kg CO2 / km (tailpipe)
    // Co2 tiết kiệm = (0.25 kg/km) * distanceKm * (Tỷ trọng đơn hàng / Tải trọng xe 1000kg)
    // Note: Con số chính xác sẽ được tính lại bằng `emissionRatePerKm` của xe thực tế khi hoàn thành Trip.
    const averageDieselEmissionPerKm = 0.25 // kg CO2 / km
    const avgVehicleCapacityWeight = 1000 // kg
    const loadRatio = Math.min(totalWeight / avgVehicleCapacityWeight, 1) // Tránh ratio > 1 nếu đơn quá nặng

    // Đảm bảo đơn nhỏ bé không bị CO2 = 0 bằng cách chèn minimum load factor (VD: 5%)
    const effectiveLoadRatio = Math.max(loadRatio, 0.05)
    const estimatedCo2Saved = averageDieselEmissionPerKm * distanceKm * effectiveLoadRatio

    // 5. Geo-Fencing: Tìm Hub gần nhất với tọa độ người gửi và gán vào đơn
    const currentHubId = await this.findNearestHubId(payload.senderLat, payload.senderLng)

    // 6. Giao tiếp với Repository bằng Type chuẩn của Domain
    const createdOrder = await this.orderRepo.create(createdById, customerId, payload, {
      totalWeight,
      totalVolume,
      shippingFee,
      estimatedCo2Saved,
      currentHubId,
    })

    await this.emitNotificationEvent(NotificationEventName.ORDER_CREATED, {
      userId: createdOrder.customerId,
      orderId: createdOrder.id,
      trackingCode: createdOrder.trackingCode,
    })

    return {
      order: createdOrder,
    }
  }

  private calculateShippingFee(distanceKm: number, totalWeight: number): number {
    const baseFee = 15000
    let distanceFee = 0

    if (distanceKm <= 10) {
      distanceFee = distanceKm * 5500
    } else {
      distanceFee = 10 * 5500 + (distanceKm - 10) * 4000
    }

    let heavyFee = 0
    if (totalWeight > 5) {
      // Mỗi kg vượt mức > 5kg thì thu + 2,000 VND
      heavyFee = Math.ceil(totalWeight - 5) * 2000
    }

    return Math.round(baseFee + distanceFee + heavyFee)
  }

  async findAll(
    query: GetOrderListQueryType & { customerId?: number; currentHubId?: number },
    actor?: AccessTokenPayload,
  ) {
    let nextQuery = { ...query }

    if (actor?.roleName === roleName.WAREHOUSE_STAFF) {
      const warehouseUser = await this.prismaService.user.findFirst({
        where: {
          id: actor.userId,
          deletedAt: null,
          isDeleted: false,
        },
        select: {
          hubId: true,
        },
      })

      nextQuery = {
        ...nextQuery,
        currentHubId: warehouseUser?.hubId ?? -1,
      }
    }

    return this.orderRepo.findAll(nextQuery)
  }

  async findById(id: number) {
    return this.orderRepo.findById(id)
  }

  async update(id: number, payload: UpdateOrderStatusType) {
    const updatedOrder = await this.orderRepo.update(id, payload)

    if (this.shouldNotifyOrderStatus(updatedOrder.status)) {
      await this.emitNotificationEvent(NotificationEventName.ORDER_STATUS_UPDATED, {
        userId: updatedOrder.customerId,
        orderId: updatedOrder.id,
        trackingCode: updatedOrder.trackingCode,
        status: updatedOrder.status,
      })
    }

    return updatedOrder
  }

  async delete(id: number, deletedById: number) {
    return this.orderRepo.delete({ id, deletedById })
  }

  private shouldNotifyOrderStatus(status: string): status is OrderStatusUpdatedEvent['status'] {
    return this.notifiableOrderStatuses.some((item) => item === status)
  }

  private async emitNotificationEvent(
    eventName: typeof NotificationEventName.ORDER_CREATED,
    payload: OrderCreatedEvent,
  ): Promise<void>
  private async emitNotificationEvent(
    eventName: typeof NotificationEventName.ORDER_STATUS_UPDATED,
    payload: OrderStatusUpdatedEvent,
  ): Promise<void>
  private async emitNotificationEvent(
    eventName: typeof NotificationEventName.ORDER_CREATED | typeof NotificationEventName.ORDER_STATUS_UPDATED,
    payload: OrderCreatedEvent | OrderStatusUpdatedEvent,
  ) {
    try {
      await this.eventEmitter.emitAsync(eventName, payload)
    } catch (error) {
      this.logger.warn(
        `Notification event failed for ${eventName}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
