import { Logger } from '@nestjs/common'

const logger = new Logger('RoutingUtil')

export interface RouteCoordinate {
  lat: number
  lng: number
}

export interface OptimizedRouteResult {
  waypoints: RouteCoordinate[]
  distance: number // in meters
  duration: number // in seconds
  polyline?: string | null
}

type OsrmTripResponse = {
  code: string
  waypoints: {
    waypoint_index: number
    location: [number, number]
  }[]
  trips: {
    distance: number
    duration: number
    geometry?: string
  }[]
}

/**
 * Call OSRM Trip API to optimize route (TSP) for given coordinates
 */
export async function optimizeRouteWithOSRM(
  coordinates: RouteCoordinate[],
  roundtrip = false,
): Promise<OptimizedRouteResult> {
  if (coordinates.length < 2) {
    return {
      waypoints: coordinates,
      distance: 0,
      duration: 0,
    }
  }

  // OSRM format: lng,lat;lng,lat
  const coordString = coordinates.map((c) => `${c.lng},${c.lat}`).join(';')

  const url = `http://router.project-osrm.org/trip/v1/driving/${coordString}?roundtrip=${roundtrip}&source=first&geometries=polyline`

  try {
    const response = await fetch(url)
    const data = (await response.json()) as OsrmTripResponse

    if (data.code !== 'Ok') {
      throw new Error('OSRM API returned error: ' + data.code)
    }

    // data.waypoints has the optimized sequence
    const optimizedWaypoints = data.waypoints
      .sort((a, b) => a.waypoint_index - b.waypoint_index)
      .map((wp) => ({
        lng: wp.location[0],
        lat: wp.location[1],
      }))

    const distance = data.trips[0].distance
    const duration = data.trips[0].duration

    return {
      waypoints: optimizedWaypoints,
      distance,
      duration,
      polyline: data.trips?.[0]?.geometry ?? null,
    }
  } catch (error: unknown) {
    logger.error(
      `Error optimizing route with OSRM: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.stack : undefined,
    )
    // Fallback to original
    return {
      waypoints: coordinates,
      distance: 0,
      duration: 0,
      polyline: null,
    }
  }
}
