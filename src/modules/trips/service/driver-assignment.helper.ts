import { Injectable } from '@nestjs/common'
import { Prisma } from 'generated/prisma'
import { DriverAssignmentRequestResType } from '../model/trip.model'

const driverAssignmentRequestInclude = {
  driver: {
    select: {
      fullName: true,
      id: true,
    },
  },
  order: {
    select: {
      currentHubId: true,
      payment: {
        select: {
          method: true,
          status: true,
        },
      },
      currentTrip: {
        include: {
          vehicle: {
            select: {
              id: true,
              licensePlate: true,
            },
          },
        },
      },
      currentTripId: true,
      id: true,
      preferredDeliveryTimeEnd: true,
      preferredDeliveryTimeStart: true,
      receiverAddress: true,
      receiverLat: true,
      receiverLng: true,
      receiverName: true,
      receiverPhone: true,
      senderAddress: true,
      senderLat: true,
      senderLng: true,
      status: true,
      totalVolume: true,
      totalWeight: true,
      trackingCode: true,
    },
  },
} as const satisfies Prisma.DriverAssignmentRequestInclude

export type DriverAssignmentRequestWithDetails = Prisma.DriverAssignmentRequestGetPayload<{
  include: typeof driverAssignmentRequestInclude
}>

type DriverAssignmentTripSummary = NonNullable<DriverAssignmentRequestWithDetails['order']['currentTrip']>

/**
 * Helper utility facilitating mappings and include database configs for DriverAssignment workflow.
 * Tiện ích hỗ trợ tạo ánh xạ và cấu hình truy vấn cơ sở dữ liệu cho luồng DriverAssignment.
 */
@Injectable()
export class DriverAssignmentHelper {
  /**
   * Retrieves the standard Prisma include configuration query fields for driver assignment request.
   * Lấy cấu hình các trường bao gồm (include) của Prisma cho các yêu cầu phân công tài xế.
   *
   * @returns Prisma include object mapping.
   */
  getDriverAssignmentRequestInclude() {
    return driverAssignmentRequestInclude
  }

  /**
   * Maps a raw database assignment request entity into structured DTO properties.
   * Ánh xạ thực thể yêu cầu phân công thô từ CSDL sang các thuộc tính cấu trúc DTO.
   *
   * @param {DriverAssignmentRequestWithDetails} request - DB entity record.
   * @returns Mapped structured DTO.
   */
  mapDriverAssignmentRequest(request: DriverAssignmentRequestWithDetails): DriverAssignmentRequestResType {
    return {
      createdAt: request.createdAt,
      driverId: request.driverId,
      driverName: request.driver?.fullName ?? `Tài xế #${request.driverId}`,
      hubId: request.hubId,
      id: request.id,
      orderId: request.orderId,
      orderTrackingCode: request.order?.trackingCode ?? `ORD-${request.orderId}`,
      reviewNote: request.reviewNote ?? null,
      reviewedAt: request.reviewedAt ?? null,
      reviewedById: request.reviewedById ?? null,
      status: request.status,
      trip: this.mapTripSummary(request.order?.currentTrip),
    }
  }

  /**
   * Constructs small condensed summary details for assigned trips.
   * Xây dựng tóm tắt rút gọn cho chuyến đi được phân công.
   *
   * @param {DriverAssignmentTripSummary | null} trip - DB trip stop model.
   * @returns Trimmed trip summary object or null.
   */
  mapTripSummary(trip: DriverAssignmentTripSummary | null) {
    if (!trip?.vehicle) {
      return null
    }

    return {
      id: trip.id,
      status: trip.status,
      vehicleId: trip.vehicle.id,
      vehicleLicensePlate: trip.vehicle.licensePlate,
    }
  }
}
