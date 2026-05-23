import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager'
import { NotificationEmitterService } from 'src/common/services/notification-emitter.service'
import {
  CreateOrderBodyType,
  GetOrderListQueryType,
  UpdateOrderStatusType,
  OrderQuoteBodyType,
} from '../model/order.model'
import { OrderRepository } from '../repository/order.repo'
import { MapsService } from 'src/modules/maps/service/maps.service'
import { calculateHaversineDistance } from 'src/common/utils/geo.util'
import { PrismaService } from 'src/database/prisma.service'
import {
  NotificationEventName,
} from 'src/modules/notification/events/notification.event'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import roleName from 'src/common/constants/role.constant'
import { EVENT_SOURCE } from 'src/common/constants/tracking.constant'
import { AccessTokenPayload } from 'src/common/types/jwt.type'
import { OrderStateService } from 'src/common/services/order-state.service'

const CUSTOMER_CANCELLABLE_STATUSES = new Set<string>([ORDER_STATUS.PENDING, ORDER_STATUS.ASSIGNED])
const ACTIVE_HUBS_GEO_CACHE_KEY = 'orders:active-hubs:geo'
const HUBS_CACHE_TTL_MS = 5 * 60 * 1000
type ActiveHubGeo = { id: number; latitude: number; longitude: number; name: string }

