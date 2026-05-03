import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { TripRepository } from '../repository/trip.repository'
import { PrismaService } from 'src/database/prisma.service'
import { AUTO_DISPATCH_QUEUE_NAME } from 'src/common/constants/queue.constant'
import { calculateHaversineDistance } from 'src/common/utils/geo.util'
import { STOP_TYPE } from 'src/common/constants/trip.constant'
import { Logger } from '@nestjs/common'
import { TripStopType } from '../model/trip.model'
import { acquireLock, releaseLock } from 'src/common/utils/redis-lock.util'
import Redis from 'ioredis'
import envConfig from 'src/config/config'

@Processor(AUTO_DISPATCH_QUEUE_NAME)
export class TripsProcessor extends WorkerHost {
  private readonly logger = new Logger(TripsProcessor.name)
  private readonly redis: Redis

  constructor(
    private readonly tripRepository: TripRepository,
    private readonly prismaService: PrismaService,
  ) {
    super()
    // Khởi tạo Redis client riêng cho Distributed Lock (tách biệt với BullMQ connection)
    this.redis = new Redis({
      host: envConfig.REDIS_HOST,
      port: envConfig.REDIS_PORT,
      username: envConfig.REDIS_USERNAME,
      password: envConfig.REDIS_PASSWORD,
    })
  }

  async process(
    job: Job<{ hubId?: number }, { status: string; tripsCreated?: number; reason?: string }, string>,
  ): Promise<{ status: string; tripsCreated?: number; reason?: string } | undefined> {
    const { name, data } = job

    if (name === 'dispatch-local') {
      const hubId = data.hubId
      const lockResourceId = `hub-dispatch:${hubId ?? 'global'}`

      // ====== LỚP 1: DISTRIBUTED LOCK ======
      // Thử lấy lock. Nếu hub này đang bị worker khác xử lý → skip ngay.
      const lockValue = await acquireLock(this.redis, lockResourceId)
      if (!lockValue) {
        this.logger.warn(`[BULLMQ] Hub ${hubId} đang được xử lý bởi worker khác. Bỏ qua job ${job.id}.`)
        return { status: 'skipped', reason: 'Hub is locked by another worker' }
      }

      try {
        return await this.executeDispatch(hubId)
      } finally {
        // Luôn giải phóng lock dù thành công hay thất bại (tránh deadlock)
        await releaseLock(this.redis, lockResourceId, lockValue)
      }
    }
  }

