import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { EmissionLogInput, EmissionAllocationInput } from '../model/emission.model'
import { EmissionRepository } from '../repository/emission.repo'

@Injectable()
export class GreenTechService {
  private readonly logger = new Logger(GreenTechService.name)
  private readonly BASELINE_DIESEL_EMISSION_RATE = 250 // g CO2/km (chuẩn GLEC)

  constructor(private readonly emissionRepo: EmissionRepository) {}

  /**
   * Tính toán và ghi nhận lượng phát thải CO2 cho 1 chuyến xe (Trip)
   * Sử dụng GLEC Framework + tính năng phân bổ lượng phát thải theo trọng lượng cho mỗi đơn hàng.
   *
   * @param tripId ID của chuyến xe
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
   * Lấy lịch sử Emission của chuyến xe
   */
  async getTripEmissionHistory(tripId: number) {
    return this.emissionRepo.getTripLogs(tripId)
  }
}
