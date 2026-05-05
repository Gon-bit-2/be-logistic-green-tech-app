import roleName from 'src/common/constants/role.constant'
import { TrackingGateway } from '../gateway/tracking.gateway'

const user = (userId: number, roleNameValue: string) => ({
  deviceId: 1,
  exp: 0,
  iat: 0,
  roleId: 1,
  roleName: roleNameValue,
  userId,
})

describe('TrackingGateway', () => {
  let gateway: TrackingGateway
  let trackingAccessService: {
    assertCanJoinTripTracking: jest.Mock
    assertCanPublishTripLocation: jest.Mock
  }
  let room: { emit: jest.Mock }

  const makeClient = (socketUser = user(22, roleName.DRIVER)) =>
    ({
      data: { user: socketUser },
      id: 'socket-1',
      join: jest.fn(),
      leave: jest.fn(),
    }) as any

  beforeEach(() => {
    trackingAccessService = {
      assertCanJoinTripTracking: jest.fn().mockResolvedValue(undefined),
      assertCanPublishTripLocation: jest.fn().mockResolvedValue(undefined),
    }
    gateway = new TrackingGateway({ validateClient: jest.fn() } as any, trackingAccessService as any)
    room = { emit: jest.fn() }
    gateway.server = {
      emit: jest.fn(),
      to: jest.fn().mockReturnValue(room),
    } as any
  })

  it('driver đúng trip được publish location update', async () => {
    const client = makeClient(user(22, roleName.DRIVER))

    const result = await gateway.handleLocationUpdate({ tripId: 10, lat: 10.1, lng: 106.2 }, client)

    expect(result).toEqual({ status: 'success' })
    expect(trackingAccessService.assertCanPublishTripLocation).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 22 }),
      10,
    )
    expect(gateway.server.to).toHaveBeenCalledWith('trip_10')
    expect(room.emit).toHaveBeenCalledWith('locationUpdated', expect.objectContaining({ driverId: 22, tripId: 10 }))
  })

  it('chặn publish location khi driver không thuộc trip', async () => {
    trackingAccessService.assertCanPublishTripLocation.mockRejectedValueOnce(new Error('forbidden'))

    const result = await gateway.handleLocationUpdate({ tripId: 10, lat: 10.1, lng: 106.2 }, makeClient())

    expect(result).toEqual({ status: 'error', message: 'Bạn không phải tài xế của chuyến này.' })
    expect(room.emit).not.toHaveBeenCalled()
  })

  it('join trip room dùng TrackingAccessService để scope quyền', async () => {
    const client = makeClient(user(7, roleName.CUSTOMER))

    const result = await gateway.handleJoinRoom({ tripId: 10 }, client)

    expect(result).toEqual({ event: 'joined', message: 'Successfully joined trip_10' })
    expect(trackingAccessService.assertCanJoinTripTracking).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, roleName: roleName.CUSTOMER }),
      10,
    )
    expect(client.join).toHaveBeenCalledWith('trip_10')
  })

  it('không cho join trip room khi access policy từ chối', async () => {
    trackingAccessService.assertCanJoinTripTracking.mockRejectedValueOnce(new Error('forbidden'))
    const client = makeClient(user(7, roleName.CUSTOMER))

    const result = await gateway.handleJoinRoom({ tripId: 10 }, client)

    expect(result).toEqual({ event: 'error', message: 'Bạn không có quyền theo dõi chuyến xe này.' })
    expect(client.join).not.toHaveBeenCalled()
  })
})
