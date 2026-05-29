import { Injectable } from '@nestjs/common'
import { Prisma } from 'generated/prisma'
import { GetTripListQueryType } from 'src/modules/trips/model/trip.model'
import { PrismaService } from 'src/database/prisma.service'

@Injectable()
export class TripReadRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async findAll(query: GetTripListQueryType) {
    const { limit, page, status, vehicleId, driverId, hubId } = query
    const skip = (page - 1) * limit
    const take = limit

    const whereClause: Prisma.TripWhereInput = {
      ...(status && { status }),
      ...(vehicleId && { vehicleId }),
      ...(driverId && { driverId }),
      ...(hubId && { vehicle: { hubId } }),
    }

    const [totalItems, data] = await Promise.all([
      this.prismaService.trip.count({ where: whereClause }),
      this.prismaService.trip.findMany({
        where: whereClause,
        select: {
          id: true,
          vehicleId: true,
          driverId: true,
          status: true,
          startTime: true,
          endTime: true,
          totalDistance: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              stops: {
                where: {
                  orderId: { not: null },
                },
              },
            },
          },
          driver: {
            select: {
              avatar: true,
              fullName: true,
              id: true,
            },
          },
          vehicle: {
            select: {
              hubId: true,
              id: true,
              isActive: true,
              licensePlate: true,
              type: true,
            },
          },
        },
        skip,
        take,
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ])

    return {
      totalItems,
      data: data.map(({ _count, driver, vehicle, ...trip }) => ({
        ...trip,
        driver,
        driverName: driver.fullName,
        orderCount: _count.stops,
        vehicle,
        vehicleLicensePlate: vehicle.licensePlate,
      })),
      page,
      limit,
      totalPages: Math.ceil(totalItems / limit),
    }
  }

  findById(id: number) {
    return this.prismaService.trip.findUnique({
      where: { id },
      include: {
        stops: {
          orderBy: { stopSequence: 'asc' },
          include: {
            hub: true,
            order: {
              include: {
                payment: {
                  select: {
                    amount: true,
                    method: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
        vehicle: true,
        driver: true,
      },
    })
  }
}
