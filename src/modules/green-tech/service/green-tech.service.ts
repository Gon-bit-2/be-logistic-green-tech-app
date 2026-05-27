import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import roleName from 'src/common/constants/role.constant'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import {
  EmissionLogInput,
  EmissionAllocationInput,
  GreenTechDashboardQueryType,
  GreenTechExportQueryType,
} from '../model/emission.model'
import { EmissionRepository } from '../repository/emission.repo'

/**
 * Service managing sustainability carbon emissions computations based on GLEC Framework.
 * Performs carbon calculations based on distance, payload weight, vehicle type, and allocates outputs to orders.
 *
 * Dịch vụ quản lý các tính toán phát thải carbon bền vững dựa trên GLEC Framework.
 * Thực hiện các tính toán carbon dựa trên khoảng cách, trọng lượng tải trọng, loại phương tiện và phân bổ kết quả cho các đơn hàng.
 */
@Injectable()
export class GreenTechService {
  private readonly logger = new Logger(GreenTechService.name)
  private readonly BASELINE_DIESEL_EMISSION_RATE = 250 // g CO2/km (chuẩn GLEC)

  /**
   * Initializes the GreenTechService.
   *
   * Khởi tạo GreenTechService.
   *
   * @param emissionRepo - Emission Repository / Repository quản lý phát thải.
   */
  constructor(private readonly emissionRepo: EmissionRepository) {}

  /**
   * Calculates and saves the actual CO2 emitted and saved for a specific completed trip.
   * Applies the GLEC Framework and distributes emissions proportionally to nested orders based on weight ratio.
   *
   * Tính toán và lưu trữ lượng CO2 phát thải thực tế và tiết kiệm được cho một chuyến đi cụ thể đã hoàn thành.
   * Áp dụng GLEC Framework và phân bổ lượng khí thải theo tỷ lệ cho các đơn hàng lồng nhau dựa theo tỷ số trọng lượng.
   *
   * @param tripId - Trip ID / ID chuyến đi.
   * @returns Created emission log snapshot details / Chi tiết bản ghi chụp nhanh phát thải carbon được tạo.
   * @throws NotFoundException if trip or assigned vehicle is missing / NotFoundException nếu thiếu chuyến đi hoặc phương tiện được gán.
   * @throws BadRequestException if the trip doesn't have valid distance / BadRequestException nếu chuyến đi chưa có quãng đường hợp lệ.
   */
  async calculateTripEmission(tripId: number) {
    const trip = await this.emissionRepo.getTripSourceData(tripId)
    if (!trip) {
      throw new NotFoundException(`Trip #${tripId} không tồn tại`)
    }

    const vehicle = trip.vehicle
    if (!vehicle) {
      throw new NotFoundException(`Trip #${tripId} chưa gán phương tiện`)
    }

    // --- Bước 1: Thu thập số liệu đầu vào ---
    // Trip.totalDistance là nguồn sự thật sau route optimization.
    const actualDistance = Number(trip.totalDistance ?? 0)
    if (!Number.isFinite(actualDistance) || actualDistance <= 0) {
      throw new BadRequestException(
        `Trip #${tripId} chưa có quãng đường hợp lệ. Hãy tối ưu tuyến đường trước khi tính Green Tech.`,
      )
    }

    const payloadWeight = trip.ordersOnBoard.reduce((sum, order) => sum + order.totalWeight, 0) || 1

    const emissionFactor = vehicle.emissionRatePerKm // G CO2/km

    // --- Bước 2: Tính toán CO2 ---
    // Công thức tiêu chuẩn: Khoảng cách (km) * Hệ số xả (g/km) / 1000 = Kg CO2
    const co2Emitted = (actualDistance * emissionFactor) / 1000
    const baselineCo2 = (actualDistance * this.BASELINE_DIESEL_EMISSION_RATE) / 1000
    const co2Saved = Math.max(0, baselineCo2 - co2Emitted) // Tiết kiệm so với xe Diesel cũ

    // Lấy log version hiện tại để tăng version (versioning control)
    const existingLogs = await this.emissionRepo.getTripLogs(tripId)
    const currentVersion = existingLogs.length > 0 ? existingLogs[0].version : 0
    const nextVersion = currentVersion + 1

    // --- Bước 3: Phân bổ CO2 cho từng đơn hàng (Allocation theo Weight Ratio) ---
    const allocations: EmissionAllocationInput[] = []

    for (const order of trip.ordersOnBoard) {
      const weightRatio = order.totalWeight / payloadWeight
      const allocatedCo2 = co2Emitted * weightRatio
      const allocatedCo2Saved = co2Saved * weightRatio

      allocations.push({
        orderId: order.id,
        allocatedCo2,
        allocatedCo2Saved,
        allocationMethod: 'WEIGHT_RATIO',
        weightRatio,
      })
    }

    // --- Bước 4: Lưu log Snapshot của ISO 14083 ---
    const logData: EmissionLogInput = {
      tripId: tripId,
      version: nextVersion,
      isLatest: true,
      actualDistance,
      payloadWeight,
      co2Emitted,
      co2Saved,
      emissionFactor,
      baselineRate: this.BASELINE_DIESEL_EMISSION_RATE,
      vehicleType: vehicle.type,
      fuelType: vehicle.fuelType,
      calculationMethod: 'TRIP_TOTAL_DISTANCE',
      ghgScope: 1, // Scope 1: Xe sở hữu
    }

    const savedLog = await this.emissionRepo.saveEmissionData(tripId, logData, allocations)

    this.logger.log(`[GreenTech] Đã tính toán Emission cho Trip #${tripId} | CO2: ${co2Emitted.toFixed(2)}kg`)
    return savedLog
  }

