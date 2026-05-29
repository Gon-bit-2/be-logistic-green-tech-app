import { Injectable, Logger } from '@nestjs/common'
import { calculateHaversineDistance } from 'src/common/utils/geo.util'
import envConfig from 'src/config/config'
import { OsrmTripResponse, RouteOptimizationResult, RouteWaypoint } from '../types/osrm.type'

/**
 * Client for interfacing with Open Source Routing Machine (OSRM).
 * Computes optimized vehicle trips using real map routing API with a Haversine-based fallback.
 *
 * Client giao tiếp với Open Source Routing Machine (OSRM).
 * Tính toán tối ưu hóa chuyến đi của xe sử dụng API bản đồ định tuyến thực tế kết hợp cơ chế dự phòng Haversine.
 */
@Injectable()
export class OsrmRoutingClient {
  private readonly logger = new Logger(OsrmRoutingClient.name)
  private readonly baseUrl = envConfig.OSRM_BASE_URL

  /**
   * Requests route optimization from OSRM for a sequence of waypoints.
   * If the API call fails or is unavailable, falls back to a Haversine calculation.
   *
   * Yêu cầu tối ưu hóa lộ trình từ OSRM cho một chuỗi các điểm định vị.
   * Nếu lệnh gọi API không thành công hoặc không khả dụng, sẽ tự động chuyển sang tính toán Haversine dự phòng.
   *
   * @param waypoints The array of coordinates representing stops on the route.
   *                  Mảng chứa các tọa độ đại diện cho các điểm dừng trên tuyến đường.
   * @param roundtrip Boolean indicating if the vehicle must return to the starting point.
   *                  Giá trị boolean xác định xem xe có phải quay lại điểm xuất phát hay không.
   * @returns A promise resolving to the route optimization details including distances and optimized sequence.
   *          Một promise trả về chi tiết tối ưu hóa lộ trình bao gồm khoảng cách và thứ tự tối ưu.
   */
  async optimizeRoute(waypoints: RouteWaypoint[], roundtrip = false): Promise<RouteOptimizationResult> {
    if (waypoints.length < 2) {
      return this.buildFallbackResult(waypoints)
    }

    const coordinatePath = waypoints.map((waypoint) => `${waypoint.lng},${waypoint.lat}`).join(';')
    const url =
      `${this.baseUrl}/trip/v1/driving/${coordinatePath}` + `?roundtrip=${roundtrip}&source=first&geometries=polyline`

    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = (await response.json()) as OsrmTripResponse
      if (data.code !== 'Ok' || !data.trips?.[0] || !data.waypoints || data.waypoints.length !== waypoints.length) {
        throw new Error(data.message || data.code || 'Invalid OSRM response')
      }

      return {
        distanceMeters: data.trips[0].distance,
        durationSeconds: data.trips[0].duration,
        fallbackUsed: false,
        provider: 'OSRM',
        waypoints: waypoints.map((waypoint, inputIndex) => ({
          ...waypoint,
          inputIndex,
          optimizedSequence: data.waypoints![inputIndex].waypoint_index,
        })),
      }
    } catch (error) {
      this.logger.warn(
        `OSRM optimization failed, using Haversine fallback: ${error instanceof Error ? error.message : String(error)}`,
      )
      return this.buildFallbackResult(waypoints)
    }
  }

  /**
   * Computes a fallback route optimization using straight-line Haversine distance calculations.
   * Estimates duration based on an average speed of 30 km/h.
   *
   * Tính toán tối ưu hóa tuyến đường dự phòng bằng cách tính khoảng cách đường thẳng Haversine.
   * Ước tính thời gian dựa trên tốc độ trung bình 30 km/h.
   *
   * @param waypoints The array of coordinates representing stops on the route.
   *                  Mảng chứa các tọa độ đại diện cho các điểm dừng trên tuyến đường.
   * @returns The route optimization result with Haversine metrics.
   *          Kết quả tối ưu hóa lộ trình với các số đo Haversine.
   */
  private buildFallbackResult(waypoints: RouteWaypoint[]): RouteOptimizationResult {
    let distanceKm = 0
    for (let index = 1; index < waypoints.length; index++) {
      const previous = waypoints[index - 1]
      const current = waypoints[index]
      distanceKm += calculateHaversineDistance(previous.lat, previous.lng, current.lat, current.lng)
    }

    return {
      distanceMeters: distanceKm * 1000,
      durationSeconds: distanceKm > 0 ? (distanceKm / 30) * 3600 : 0,
      fallbackUsed: true,
      provider: 'HAVERSINE',
      waypoints: waypoints.map((waypoint, inputIndex) => ({
        ...waypoint,
        inputIndex,
        optimizedSequence: inputIndex,
      })),
    }
  }
}
