import z from 'zod'

export const AutocompleteQuerySchema = z.object({
  input: z.string().min(1, 'Input is required'),
  sessionToken: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  limit: z.coerce.number().int().positive().max(20).default(10).optional(),
})

export const PlaceDetailQuerySchema = z.object({
  placeId: z.string().min(1, 'Place ID is required'),
  sessionToken: z.string().optional(),
})

export const GeocodeQuerySchema = z.object({
  address: z.string().min(1, 'Address is required'),
})

export const DirectionsBodySchema = z.object({
  origin: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  destination: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  vehicle: z.enum(['car', 'bike', 'taxi', 'truck', 'hd']).default('car').optional(),
})

// Response Schemas để chuẩn hóa payload trả về cho Frontend
export const PlaceAutocompleteItemResSchema = z.object({
  placeId: z.string(),
  description: z.string(),
  mainText: z.string(),
  secondaryText: z.string(),
})

export const PlaceDetailResSchema = z.object({
  placeId: z.string(),
  name: z.string(),
  formattedAddress: z.string(),
  latitude: z.number(),
  longitude: z.number(),
})

export const DirectionResSchema = z.object({
  distanceMeters: z.number(),
  durationSeconds: z.number(),
  polyline: z.string(),
  bounds: z.any().optional(),
})

export type AutocompleteQueryType = z.infer<typeof AutocompleteQuerySchema>
export type PlaceDetailQueryType = z.infer<typeof PlaceDetailQuerySchema>
export type GeocodeQueryType = z.infer<typeof GeocodeQuerySchema>
export type DirectionsBodyType = z.infer<typeof DirectionsBodySchema>
export type PlaceAutocompleteItemResType = z.infer<typeof PlaceAutocompleteItemResSchema>
export type PlaceDetailResType = z.infer<typeof PlaceDetailResSchema>
export type DirectionResType = z.infer<typeof DirectionResSchema>
