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

export const PlaceAutocompleteResSchema = z.object({
  data: z.array(PlaceAutocompleteItemResSchema),
})

export const PlaceDetailResSchema = z.object({
  placeId: z.string(),
  name: z.string(),
  formattedAddress: z.string(),
  latitude: z.number(),
  longitude: z.number(),
})

export const GeocodeItemResSchema = PlaceDetailResSchema.pick({
  formattedAddress: true,
  latitude: true,
  longitude: true,
  placeId: true,
})

export const GeocodeResSchema = z.object({
  data: z.array(GeocodeItemResSchema),
})

export const DirectionResSchema = z.object({
  distanceMeters: z.number(),
  durationSeconds: z.number(),
  polyline: z.string(),
  bounds: z.unknown().optional(),
})

export const GoongErrorSchema = z.object({
  message: z.string().optional(),
})

const GoongLocationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
})

export const GoongAutocompleteResponseSchema = z.object({
  error: GoongErrorSchema.optional(),
  predictions: z
    .array(
      z.object({
        description: z.string(),
        place_id: z.string(),
        structured_formatting: z
          .object({
            main_text: z.string().optional(),
            secondary_text: z.string().optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  status: z.string().optional(),
})

export const GoongPlaceDetailResponseSchema = z.object({
  error: GoongErrorSchema.optional(),
  result: z
    .object({
      formatted_address: z.string(),
      geometry: z.object({
        location: GoongLocationSchema,
      }),
      name: z.string().optional(),
      place_id: z.string(),
    })
    .optional(),
  status: z.string().optional(),
})

export const GoongGeocodeResponseSchema = z.object({
  error: GoongErrorSchema.optional(),
  results: z
    .array(
      z.object({
        formatted_address: z.string(),
        geometry: z.object({
          location: GoongLocationSchema,
        }),
        place_id: z.string(),
      }),
    )
    .optional(),
  status: z.string().optional(),
})

export const GoongDirectionsResponseSchema = z.object({
  error: GoongErrorSchema.optional(),
  routes: z
    .array(
      z.object({
        bounds: z.unknown().optional(),
        legs: z
          .array(
            z.object({
              distance: z.object({ value: z.number() }),
              duration: z.object({ value: z.number() }),
            }),
          )
          .min(1),
        overview_polyline: z.object({
          points: z.string(),
        }),
      }),
    )
    .optional(),
  status: z.string().optional(),
})

export type AutocompleteQueryType = z.infer<typeof AutocompleteQuerySchema>
export type PlaceDetailQueryType = z.infer<typeof PlaceDetailQuerySchema>
export type GeocodeQueryType = z.infer<typeof GeocodeQuerySchema>
export type DirectionsBodyType = z.infer<typeof DirectionsBodySchema>
export type PlaceAutocompleteItemResType = z.infer<typeof PlaceAutocompleteItemResSchema>
export type PlaceAutocompleteResType = z.infer<typeof PlaceAutocompleteResSchema>
export type PlaceDetailResType = z.infer<typeof PlaceDetailResSchema>
export type GeocodeResType = z.infer<typeof GeocodeResSchema>
export type DirectionResType = z.infer<typeof DirectionResSchema>
