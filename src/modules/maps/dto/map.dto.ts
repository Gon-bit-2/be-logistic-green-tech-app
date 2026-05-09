import { createZodDto } from 'nestjs-zod'
import {
  AutocompleteQuerySchema,
  DirectionResSchema,
  DirectionsBodySchema,
  GeocodeResSchema,
  GeocodeQuerySchema,
  PlaceAutocompleteResSchema,
  PlaceAutocompleteItemResSchema,
  PlaceDetailQuerySchema,
  PlaceDetailResSchema,
} from '../model/map.model'

export class AutocompleteQueryDTO extends createZodDto(AutocompleteQuerySchema) {}

export class PlaceDetailQueryDTO extends createZodDto(PlaceDetailQuerySchema) {}

export class GeocodeQueryDTO extends createZodDto(GeocodeQuerySchema) {}

export class DirectionsBodyDTO extends createZodDto(DirectionsBodySchema) {}

export class PlaceAutocompleteItemResDTO extends createZodDto(PlaceAutocompleteItemResSchema) {}

export class PlaceAutocompleteResDTO extends createZodDto(PlaceAutocompleteResSchema) {}

export class PlaceDetailResDTO extends createZodDto(PlaceDetailResSchema) {}

export class GeocodeResDTO extends createZodDto(GeocodeResSchema) {}

export class DirectionResDTO extends createZodDto(DirectionResSchema) {}
