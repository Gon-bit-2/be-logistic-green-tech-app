import { Injectable } from '@nestjs/common'
import { Prisma } from 'generated/prisma'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { DISPATCHABLE_PAYMENT_FILTER } from 'src/common/constants/order-query.constant'
import { TRIP_STATUS } from 'src/common/constants/trip.constant'
import { PrismaService } from 'src/database/prisma.service'
import { TripStopType } from 'src/modules/trips/model/trip.model'

@Injectable()
export class TripWriteRepository {
  constructor(private readonly prismaService: PrismaService) {}

  findActiveTripByVehicle(tx: Prisma.TransactionClient, vehicleId: number) {
    return tx.trip.findFirst({
      where: {
        status: { in: [TRIP_STATUS.PENDING, TRIP_STATUS.IN_PROGRESS] },
        vehicleId,
      },
      select: { id: true },
    })
  }

  findActiveTripByDriver(tx: Prisma.TransactionClient, driverId: number) {
    return tx.trip.findFirst({
      where: {
        driverId,
        status: { in: [TRIP_STATUS.PENDING, TRIP_STATUS.IN_PROGRESS] },
      },
      select: { id: true },
    })
  }

  async findDispatchableOrderIds(tx: Prisma.TransactionClient, orderIds: number[]) {
    const orders = await tx.order.findMany({
      where: {
        id: { in: orderIds },
        status: { in: [ORDER_STATUS.PENDING, ORDER_STATUS.ARRIVED_AT_HUB] },
        currentTripId: null,
        ...DISPATCHABLE_PAYMENT_FILTER,
      },
      select: { id: true },
    })

    return orders.map((order) => order.id)
  }

  createTripRecord(
    tx: Prisma.TransactionClient,
    params: {
      driverId: number
      stopsData: Omit<TripStopType, 'id' | 'tripId'>[]
      totalDistance?: number
      vehicleId: number
    },
  ) {
    return tx.trip.create({
      data: {
        driverId: params.driverId,
        status: TRIP_STATUS.PENDING,
        stops: {
          create: params.stopsData,
        },
        totalDistance: params.totalDistance ?? null,
        vehicleId: params.vehicleId,
      },
      include: {
        stops: true,
      },
    })
  }

  cancelPendingAssignmentRequests(
    tx: Prisma.TransactionClient,
    orderIds: number[],
    assignmentRequestToApproveId?: number | null,
  ) {
    return tx.driverAssignmentRequest.updateMany({
      where: {
        orderId: { in: orderIds },
        status: 'PENDING',
        ...(assignmentRequestToApproveId ? { id: { not: assignmentRequestToApproveId } } : {}),
      },
      data: {
        reviewedAt: new Date(),
        status: 'CANCELLED',
      },
    })
  }

  approveAssignmentRequest(tx: Prisma.TransactionClient, assignmentRequestId: number) {
    return tx.driverAssignmentRequest.update({
      where: { id: assignmentRequestId },
      data: {
        reviewedAt: new Date(),
        status: 'APPROVED',
      },
    })
  }

  updateTripStatus(id: number, status: keyof typeof TRIP_STATUS, extraData?: Prisma.TripUpdateInput) {
    return this.prismaService.trip.update({
      where: { id },
      data: {
        status,
        ...extraData,
      },
      include: {
        driver: {
          select: {
            avatar: true,
            fullName: true,
            id: true,
          },
        },
        stops: {
          include: {
            order: {
              select: {
                currentHubId: true,
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
          },
          orderBy: { stopSequence: 'asc' },
        },
        vehicle: {
          select: {
            capacityVolume: true,
            capacityWeight: true,
            emissionRatePerKm: true,
            fuelType: true,
            hubId: true,
            id: true,
            isActive: true,
            licensePlate: true,
            type: true,
          },
        },
      },
    })
  }

  deleteStopsForOrder(tx: Prisma.TransactionClient, tripId: number, orderId: number) {
    return tx.tripStop.deleteMany({
      where: { orderId, tripId },
    })
  }

  findRemainingOrderStops(tx: Prisma.TransactionClient, tripId: number) {
    return tx.tripStop.findMany({
      where: { orderId: { not: null }, tripId },
      orderBy: { stopSequence: 'asc' },
    })
  }

  deleteStopsForTrip(tx: Prisma.TransactionClient, tripId: number) {
    return tx.tripStop.deleteMany({ where: { tripId } })
  }

  updateTripStatusInTransaction(tx: Prisma.TransactionClient, tripId: number, status: keyof typeof TRIP_STATUS) {
    return tx.trip.update({
      where: { id: tripId },
      data: { status },
    })
  }

  findStopsForTrip(tx: Prisma.TransactionClient, tripId: number) {
    return tx.tripStop.findMany({
      where: { tripId },
      orderBy: { stopSequence: 'asc' },
    })
  }

  updateStopSequence(tx: Prisma.TransactionClient, stopId: number, stopSequence: number) {
    return tx.tripStop.update({
      where: { id: stopId },
      data: { stopSequence },
    })
  }
}