  /**
   * Logic điều phối chính (tách ra method riêng để code sạch hơn sau khi thêm lớp lock)
   */
  private async executeDispatch(hubId?: number): Promise<{ status: string; tripsCreated?: number; reason?: string }> {
    this.logger.log(`[BULLMQ] Start processing dispatch-local for Hub ${hubId ?? 'Global'}`)

    // 1. Phân lập Dữ Liệu
    const vehicles = await this.tripRepository.findAvailableVehicles(hubId)
    let pendingOrders = await this.tripRepository.findPendingOrders(hubId)

    if (!vehicles.length || !pendingOrders.length) {
      this.logger.log(`[BULLMQ] No available vehicles or pending orders for Hub: ${hubId}. Skipping...`)
      return { status: 'skipped', reason: 'No resources' }
    }

    // Lấy danh sách tài xế rảnh rỗi thuộc cùng Hub, không đang vướng Trip nào
    const availableDrivers = await this.tripRepository.findAvailableDrivers(hubId)

    if (!availableDrivers.length) {
      this.logger.warn(`[BULLMQ] No available driver for Hub ${hubId}. Cannot dispatch.`)
      return { status: 'skipped', reason: 'No driver' }
    }

    let tripsCreated = 0

    // 2. Thuật toán Bin Packing (First-Fit Decreasing heuristic)
    for (const vehicle of vehicles) {
      if (pendingOrders.length === 0) break
      if (availableDrivers.length === 0) {
        this.logger.warn(`[BULLMQ] Hết tài xế rảnh. Dừng phân xe tại Hub ${hubId}.`)
        break
      }

      let remWeight = vehicle.capacityWeight
      let remVolume = vehicle.capacityVolume

      const assignedOrders: typeof pendingOrders = []

      // Vòng lặp sắp hàng vào không gian chứa (Knapsack)
      for (let i = 0; i < pendingOrders.length; i++) {
        const order = pendingOrders[i]
        if (order.totalWeight <= remWeight && order.totalVolume <= remVolume) {
          assignedOrders.push(order)
          remWeight -= order.totalWeight
          remVolume -= order.totalVolume
        }
      }

      if (assignedOrders.length > 0) {
        // Bỏ các đơn đã assign ra khỏi túi (bucket) để xét cho vòng lặp xe kế tiếp
        const assignedIds = new Set(assignedOrders.map((o) => o.id))
        pendingOrders = pendingOrders.filter((o) => !assignedIds.has(o.id))

        // Gán tài xế đầu tiên trong danh sách rảnh, rồi loại khỏi pool (1 driver = 1 trip)
        const driver = availableDrivers.shift()!
        const driverId = driver.id

        // 3. Route Optimization: Thuật toán Traveling Salesman (Nearest Neighbor) với ràng buộc PDP
        // Áp dụng mô hình Hub-and-Spoke: Phân biệt đơn Nội ô (< 100km) và Liên tỉnh (>= 100km)
        const LOCAL_DELIVERY_THRESHOLD_KM = 100

        // Lấy tọa độ Hub hiện tại để dùng cho HUB_TRANSFER node
        let hubLat = 0
        let hubLng = 0
        if (hubId) {
          const hub = await this.prismaService.hub.findUnique({ where: { id: hubId } })
          if (hub) {
            hubLat = hub.latitude
            hubLng = hub.longitude
          }
        }

        const unvisitedNodes: {
          orderId: number
          type: string
          lat: number
          lng: number
          hubId: number | null
          timeWindowEnd?: Date | null
        }[] = []
        for (const o of assignedOrders) {
          // Tính khoảng cách sender -> receiver để phân loại đơn nội ô / liên tỉnh
          const orderDistance = calculateHaversineDistance(o.senderLat, o.senderLng, o.receiverLat, o.receiverLng)

          // Node PICKUP luôn có (lấy hàng tại nhà người gửi)
          unvisitedNodes.push({
            orderId: o.id,
            type: STOP_TYPE.PICKUP,
            lat: o.senderLat,
            lng: o.senderLng,
            hubId: null,
            timeWindowEnd: null, // Thường điểm lấy hàng ít gắt gao hơn điểm giao
          })

          if (orderDistance < LOCAL_DELIVERY_THRESHOLD_KM) {
            // Nội ô: Giao thẳng tận nhà người nhận (Direct Last-mile)
            unvisitedNodes.push({
              orderId: o.id,
              type: STOP_TYPE.DROPOFF,
              lat: o.receiverLat,
              lng: o.receiverLng,
              hubId: null,
              timeWindowEnd: o.preferredDeliveryTimeEnd, // Ràng buộc thời gian khách yêu cầu
            })
          } else {
            // Liên tỉnh: Xe lấy hàng xong quay về Hub để hạ bãi (First-mile -> Hub Transfer)
            // Hàng sẽ chờ chành xe tải lớn bốc đi chặng tiếp theo (Phase sau)
            this.logger.log(
              `[ROUTE] Đơn #${o.id} liên tỉnh (${orderDistance.toFixed(1)}km). Chuyển DROPOFF -> HUB_TRANSFER tại Hub ${hubId}`,
            )
            unvisitedNodes.push({
              orderId: o.id,
              type: STOP_TYPE.HUB_TRANSFER,
              lat: hubLat,
              lng: hubLng,
              hubId: hubId ?? null,
              timeWindowEnd: null, // Chuyển về Hub không có time window
            })
          }
        }

        const pickedUpOrders = new Set<number>()
        const sortedNodes: {
          orderId: number
          type: string
          lat: number
          lng: number
          hubId: number | null
          expectedArrivalTime?: Date | null
        }[] = []

        // Node Start Point: Sử dụng tọa độ Hub đã lấy trước đó (tránh query DB lần 2)
        let currentLat = hubLat || unvisitedNodes[0].lat
        let currentLng = hubLng || unvisitedNodes[0].lng

        // Cấu hình Time Window
        let currentTime = new Date() // Giả định giờ xe bắt đầu chạy
        const AVERAGE_SPEED_KMH = 30 // Tốc độ TB xe nội ô

        // Greedily duyệt Node
        while (unvisitedNodes.length > 0) {
          let bestIndex = -1
          let minDist = Infinity

          for (let i = 0; i < unvisitedNodes.length; i++) {
            const node = unvisitedNodes[i]

            // [Constraint PDP] Không được phép giao/hạ hàng (DROPOFF/HUB_TRANSFER) khi chưa lấy hàng (PICKUP)
            const isDeliveryNode = node.type === STOP_TYPE.DROPOFF || node.type === STOP_TYPE.HUB_TRANSFER
            if (isDeliveryNode && !pickedUpOrders.has(node.orderId)) {
              continue
            }

            const dist = calculateHaversineDistance(currentLat, currentLng, node.lat, node.lng)

            // Tính toán thời gian ETA
            const travelTimeHours = dist / AVERAGE_SPEED_KMH
            const arrivalTime = new Date(currentTime.getTime() + travelTimeHours * 3600000)

            // ====== #5: RÀNG BUỘC TIME WINDOWS (Mô hình Penalty) ======
            let timePenalty = 0
            if (node.timeWindowEnd && arrivalTime > node.timeWindowEnd) {
              // Phạt 10km ảo cho mỗi phút trễ -> Thuật toán bù trừ sẽ ép xe ưu tiên ghé đây trước
              const delayMs = arrivalTime.getTime() - node.timeWindowEnd.getTime()
              timePenalty = (delayMs / 60000) * 10
            }

            const totalCost = dist + timePenalty

            if (totalCost < minDist) {
              minDist = totalCost
              bestIndex = i
            }
          }

          if (bestIndex === -1) {
            // Edge case an toàn
            break
          }

          // Bóc Node tốt nhất ra khỏi unvisited
          const bestNode = unvisitedNodes.splice(bestIndex, 1)[0]

          // Tính lại giờ ETA chuẩn để cập nhật vào currentTime
          const actualDist = calculateHaversineDistance(currentLat, currentLng, bestNode.lat, bestNode.lng)
          currentTime = new Date(currentTime.getTime() + (actualDist / AVERAGE_SPEED_KMH) * 3600000)

          sortedNodes.push({
            orderId: bestNode.orderId,
            type: bestNode.type,
            lat: bestNode.lat,
            lng: bestNode.lng,
            hubId: bestNode.hubId,
            expectedArrivalTime: new Date(currentTime),
          })

          // Đánh dấu đã Pickup để cởi trói cờ chặn cho Dropoff
          if (bestNode.type === STOP_TYPE.PICKUP) {
            pickedUpOrders.add(bestNode.orderId)
          }

          // Di chuyển vị trí hiện tại
          currentLat = bestNode.lat
          currentLng = bestNode.lng
        }

        // ====== #4: RETURN-TO-DEPOT ======
        // Xe phải quay về Hub sau khi hoàn thành tất cả các điểm dừng
        if (hubLat && hubLng) {
          sortedNodes.push({
            orderId: 0, // Không gắn đơn hàng cụ thể
            type: STOP_TYPE.HUB_TRANSFER,
            lat: hubLat,
            lng: hubLng,
            hubId: hubId ?? null,
          })
        }

        // Tính tổng khoảng cách tuyến đường (dùng để ghi nhận vào Trip.totalDistance)
        let totalDistance = 0
        let prevLat = hubLat || sortedNodes[0]?.lat || 0
        let prevLng = hubLng || sortedNodes[0]?.lng || 0
        for (const node of sortedNodes) {
          totalDistance += calculateHaversineDistance(prevLat, prevLng, node.lat, node.lng)
          prevLat = node.lat
          prevLng = node.lng
        }

        // 4. Map Data và Lưu Database (Transaction)
        const stopsData: Omit<TripStopType, 'id' | 'tripId'>[] = sortedNodes.map((node, idx) => ({
          orderId: node.orderId === 0 ? null : node.orderId, // Return-to-depot không gắn order
          stopType: node.type as TripStopType['stopType'],
          stopSequence: idx + 1,
          expectedArrivalTime: node.expectedArrivalTime ?? null,
          actualArrivalTime: null,
          hubId: node.hubId,
        }))

        await this.tripRepository.createTripWithStops(
          vehicle.id,
          driverId,
          assignedOrders.map((o) => o.id),
          stopsData,
          totalDistance, // Truyền tổng khoảng cách xuống Repository
        )

        tripsCreated++
      }
    }

    this.logger.log(`[BULLMQ] Dispatch completed: Generated ${tripsCreated} trips for Hub ${hubId}`)
    return { status: 'success', tripsCreated }
  }
}
