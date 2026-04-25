import { createZodDto } from 'nestjs-zod'
import {
  AutocompleteQuerySchema,
  DirectionResSchema,
  DirectionsBodySchema,
  GeocodeQuerySchema,
  PlaceAutocompleteItemResSchema,
  PlaceDetailQuerySchema,
  PlaceDetailResSchema,
} from '../model/map.model'

export class AutocompleteQueryDTO extends createZodDto(AutocompleteQuerySchema) {}

export class PlaceDetailQueryDTO extends createZodDto(PlaceDetailQuerySchema) {}

export class GeocodeQueryDTO extends createZodDto(GeocodeQuerySchema) {}

export class DirectionsBodyDTO extends createZodDto(DirectionsBodySchema) {}

export class PlaceAutocompleteItemResDTO extends createZodDto(PlaceAutocompleteItemResSchema) {}

export class PlaceDetailResDTO extends createZodDto(PlaceDetailResSchema) {}

export class DirectionResDTO extends createZodDto(DirectionResSchema) {}