/**
 * Service managing shipping logic and the lifecycle of orders.
 * Service quản lý logic vận chuyển và vòng đời của đơn hàng.
 *
 * Implements fee quotes, nearest hub geospatial fencings, bulk listings,
 * and order state transformations.
 * Triển khai báo giá phí, xác định geo-fencing hub gần nhất, danh sách đơn hàng
 * và chuyển đổi trạng thái đơn hàng.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name)

  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly prismaService: PrismaService,
    private readonly notificationEmitter: NotificationEmitterService,
    private readonly mapsService: MapsService,
    private readonly orderStateService: OrderStateService,
    @Optional() @Inject(CACHE_MANAGER) private readonly cacheManager?: Cache,
  ) {}

  /**
   * Calculates shared order metrics used by both quote() and create().
   * Tính toán các chỉ số đơn hàng dùng chung cho cả quote() và create().
   *
   * DRY: Prevents duplicated calculation logic for weights, volumes, fees, and carbon.
   * DRY: Tránh duplicate logic tính weight, volume, phí vận chuyển, CO2.
   *
   * @param {OrderQuoteBodyType['items']} items - Order item payloads containing dimensions.
   * @param {OrderQuoteBodyType['items']} items - Payload các mặt hàng chứa kích thước.
   * @param {number} distanceKm - Estimated route distance in kilometers.
   * @param {number} distanceKm - Khoảng cách lộ trình ước tính tính bằng km.
   * @returns Calculated weight, volume, fee, and estimated CO2 saved.
   * @returns Trọng lượng, thể tích, phí và lượng CO2 tiết kiệm ước tính.
   */
  private calculateOrderMetrics(items: OrderQuoteBodyType['items'], distanceKm: number) {
    let totalWeight = 0
    let totalVolume = 0

    items.forEach((item) => {
      const itemWeight = item.weight * item.quantity
      totalWeight += itemWeight

      let itemVolume = 0
      if (item.length && item.width && item.height) {
        // Volume = (L * W * H) / 1,000,000 (m3) với giả định đầu vào là cm
        itemVolume = ((item.length * item.width * item.height) / 1000000) * item.quantity
      }
      totalVolume += itemVolume
    })

    const shippingFee = this.calculateShippingFee(distanceKm, totalWeight)

    // Tính toán lượng CO2 tiết kiệm ước tính (Green Tech)
    // - Xe tải Diesel nhẹ (~1 tấn) xả khoảng 0.25 kg CO2 / km
    // - Xe điện (EV Van) xả 0 kg CO2 / km (tailpipe)
    // Note: Con số chính xác sẽ được tính lại bằng `emissionRatePerKm` khi hoàn thành Trip.
    const averageDieselEmissionPerKm = 0.25
    const avgVehicleCapacityWeight = 1000
    const loadRatio = Math.min(totalWeight / avgVehicleCapacityWeight, 1)
    const effectiveLoadRatio = Math.max(loadRatio, 0.05)
    const estimatedCo2Saved = averageDieselEmissionPerKm * distanceKm * effectiveLoadRatio

    return { totalWeight, totalVolume, shippingFee, estimatedCo2Saved }
  }

  /**
   * Estimates shipping routes, costs, and carbon offsets for mock bookings.
   * Ước tính lộ trình, chi phí vận chuyển và lượng CO2 tiết kiệm khi báo giá.
   *
   * @param {OrderQuoteBodyType} payload - Route coordinates and item properties.
   * @param {OrderQuoteBodyType} payload - Tọa độ lộ trình và thông tin các mặt hàng.
   * @returns {Promise<any>} Shipping metrics including route polyline.
   * @returns {Promise<any>} Các chỉ số vận chuyển bao gồm polyline đường đi.
   */
  async quote(payload: OrderQuoteBodyType) {
    const distanceKm = calculateHaversineDistance(
      payload.senderLat,
      payload.senderLng,
      payload.receiverLat,
      payload.receiverLng,
    )

    const metrics = this.calculateOrderMetrics(payload.items, distanceKm)

    const directions = await this.mapsService.directions({
      origin: { lat: payload.senderLat, lng: payload.senderLng },
      destination: { lat: payload.receiverLat, lng: payload.receiverLng },
      vehicle: 'car',
    })

    return {
      distanceMeters: directions.distanceMeters,
      durationSeconds: directions.durationSeconds,
      shippingFee: metrics.shippingFee,
      currency: 'VND',
      serviceType: payload.serviceType,
      estimatedCo2Saved: metrics.estimatedCo2Saved,
      polyline: directions.polyline,
    }
  }

  // ====== #10: HUB GEOSPATIAL CACHE ======
  // Cache list Hub qua CacheModule/Redis để các instance dùng chung cùng một dữ liệu.
  /**
   * Resolves the nearest active hub utilizing geospatial distance equations.
   * Tìm Hub hoạt động gần nhất dựa trên tính toán khoảng cách tọa độ (Geo-Fencing Assignment).
   *
   * Utilizes Haversine Distance to compare geographic space distances from the sender to all hubs.
   * Sử dụng Haversine Distance để so sánh khoảng cách địa lý từ sender tới toàn bộ Hub.
   *
   * Prevents "orphaned orders" by automatically assigning them to hubs.
   * Giải quyết bài toán "đơn mồ côi" - đơn hàng mới tạo không thuộc Hub nào bằng cách tự động gán.
   *
   * @param {number} senderLat - Sender's latitude.
   * @param {number} senderLat - Vĩ độ của người gửi.
   * @param {number} senderLng - Sender's longitude.
   * @param {number} senderLng - Kinh độ của người gửi.
   * @returns {Promise<number | null>} Nearest active Hub ID or null.
   * @returns {Promise<number | null>} ID của Hub gần nhất đang hoạt động hoặc null.
   */
  private async findNearestHubId(senderLat: number, senderLng: number): Promise<number | null> {
    let activeHubs = (await this.cacheManager?.get<ActiveHubGeo[]>(ACTIVE_HUBS_GEO_CACHE_KEY)) ?? null

    if (!activeHubs) {
      activeHubs = await this.prismaService.hub.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true, latitude: true, longitude: true, name: true },
      })
      await this.cacheManager?.set(ACTIVE_HUBS_GEO_CACHE_KEY, activeHubs, HUBS_CACHE_TTL_MS)
      this.logger.debug(`[CACHE] Refreshed Hubs Geo-Cache (${activeHubs.length} hubs)`)
    }

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

  /**
   * Initializes a new order, binds it to the nearest hub, and emits notifications.
   * Khởi tạo đơn hàng mới, gán vào Hub gần nhất, và phát đi thông báo hệ thống.
   *
   * Calculates Haversine distance, resolves metrics, determines hub, and commits database writes.
   * Tính khoảng cách Haversine, phân giải chỉ số, xác định hub và thực hiện ghi cơ sở dữ liệu.
   *
   * @param {number} createdById - Authenticated creator ID.
   * @param {number} createdById - ID của người tạo đã xác thực.
   * @param {number} customerId - Target customer ID.
   * @param {number} customerId - ID khách hàng mục tiêu.
   * @param {CreateOrderBodyType} payload - Creation fields and items.
   * @param {CreateOrderBodyType} payload - Trường khởi tạo đơn hàng và các mặt hàng.
   * @returns {Promise<{ order: any }>} The newly created order record.
   * @returns {Promise<{ order: any }>} Bản ghi đơn hàng mới được tạo.
   */
  async create(createdById: number, customerId: number, payload: CreateOrderBodyType) {
    // 1. Tính Khoảng cách (Haversine Formula) bằng km
    const distanceKm = calculateHaversineDistance(
      payload.senderLat,
      payload.senderLng,
      payload.receiverLat,
      payload.receiverLng,
    )

    // 2. Tính toán metrics (weight, volume, phí, CO2) — dùng chung với quote()
    const metrics = this.calculateOrderMetrics(payload.items, distanceKm)

    // 3. Geo-Fencing: Tìm Hub gần nhất với tọa độ người gửi và gán vào đơn
    const currentHubId = await this.findNearestHubId(payload.senderLat, payload.senderLng)

    // 4. Giao tiếp với Repository bằng Type chuẩn của Domain
    const createdOrder = await this.orderRepo.create(createdById, customerId, payload, {
      totalWeight: metrics.totalWeight,
      totalVolume: metrics.totalVolume,
      shippingFee: metrics.shippingFee,
      estimatedCo2Saved: metrics.estimatedCo2Saved,
      currentHubId,
      paymentMethod: payload.paymentMethod ?? 'STRIPE',
    })

    await this.notificationEmitter.emitSafe(NotificationEventName.ORDER_CREATED, {
      userId: createdOrder.customerId,
      orderId: createdOrder.id,
      trackingCode: createdOrder.trackingCode,
    })

    return {
      order: createdOrder,
    }
  }

  /**
   * Computes the final shipping fee based on distance and weight thresholds.
   * Tính toán phí vận chuyển cuối cùng dựa trên ngưỡng khoảng cách và trọng lượng.
   *
   * @param {number} distanceKm - Travel distance in kilometers.
   * @param {number} distanceKm - Khoảng cách di chuyển tính bằng km.
   * @param {number} totalWeight - Cargo weight in kilograms.
   * @param {number} totalWeight - Tổng trọng lượng hàng hóa tính bằng kg.
   * @returns {number} Rounded shipping fee in VND.
   * @returns {number} Phí vận chuyển đã làm tròn tính bằng VND.
   */
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

  /**
   * Queries orders matching criteria with pagination and role constraints.
   * Truy vấn các đơn hàng khớp điều kiện kèm phân trang và ràng buộc vai trò.
   *
   * Limits warehouse staff visibility to their assigned hub orders.
   * Giới hạn hiển thị của nhân viên kho đối với các đơn thuộc hub mà họ được phân công.
   *
   * @param {GetOrderListQueryType & { customerId?: number; currentHubId?: number }} query - Query options (limit, page, search).
   * @param {GetOrderListQueryType & { customerId?: number; currentHubId?: number }} query - Tùy chọn truy vấn (giới hạn, trang, tìm kiếm).
   * @param {AccessTokenPayload} actor - Access token of the authenticated actor.
   * @param {AccessTokenPayload} actor - Access token của tác nhân đã xác thực.
   * @returns Paginated order results.
   * @returns Kết quả danh sách đơn hàng phân trang.
   */
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

  /**
   * Locates a single order by database ID.
   * Tìm kiếm một đơn hàng duy nhất bằng ID cơ sở dữ liệu.
   *
   * @param {number} id - Order ID.
   * @param {number} id - ID đơn hàng.
   * @returns {Promise<any>} Order record with details.
   * @returns {Promise<any>} Bản ghi đơn hàng kèm theo chi tiết.
   */
  async findById(id: number) {
    return this.orderRepo.findById(id)
  }

  /**
   * Modifies an order's status and transitions its lifecycle state safely.
   * Sửa đổi trạng thái của đơn hàng và chuyển đổi trạng thái vòng đời an toàn.
   *
   * @param {number} id - Order ID.
   * @param {number} id - ID đơn hàng.
   * @param {UpdateOrderStatusType} payload - Target status.
   * @param {UpdateOrderStatusType} payload - Trạng thái đích.
   * @param {AccessTokenPayload} actor - Authenticated actor.
   * @param {AccessTokenPayload} actor - Tác nhân thực hiện đã xác thực.
   * @returns {Promise<any>} The updated order.
   * @returns {Promise<any>} Đơn hàng đã được cập nhật.
   * @throws {NotFoundException} If order is not found after status change.
   * @throws {NotFoundException} Nếu không tìm thấy đơn hàng sau khi đổi trạng thái.
   */
  async update(id: number, payload: UpdateOrderStatusType, actor?: AccessTokenPayload) {
    await this.orderStateService.transitionOrderStatus({
      createdById: actor?.userId ?? null,
      description: 'Cập nhật trạng thái đơn hàng từ màn hình quản trị.',
      orderId: id,
      source: actor ? this.resolveOrderEventSource(actor) : EVENT_SOURCE.SYSTEM,
      status: payload.status,
      validationMode: actor ? 'strict' : 'system',
    })

    const updatedOrder = await this.orderRepo.findById(id)
    if (!updatedOrder) {
      throw new NotFoundException(`Đơn hàng #${id} không tồn tại sau khi cập nhật`)
    }

    return updatedOrder
  }

  /**
   * Transition order status to CANCELLED with strict role checking.
   * Chuyển trạng thái đơn hàng sang CANCELLED kèm kiểm tra vai trò nghiêm ngặt.
   *
   * Warehouse staff can only cancel orders belonging to their assigned hub.
   * Nhân viên kho chỉ có thể hủy đơn thuộc Hub mà họ quản lý.
   *
   * @param {number} id - Target order ID.
   * @param {number} id - ID đơn hàng mục tiêu.
   * @param {AccessTokenPayload} actor - Authenticated actor payload.
   * @param {AccessTokenPayload} actor - Payload tác nhân đã xác thực.
   * @returns {Promise<any>} The cancelled order.
   * @returns {Promise<any>} Đơn hàng đã được hủy.
   * @throws {NotFoundException} If order is not found.
   * @throws {NotFoundException} Nếu không tìm thấy đơn hàng.
   * @throws {ForbiddenException} If warehouse staff cancels outside their hub.
   * @throws {ForbiddenException} Nếu nhân viên kho hủy đơn ngoài Hub của họ.
   * @throws {BadRequestException} If order is in a non-cancellable status.
   * @throws {BadRequestException} Nếu đơn hàng ở trạng thái không thể hủy.
   */
  async cancel(id: number, actor: AccessTokenPayload) {
    const order = await this.orderRepo.findById(id)

    if (!order) {
      throw new NotFoundException(`Đơn hàng #${id} không tồn tại`)
    }

    if (actor.roleName === roleName.WAREHOUSE_STAFF) {
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

      if (!warehouseUser?.hubId || order.currentHubId !== warehouseUser.hubId) {
        throw new ForbiddenException('Nhân viên kho chỉ được hủy đơn thuộc kho của mình.')
      }
    }

    if (!CUSTOMER_CANCELLABLE_STATUSES.has(order.status)) {
      throw new BadRequestException('Đơn hàng chỉ có thể hủy khi đang chờ xử lý hoặc đã phân công.')
    }

    const eventSource =
      actor.roleName === roleName.WAREHOUSE_STAFF
        ? EVENT_SOURCE.HUB_SCANNER
        : actor.roleName === roleName.ADMIN
          ? EVENT_SOURCE.ADMIN_PORTAL
          : EVENT_SOURCE.CUSTOMER_APP
    const description =
      actor.roleName === roleName.WAREHOUSE_STAFF
        ? 'Nhân viên kho đã hủy đơn hàng.'
        : actor.roleName === roleName.ADMIN
          ? 'Quản trị viên đã hủy đơn hàng.'
          : 'Khách hàng đã hủy đơn hàng.'

    await this.orderStateService.transitionOrderStatus({
      createdById: actor.userId,
      description,
      orderId: id,
      source: eventSource,
      status: ORDER_STATUS.CANCELLED,
    })

    const cancelledOrder = await this.orderRepo.findById(id)

    if (!cancelledOrder) {
      throw new NotFoundException(`Đơn hàng #${id} không tồn tại sau khi hủy`)
    }

    await this.notificationEmitter.emitSafe(NotificationEventName.ORDER_STATUS_UPDATED, {
      userId: cancelledOrder.customerId,
      orderId: cancelledOrder.id,
      trackingCode: cancelledOrder.trackingCode,
      status: ORDER_STATUS.CANCELLED,
    })

    return cancelledOrder
  }

  /**
   * Soft deletes an order from the database.
   * Xóa mềm đơn hàng khỏi cơ sở dữ liệu.
   *
   * @param {number} id - Target order ID.
   * @param {number} id - ID đơn hàng mục tiêu.
   * @param {number} deletedById - Actor ID requesting deletion.
   * @param {number} deletedById - ID tác nhân yêu cầu xóa đơn hàng.
   * @returns {Promise<any>} Deleted order info.
   * @returns {Promise<any>} Thông tin đơn hàng đã bị xóa.
   */
  async delete(id: number, deletedById: number) {
    return this.orderRepo.delete({ id, deletedById })
  }

  /**
   * Standardizes tracking event sources based on user roles.
   * Tiêu chuẩn hóa nguồn gốc sự kiện hành trình dựa trên vai trò người dùng.
   *
   * @param {AccessTokenPayload} actor - User token payload.
   * @param {AccessTokenPayload} actor - Payload token người dùng.
   * @returns {string} Tracking event source code.
   * @returns {string} Mã nguồn sự kiện hành trình.
   */
  private resolveOrderEventSource(actor: AccessTokenPayload) {
    if (actor.roleName === roleName.WAREHOUSE_STAFF) return EVENT_SOURCE.HUB_SCANNER
    if (actor.roleName === roleName.CUSTOMER) return EVENT_SOURCE.CUSTOMER_APP
    return EVENT_SOURCE.ADMIN_PORTAL
  }

}
