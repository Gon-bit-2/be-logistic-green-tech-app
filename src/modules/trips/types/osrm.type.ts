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

export type OsrmTripResponse = {
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