  /**
   * Retrieves the historical versioned logs of emission calculations for a specific trip.
   *
   * Lấy lịch sử các phiên bản tính toán phát thải của một chuyến đi cụ thể.
   *
   * @param tripId - Trip ID / ID chuyến đi.
   * @returns Array of emission log history entries / Mảng lịch sử các bản ghi phát thải.
   */
  async getTripEmissionHistory(tripId: number) {
    return this.emissionRepo.getTripLogs(tripId)
  }

  /**
   * Retrieves dashboard analytics data for green technology performance.
   *
   * Lấy dữ liệu phân tích dashboard tổng quan cho hiệu suất công nghệ xanh.
   *
   * @param query - Date range filters / Bộ lọc khoảng thời gian.
   * @returns Dashboard analytics metadata / Siêu dữ liệu phân tích dashboard.
   */
  async getDashboard(query: GreenTechDashboardQueryType) {
    return this.emissionRepo.getGreenDashboard(query)
  }

  /**
   * Retrieves detailed carbon footprint allocation metrics for a specific order.
   * Validates permissions for customer users.
   *
   * Lấy các số liệu phân bổ dấu chân carbon chi tiết của một đơn hàng cụ thể.
   * Xác thực quyền hạn đối với người dùng là khách hàng.
   *
   * @param actor - Decoded JWT user payload / Payload JWT của người dùng thực thi.
   * @param orderId - Order ID / ID đơn hàng.
   * @returns Cumulative order carbon footprint data / Dữ liệu dấu chân carbon tích lũy của đơn hàng.
   * @throws NotFoundException if the order does not exist / NotFoundException nếu đơn hàng không tồn tại.
   * @throws ForbiddenException if customer requests footprint of another user's order / ForbiddenException nếu khách hàng yêu cầu đơn của người khác.
   */
  async getOrderFootprint(actor: AccessTokenPayload, orderId: number) {
    const order = await this.emissionRepo.getOrderFootprint(orderId)
    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn hàng #${orderId}`)
    }

    // Customer chỉ được xem footprint của chính họ; admin/staff dùng endpoint này cho support/report.
    if (actor.roleName === roleName.CUSTOMER && order.customerId !== actor.userId) {
      throw new ForbiddenException('Error.PermissionDenied.NotResourceOwner')
    }

    const allocations = order.emissionAllocations.map((allocation) => ({
      allocatedCo2: Number(allocation.allocatedCo2),
      allocatedCo2Saved: Number(allocation.allocatedCo2Saved),
      allocationMethod: allocation.allocationMethod,
      calculatedAt: allocation.emissionLog.calculatedAt,
      emissionLogId: allocation.emissionLog.id,
      tripId: allocation.emissionLog.tripId,
      weightRatio: allocation.weightRatio == null ? null : Number(allocation.weightRatio),
    }))

