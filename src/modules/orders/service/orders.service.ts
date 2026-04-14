import { Injectable, Logger } from '@nestjs/common'
import { CreateOrderBodyType, GetOrderListQueryType, UpdateOrderStatusType } from '../model/order.model'
import { OrderRepository } from '../repository/order.repo'
import { calculateHaversineDistance } from 'src/utils/geo.util'
import { PrismaService } from 'src/database/prisma.service'

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name)

  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly prismaService: PrismaService,
  ) {}

  /**
   * Tìm Hub gần nhất với tọa độ người gửi (Geo-Fencing Assignment).
   * Sử dụng Haversine Distance để so sánh khoảng cách chim bay từ sender tới toàn bộ Hub.
   * Giải quyết bài toán "Đơn mồ côi" - đơn hàng mới tạo không thuộc Hub nào.
   */
  private async findNearestHubId(senderLat: number, senderLng: number): Promise<number | null> {
    const activeHubs = await this.prismaService.hub.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, latitude: true, longitude: true, name: true },
    })

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

    // 4. Tính toán lượng CO2 tiết kiệm giả định (Green Tech)
    // Ví dụ: Tiết kiệm được 0.05kg CO2 cho mỗi km bằng xe điện chuyên chở gom chuyến ghép.
    const estimatedCo2Saved = distanceKm * 0.05

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

    return baseFee + distanceFee + heavyFee
  }

  async findAll(query: GetOrderListQueryType) {
    return this.orderRepo.findAll(query)
  }

  async findById(id: number) {
    return this.orderRepo.findById(id)
  }

  async update(id: number, payload: UpdateOrderStatusType) {
    return this.orderRepo.update(id, payload)
  }

  async delete(id: number, deletedById: number) {
    return this.orderRepo.delete({ id, deletedById })
  }
}
