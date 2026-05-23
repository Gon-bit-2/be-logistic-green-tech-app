import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { STOP_TYPE } from 'src/common/constants/trip.constant'
import { PrismaService } from 'src/database/prisma.service'
import { OsrmRoutingClient } from './osrm-routing.client'
import { RouteWaypoint } from '../types/osrm.type'

type TripStopForRoute = {
  actualArrivalTime: Date | null
  expectedArrivalTime: Date | null
  hub: { latitude: number | null; longitude: number | null } | null
  hubId: number | null
  id: number
  order: {
    receiverLat: number | null
    receiverLng: number | null
    senderLat: number | null
    senderLng: number | null
  } | null
  orderId: number | null
  stopSequence: number
  stopType: string
}

/**
 * Service responsible for delivery route optimization.
 * Utilizes routing clients (like OSRM) to compute the most efficient stopping sequence
 * and updates stop sequences in a transaction.
 *
 * Dịch vụ chịu trách nhiệm tối ưu hóa lộ trình giao hàng.
 * Sử dụng các routing client (như OSRM) để tính toán thứ tự điểm dừng tối ưu nhất
 * và cập nhật thứ tự các điểm dừng trong một transaction.
 */
@Injectable()
export class TripRouteOptimizationService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly routingClient: OsrmRoutingClient,
  ) {}

  /**
   * Optimizes the stopping sequence of a trip based on geographic coordinates.
   * Calculates total distance and duration, then updates the stop sequences in the database.
   *
   * Tối ưu hóa thứ tự điểm dừng của một chuyến đi dựa trên tọa độ địa lý.
   * Tính toán tổng quãng đường và thời gian, sau đó cập nhật thứ tự điểm dừng trong cơ sở dữ liệu.
   *
   * @param tripId The unique identifier of the trip to optimize.
   *               Mã định danh duy nhất của chuyến đi cần tối ưu.
   * @returns A promise resolving to the optimization summary, including stops and total distance.
   *          Một promise trả về tóm tắt kết quả tối ưu, bao gồm các điểm dừng và tổng quãng đường.
   * @throws {NotFoundException} If the trip is not found.
   *                             Nếu không tìm thấy chuyến đi.
   * @throws {BadRequestException} If coordinates are missing or stops are insufficient.
   *                               Nếu thiếu tọa độ hoặc không đủ điểm dừng.
   */
  async optimizeRouteForTrip(tripId: number) {
    const trip = await this.prismaService.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        stops: {
          orderBy: { stopSequence: 'asc' },
          select: {
            actualArrivalTime: true,
            expectedArrivalTime: true,
            hub: { select: { latitude: true, longitude: true } },
            hubId: true,
            id: true,
            order: {
              select: {
                receiverLat: true,
                receiverLng: true,
                senderLat: true,
                senderLng: true,
              },
            },
            orderId: true,
            stopSequence: true,
            stopType: true,
          },
        },
        vehicle: {
          select: {
            hub: { select: { latitude: true, longitude: true } },
          },
        },
      },
    })

    if (!trip) throw new NotFoundException(`Không tìm thấy chuyến #${tripId}`)

    const startHub = trip.vehicle?.hub
    if (!this.hasCoordinates(startHub)) {
      throw new BadRequestException('Không xác định được tọa độ hub xuất phát của chuyến.')
    }

    if (!trip.stops.length) {
      throw new BadRequestException('Không đủ điểm dừng để tối ưu tuyến đường.')
    }

    const stopWaypoints = trip.stops.map((stop) => this.buildStopWaypoint(stop))
    const waypoints: RouteWaypoint[] = [
      {
        id: `trip:${trip.id}:hub:start`,
        lat: startHub.latitude,
        lng: startHub.longitude,
      },
      ...stopWaypoints,
    ]

    if (waypoints.length < 2) {
      throw new BadRequestException('Không đủ điểm dừng để tối ưu tuyến đường.')
    }

    const optimizedRoute = await this.routingClient.optimizeRoute(waypoints, false)
    const optimizedStops = optimizedRoute.waypoints
      .filter((waypoint) => waypoint.stopId != null)
      .sort((a, b) => a.optimizedSequence - b.optimizedSequence)
      .map((waypoint, index) => {
        const originalStop = trip.stops.find((stop) => stop.id === waypoint.stopId)!
        return {
          actualArrivalTime: originalStop.actualArrivalTime,
          expectedArrivalTime: originalStop.expectedArrivalTime,
          hubId: originalStop.hubId,
          id: originalStop.id,
          orderId: originalStop.orderId,
          stopSequence: index + 1,
          stopType: originalStop.stopType,
        }
      })

    const totalDistance = optimizedRoute.distanceMeters / 1000

    await this.prismaService.$transaction(async (tx) => {
      for (let index = 0; index < optimizedStops.length; index++) {
        await tx.tripStop.update({
          where: { id: optimizedStops[index].id },
          data: { stopSequence: -(index + 1) },
        })
      }

      for (const stop of optimizedStops) {
        await tx.tripStop.update({
          where: { id: stop.id },
          data: { stopSequence: stop.stopSequence },
        })
      }

      await tx.trip.update({
        where: { id: tripId },
        data: { totalDistance },
      })
    })

    return {
      fallbackUsed: optimizedRoute.fallbackUsed,
      provider: optimizedRoute.provider,
      stops: optimizedStops,
      totalDistance,
      totalDuration: optimizedRoute.durationSeconds,
      tripId,
    }
  }

  /**
   * Helper function to build a route waypoint from a trip stop.
   *
   * Hàm hỗ trợ tạo điểm định vị tuyến đường từ một điểm dừng chuyến đi.
   *
   * @param stop The trip stop data.
   *             Dữ liệu điểm dừng của chuyến đi.
   * @returns The formatted route waypoint.
   *          Điểm định vị lộ trình đã được định dạng.
   */
  private buildStopWaypoint(stop: TripStopForRoute): RouteWaypoint {
    const coordinates = this.resolveStopCoordinates(stop)
    return {
      id: `trip-stop:${stop.id}`,
      lat: coordinates.lat,
      lng: coordinates.lng,
      stopId: stop.id,
    }
  }

  /**
   * Resolves the latitude and longitude coordinates for a given trip stop based on its type.
   *
   * Xác định tọa độ vĩ độ và kinh độ cho một điểm dừng cụ thể dựa trên loại điểm dừng.
   *
   * @param stop The trip stop to resolve coordinates for.
   *             Điểm dừng chuyến đi cần xác định tọa độ.
   * @returns An object containing resolved lat and lng.
   *          Đối tượng chứa tọa độ vĩ độ và kinh độ đã xác định.
   * @throws {BadRequestException} If coordinates cannot be determined for the stop type.
   *                               Nếu không thể xác định tọa độ cho loại điểm dừng này.
   */
  private resolveStopCoordinates(stop: TripStopForRoute): { lat: number; lng: number } {
    if (stop.stopType === STOP_TYPE.PICKUP) {
      return this.requireCoordinates(stop.order?.senderLat, stop.order?.senderLng, stop.id, 'sender')
    }

    if (stop.stopType === STOP_TYPE.HUB_TRANSFER && this.hasCoordinates(stop.hub)) {
      return { lat: stop.hub.latitude, lng: stop.hub.longitude }
    }

    if (stop.order) {
      return this.requireCoordinates(stop.order.receiverLat, stop.order.receiverLng, stop.id, 'receiver')
    }

    if (this.hasCoordinates(stop.hub)) {
      return { lat: stop.hub.latitude, lng: stop.hub.longitude }
    }

    throw new BadRequestException(`Stop #${stop.id} thiếu tọa độ để tối ưu tuyến đường.`)
  }

  /**
   * Asserts that coordinates are valid and throws if they are missing or malformed.
   *
   * Kiểm tra tọa độ hợp lệ và ném ra lỗi nếu thiếu hoặc không hợp lệ.
   *
   * @param lat Latitude value.
   *            Giá trị vĩ độ.
   * @param lng Longitude value.
   *            Giá trị kinh độ.
   * @param stopId The ID of the stop (for error logging).
   *               ID của điểm dừng (để ghi nhật ký lỗi).
   * @param label The label indicating the role of coordinates (e.g., 'sender', 'receiver').
   *              Nhãn chỉ ra vai trò của tọa độ (ví dụ: 'người gửi', 'người nhận').
   * @returns An object containing valid lat and lng.
   *          Đối tượng chứa vĩ độ và kinh độ hợp lệ.
   * @throws {BadRequestException} If coordinates are invalid.
   *                               Nếu tọa độ không hợp lệ.
   */
  private requireCoordinates(
    lat: number | null | undefined,
    lng: number | null | undefined,
    stopId: number,
    label: string,
  ): { lat: number; lng: number } {
    if (!this.isValidCoordinate(lat) || !this.isValidCoordinate(lng)) {
      throw new BadRequestException(`Stop #${stopId} thiếu tọa độ ${label} để tối ưu tuyến đường.`)
    }

    return { lat, lng }
  }

  /**
   * Type guard to check if a hub or location object has valid geographic coordinates.
   *
   * Type guard kiểm tra đối tượng hub hoặc địa điểm có tọa độ địa lý hợp lệ hay không.
   *
   * @param value The location object.
   *              Đối tượng địa điểm.
   * @returns True if both latitude and longitude are valid numbers.
   *          True nếu cả vĩ độ và kinh độ đều là số hợp lệ.
   */
  private hasCoordinates(value: { latitude: number | null; longitude: number | null } | null | undefined): value is {
    latitude: number
    longitude: number
  } {
    return this.isValidCoordinate(value?.latitude) && this.isValidCoordinate(value?.longitude)
  }

  /**
   * Validates whether a value is a valid finite coordinate number.
   *
   * Xác thực xem giá trị có phải là số tọa độ hữu hạn hợp lệ hay không.
   *
   * @param value The value to check.
   *              Giá trị cần kiểm tra.
   * @returns True if value is a valid number.
   *          True nếu giá trị là số hợp lệ.
   */
  private isValidCoordinate(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value)
  }
}
