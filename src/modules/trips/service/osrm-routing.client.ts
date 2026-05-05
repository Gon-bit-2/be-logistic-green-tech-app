import { Injectable, Logger } from '@nestjs/common'
import { calculateHaversineDistance } from 'src/common/utils/geo.util'

export type RouteWaypoint = {
  id: string
  lat: number
  lng: number
  stopId?: number
}

export type OptimizedWaypoint = RouteWaypoint & {
  inputIndex: number
  optimizedSequence: number
}

export type RouteOptimizationResult = {
  distanceMeters: number
  durationSeconds: number
  fallbackUsed: boolean
  provider: 'OSRM' | 'HAVERSINE'
  waypoints: OptimizedWaypoint[]
}

type OsrmTripResponse = {
  code: string
  message?: string
  trips?: {
    distance: number
    duration: number
  }[]
  waypoints?: {
    waypoint_index: number
  }[]
}

@Injectable()
export class OsrmRoutingClient {
  private readonly logger = new Logger(OsrmRoutingClient.name)
  private readonly baseUrl = process.env.OSRM_BASE_URL ?? 'http://router.project-osrm.org'

  async optimizeRoute(waypoints: RouteWaypoint[], roundtrip = false): Promise<RouteOptimizationResult> {
    if (waypoints.length < 2) {
      return this.buildFallbackResult(waypoints)
    }

    const coordinatePath = waypoints.map((waypoint) => `${waypoint.lng},${waypoint.lat}`).join(';')
    const url =
      `${this.baseUrl}/trip/v1/driving/${coordinatePath}` +
      `?roundtrip=${roundtrip}&source=first&geometries=polyline`

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
        `OSRM optimization failed, using Haversine fallback: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return this.buildFallbackResult(waypoints)
    }
  }

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
