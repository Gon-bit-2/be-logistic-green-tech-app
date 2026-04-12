import { Injectable } from '@nestjs/common'
import { CreateOrderBodyType, GetOrderListQueryType, UpdateOrderStatusType } from '../model/order.model'
import { OrderRepository } from '../repository/order.repo'
import { calculateHaversineDistance } from 'src/utils/geo.util'
@Injectable()
export class OrdersService {
  constructor(private readonly orderRepo: OrderRepository) {}

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

    // 5. Giao tiếp với Repository bằng Type chuẩn của Domain
    const createdOrder = await this.orderRepo.create(createdById, customerId, payload, {
      totalWeight,
      totalVolume,
      shippingFee,
      estimatedCo2Saved,
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
