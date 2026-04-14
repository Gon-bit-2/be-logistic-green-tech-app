import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { StripRepository } from '../repository/trip.repository'
import { PrismaService } from 'src/database/prisma.service'
import { AUTO_DISPATCH_QUEUE_NAME } from 'src/common/constants/queue.constant'
import { calculateHaversineDistance } from 'src/utils/geo.util'
import { STOP_TYPE } from 'src/common/constants/strip.constant'
import { Logger } from '@nestjs/common'
import { TripStopType } from '../model/trip.model'

@Processor(AUTO_DISPATCH_QUEUE_NAME)
export class StripsProcessor extends WorkerHost {
  private readonly logger = new Logger(StripsProcessor.name)

  constructor(
    private readonly stripRepository: StripRepository,
    private readonly prismaService: PrismaService,
  ) {
    super()
  }

  async process(
    job: Job<{ hubId?: number }, { status: string; tripsCreated?: number; reason?: string }, string>,
  ): Promise<{ status: string; tripsCreated?: number; reason?: string } | undefined> {
    const { name, data } = job

    if (name === 'dispatch-local') {
      const hubId = data.hubId
      this.logger.log(`[BULLMQ] Start processing dispatch-local for Hub ${hubId ?? 'Global'}`)

      // 1. Phân lập Dữ Liệu
      const vehicles = await this.stripRepository.findAvailableVehicles(hubId)
      let pendingOrders = await this.stripRepository.findPendingOrders(hubId)

      if (!vehicles.length || !pendingOrders.length) {
        this.logger.log(`[BULLMQ] No available vehicles or pending orders for Hub: ${hubId}. Skipping...`)
        return { status: 'skipped', reason: 'No resources' }
      }

      // Lấy danh sách tài xế (Giả định trong hệ thống có sẵn driver rảnh)
      const availableDrivers = await this.prismaService.user.findMany({
        where: { role: { name: 'DRIVER' }, isDeleted: false, deletedAt: null },
      })

      if (!availableDrivers.length) {
        this.logger.warn(`[BULLMQ] No driver found. Cannot dispatch.`)
        return { status: 'skipped', reason: 'No driver' }
      }

      let driverIndex = 0
      let tripsCreated = 0

      // 2. Thuật toán Bin Packing (First-Fit Decreasing heuristic)
      for (const vehicle of vehicles) {
        if (pendingOrders.length === 0) break

        let remWeight = vehicle.capacityWeight
        let remVolume = vehicle.capacityVolume

        const assignedOrders: typeof pendingOrders = []

        // Vòng lặp sắp hàng vào không gian chứa (Knapsack)
        for (let i = 0; i < pendingOrders.length; i++) {
          const order = pendingOrders[i]
          if (order.totalWeight <= remWeight && order.totalVolume <= remVolume) {
            assignedOrders.push(order)
            remWeight -= order.totalWeight
            remVolume -= order.totalVolume // Nếu thiết kế đúng, capacityVolume trên DB sẽ > 0
          }
        }

        if (assignedOrders.length > 0) {
          // Bỏ các đơn đã assign ra khỏi túi (bucket) để xét cho vòng lặp xe kế tiếp
          const assignedIds = new Set(assignedOrders.map((o) => o.id))
          pendingOrders = pendingOrders.filter((o) => !assignedIds.has(o.id))

          // Lấy xoay vòng Driver để giả lập chia đều việc
          const driverId = availableDrivers[driverIndex % availableDrivers.length].id
          driverIndex++

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

          const unvisitedNodes: { orderId: number; type: string; lat: number; lng: number; hubId: number | null }[] = []
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
            })

            if (orderDistance < LOCAL_DELIVERY_THRESHOLD_KM) {
              // Nội ô: Giao thẳng tận nhà người nhận (Direct Last-mile)
              unvisitedNodes.push({
                orderId: o.id,
                type: STOP_TYPE.DROPOFF,
                lat: o.receiverLat,
                lng: o.receiverLng,
                hubId: null,
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
              })
            }
          }

          const pickedUpOrders = new Set<number>()
          const sortedNodes: { orderId: number; type: string; lat: number; lng: number; hubId: number | null }[] = []

          // Node Start Point: Sử dụng tọa độ Hub đã lấy trước đó (tránh query DB lần 2)
          let currentLat = hubLat || unvisitedNodes[0].lat
          let currentLng = hubLng || unvisitedNodes[0].lng

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
              if (dist < minDist) {
                minDist = dist
                bestIndex = i
              }
            }

            if (bestIndex === -1) {
              // Edge case an toàn
              break
            }

            // Bóc Node tốt nhất ra khỏi unvisited
            const bestNode = unvisitedNodes.splice(bestIndex, 1)[0]
            sortedNodes.push(bestNode)

            // Đánh dấu đã Pickup để cởi trói cờ chặn cho Dropoff
            if (bestNode.type === STOP_TYPE.PICKUP) {
              pickedUpOrders.add(bestNode.orderId)
            }

            // Di chuyển vị trí hiện tại
            currentLat = bestNode.lat
            currentLng = bestNode.lng
          }

          // 4. Map Data và Lưu Database (Transaction)
          const stopsData: Omit<TripStopType, 'id' | 'tripId'>[] = sortedNodes.map((node, idx) => ({
            orderId: node.orderId,
            stopType: node.type as TripStopType['stopType'],
            stopSequence: idx + 1,
            expectedArrivalTime: null,
            actualArrivalTime: null,
            hubId: node.hubId, // Ghi nhận Hub cho các trạm HUB_TRANSFER, null cho PICKUP/DROPOFF
          }))

          await this.stripRepository.createTripWithStops(
            vehicle.id,
            driverId,
            assignedOrders.map((o) => o.id),
            stopsData,
          )

          tripsCreated++
        }
      }

      this.logger.log(`[BULLMQ] Dispatch completed: Generated ${tripsCreated} trips for Hub ${hubId}`)
      return { status: 'success', tripsCreated }
    }
  }
}
