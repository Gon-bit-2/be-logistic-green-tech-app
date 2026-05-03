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
 * Helper chứa các hàm mapping và include config
 * dùng chung cho DriverAssignment workflow (Service + Board).
 */
@Injectable()
export class DriverAssignmentHelper {
  /** Prisma include config cho DriverAssignmentRequest queries */
  getDriverAssignmentRequestInclude() {
    return driverAssignmentRequestInclude
  }

  /** Map raw Prisma DriverAssignmentRequest sang response DTO */
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

  /** Map raw Trip sang summary nhỏ (dùng trong assignment request response) */
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