    return {
      allocations,
      orderId: order.id,
      trackingCode: order.trackingCode,
      totalAllocatedCo2: allocations.reduce((sum, item) => sum + item.allocatedCo2, 0),
      totalAllocatedCo2Saved: allocations.reduce((sum, item) => sum + item.allocatedCo2Saved, 0),
    }
  }

  /**
   * Retrieves sustainability saving metrics specifically for a logged-in customer.
   *
   * Lấy số liệu tóm tắt carbon tiết kiệm được dành riêng cho khách hàng đang đăng nhập.
   *
   * @param actor - Decoded JWT customer user payload / Payload JWT của khách hàng thực thi.
   * @param query - Date range options / Thiết lập khoảng thời gian.
   * @returns Customer sustainability saving metrics / Các chỉ số bền vững của khách hàng.
   * @throws ForbiddenException if non-customer accesses this resource / ForbiddenException nếu người dùng không phải khách hàng.
   */
  async getMyCustomerSummary(actor: AccessTokenPayload, query: Pick<GreenTechDashboardQueryType, 'dateRange'>) {
    if (actor.roleName !== roleName.CUSTOMER) {
      throw new ForbiddenException('Error.Forbidden')
    }

    return this.emissionRepo.getCustomerGreenSummary(actor.userId, query)
  }

  /**
   * Exports sustainable metrics reports to a raw CSV formatted string based on scopes (e.g. 'trips', 'customers', 'orders').
   *
   * Xuất báo cáo các chỉ số bền vững thành chuỗi CSV thô dựa theo phạm vi (ví dụ: 'trips', 'customers', 'orders').
   *
   * @param query - Timeframe and scope options / Thiết lập cấu hình phạm vi và thời gian.
   * @returns CSV-encoded string representing sustainability report / Chuỗi mã hóa CSV đại diện cho báo cáo bền vững.
   */
  async exportReportCsv(query: GreenTechExportQueryType) {
    if (query.scope === 'orders') {
      const rows = await this.emissionRepo.getOrderReportRows(query)
      return this.toCsv([
        [
          'Order ID',
          'Tracking Code',
          'Customer ID',
          'Trip ID',
          'Allocated CO2',
          'Allocated CO2 Saved',
          'Calculated At',
        ],
        ...rows.map((row) => [
          String(row.order.id),
          row.order.trackingCode,
          String(row.order.customerId),
          String(row.emissionLog.tripId),
          String(row.allocatedCo2),
          String(row.allocatedCo2Saved),
          row.emissionLog.calculatedAt.toISOString(),
        ]),
      ])
    }

    if (query.scope === 'customers') {
      const rows = await this.emissionRepo.getCustomerReportRows(query)
      return this.toCsv([
        ['Customer ID', 'Customer Name', 'Green Order Count', 'Total CO2', 'Total CO2 Saved'],
        ...rows.map((row) => [
          String(row.customerId),
          row.customerName,
          String(row.orderCount),
          String(row.totalCo2),
          String(row.totalCo2Saved),
        ]),
      ])
    }

    const rows = await this.emissionRepo.getTripReportRows(query)
    return this.toCsv([
      [
        'Trip ID',
        'Emission Log ID',
        'Vehicle Type',
        'Fuel Type',
        'Distance Km',
        'CO2 Emitted',
        'CO2 Saved',
        'Calculated At',
      ],
      ...rows.map((row) => [
        String(row.tripId),
        String(row.id),
        row.vehicleType,
        row.fuelType,
        String(row.actualDistance),
        String(row.co2Emitted),
        String(row.co2Saved),
        row.calculatedAt.toISOString(),
      ]),
    ])
  }

  /**
   * Helper that converts grid rows arrays into standard CSV formatted strings.
   *
   * Trình hỗ trợ chuyển đổi mảng các dòng dữ liệu dạng lưới thành chuỗi CSV tiêu chuẩn.
   *
   * @param rows - Multi-dimensional rows array / Mảng các dòng đa chiều.
   * @returns CSV-encoded string / Chuỗi mã hóa CSV.
   */
  private toCsv(rows: string[][]) {
    // CSV được build tập trung tại service để controller chỉ phụ trách HTTP header,
    // tránh duplicate escaping logic khi thêm export scope mới.
    return rows.map((row) => row.map((cell) => this.escapeCsvCell(cell)).join(',')).join('\r\n')
  }

  /**
   * Helper escaping string values for CSV compatibility.
   *
   * Trình hỗ trợ escape chuỗi ký tự đảm bảo tính tương thích của CSV.
   *
   * @param value - Cell string / Chuỗi văn bản của ô.
   * @returns Escaped CSV safe string / Chuỗi an toàn trong CSV đã escape.
   */
  private escapeCsvCell(value: string) {
    if (!/[",\r\n]/.test(value)) return value
    return `"${value.replace(/"/g, '""')}"`
  }
}
