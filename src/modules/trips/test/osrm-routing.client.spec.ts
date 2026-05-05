import { OsrmRoutingClient } from '../service/osrm-routing.client'

describe('OsrmRoutingClient', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  it('giữ inputIndex để caller map waypoint về stop gốc', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        code: 'Ok',
        trips: [{ distance: 2400, duration: 300 }],
        waypoints: [{ waypoint_index: 0 }, { waypoint_index: 2 }, { waypoint_index: 1 }],
      }),
      ok: true,
      status: 200,
    }) as any

    const client = new OsrmRoutingClient()

    const result = await client.optimizeRoute([
      { id: 'start', lat: 10, lng: 106 },
      { id: 'stop-a', lat: 10.1, lng: 106.1, stopId: 1 },
      { id: 'stop-b', lat: 10.2, lng: 106.2, stopId: 2 },
    ])

    expect(result).toMatchObject({
      distanceMeters: 2400,
      durationSeconds: 300,
      fallbackUsed: false,
      provider: 'OSRM',
    })
    expect(result.waypoints.map((waypoint) => ({
      id: waypoint.id,
      inputIndex: waypoint.inputIndex,
      optimizedSequence: waypoint.optimizedSequence,
    }))).toEqual([
      { id: 'start', inputIndex: 0, optimizedSequence: 0 },
      { id: 'stop-a', inputIndex: 1, optimizedSequence: 2 },
      { id: 'stop-b', inputIndex: 2, optimizedSequence: 1 },
    ])
  })

  it('fallback Haversine khi OSRM lỗi và vẫn trả distance lớn hơn 0', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any
    const client = new OsrmRoutingClient()

    const result = await client.optimizeRoute([
      { id: 'start', lat: 10, lng: 106 },
      { id: 'stop-a', lat: 10.01, lng: 106.01, stopId: 1 },
    ])

    expect(result.fallbackUsed).toBe(true)
    expect(result.provider).toBe('HAVERSINE')
    expect(result.distanceMeters).toBeGreaterThan(0)
    expect(result.waypoints.map((waypoint) => waypoint.optimizedSequence)).toEqual([0, 1])
  })
})
