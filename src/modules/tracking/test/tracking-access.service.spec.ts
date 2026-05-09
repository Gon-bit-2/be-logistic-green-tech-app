import { ForbiddenException, NotFoundException } from '@nestjs/common'
import roleName, { RoleNameType } from 'src/common/constants/role.constant'
import type { AccessTokenPayload } from 'src/common/types/jwt.type'
import { PrismaService } from 'src/database/prisma.service'
import { TrackingAccessService } from '../service/tracking-access.service'

const actor = (userId: number, role: RoleNameType, hubId?: number | null): AccessTokenPayload => ({
  deviceId: 1,
  exp: 0,
  hubId,
  iat: 0,
  roleId: 1,
  roleName: role,
  userId,
})

const orderAccessContext = (overrides: Record<string, unknown> = {}) => ({
  currentHubId: null,
  currentTrip: null,
  customerId: 7,
  id: 1,
  tripStops: [],
  ...overrides,
})

const tripAccessContext = (overrides: Record<string, unknown> = {}) => ({
  driverId: 22,
  id: 10,
  stops: [],
  vehicle: null,
  ...overrides,
})

describe('TrackingAccessService', () => {
  let service: TrackingAccessService
  let prismaService: {
    order: { findFirst: jest.Mock }
    trip: { findFirst: jest.Mock }
    user: { findFirst: jest.Mock }
  }

  beforeEach(() => {
    prismaService = {
      order: { findFirst: jest.fn() },
      trip: { findFirst: jest.fn() },
      user: { findFirst: jest.fn() },
    }
    service = new TrackingAccessService(prismaService as unknown as PrismaService)
  })

  it('cho customer xem timeline đơn của mình và chặn đơn người khác', async () => {
    prismaService.order.findFirst.mockResolvedValue(orderAccessContext({ customerId: 7 }))

    await expect(service.assertCanViewOrderTimeline(actor(7, roleName.CUSTOMER), 1)).resolves.toBeUndefined()

    prismaService.order.findFirst.mockResolvedValue(orderAccessContext({ customerId: 8 }))
    await expect(service.assertCanViewOrderTimeline(actor(7, roleName.CUSTOMER), 1)).rejects.toThrow(ForbiddenException)
  })

  it('cho driver xem/tạo event cho order thuộc trip mình lái', async () => {
    prismaService.order.findFirst.mockResolvedValue(
      orderAccessContext({
        currentTrip: { driverId: 22, vehicle: { hubId: 5 } },
      }),
    )

    await expect(service.assertCanViewOrderTimeline(actor(22, roleName.DRIVER), 1)).resolves.toBeUndefined()
    await expect(service.assertCanCreateTrackingEvent(actor(22, roleName.DRIVER), 1)).resolves.toBeUndefined()

    await expect(service.assertCanCreateTrackingEvent(actor(23, roleName.DRIVER), 1)).rejects.toThrow(
      ForbiddenException,
    )
  })

  it('scope warehouse bằng currentHubId, vehicle hub, hoặc hub lookup từ user', async () => {
    prismaService.order.findFirst.mockResolvedValue(orderAccessContext({ currentHubId: 8 }))

    await expect(service.assertCanViewOrderTimeline(actor(15, roleName.WAREHOUSE_STAFF, 8), 1)).resolves.toBeUndefined()

    prismaService.order.findFirst.mockResolvedValue(
      orderAccessContext({
        currentHubId: null,
        currentTrip: { driverId: 22, vehicle: { hubId: 8 } },
      }),
    )
    prismaService.user.findFirst.mockResolvedValue({ hubId: 8 })
    await expect(service.assertCanCreateTrackingEvent(actor(15, roleName.WAREHOUSE_STAFF), 1)).resolves.toBeUndefined()

    prismaService.order.findFirst.mockResolvedValue(orderAccessContext({ currentHubId: 9 }))
    await expect(service.assertCanViewOrderTimeline(actor(15, roleName.WAREHOUSE_STAFF, 8), 1)).rejects.toThrow(
      ForbiddenException,
    )
  })

  it('admin bypass scope nhưng vẫn trả NotFound khi resource không tồn tại', async () => {
    prismaService.order.findFirst.mockResolvedValue(orderAccessContext({ customerId: 99 }))
    await expect(service.assertCanViewOrderTimeline(actor(1, roleName.ADMIN), 1)).resolves.toBeUndefined()

    prismaService.order.findFirst.mockResolvedValue(null)
    await expect(service.assertCanViewOrderTimeline(actor(1, roleName.ADMIN), 404)).rejects.toThrow(NotFoundException)
  })

  it('customer chỉ join trip có order của mình', async () => {
    prismaService.trip.findFirst.mockResolvedValue(
      tripAccessContext({
        stops: [{ order: { customerId: 7 } }],
      }),
    )

    await expect(service.assertCanJoinTripTracking(actor(7, roleName.CUSTOMER), 10)).resolves.toBeUndefined()

    prismaService.trip.findFirst.mockResolvedValue(
      tripAccessContext({
        stops: [{ order: { customerId: 8 } }],
      }),
    )
    await expect(service.assertCanJoinTripTracking(actor(7, roleName.CUSTOMER), 10)).rejects.toThrow(ForbiddenException)
  })

  it('warehouse chỉ join trip thuộc hub của mình', async () => {
    prismaService.trip.findFirst.mockResolvedValue(tripAccessContext({ vehicle: { hubId: 8 } }))

    await expect(service.assertCanJoinTripTracking(actor(15, roleName.WAREHOUSE_STAFF, 8), 10)).resolves.toBeUndefined()
    await expect(service.assertCanJoinTripTracking(actor(15, roleName.WAREHOUSE_STAFF, 9), 10)).rejects.toThrow(
      ForbiddenException,
    )
  })

  it('chỉ driver đúng trip được publish location', async () => {
    prismaService.trip.findFirst.mockResolvedValue({ driverId: 22, id: 10 })

    await expect(service.assertCanPublishTripLocation(actor(22, roleName.DRIVER), 10)).resolves.toBeUndefined()
    await expect(service.assertCanPublishTripLocation(actor(23, roleName.DRIVER), 10)).rejects.toThrow(
      ForbiddenException,
    )
    await expect(service.assertCanPublishTripLocation(actor(1, roleName.ADMIN), 10)).rejects.toThrow(ForbiddenException)
  })
})
