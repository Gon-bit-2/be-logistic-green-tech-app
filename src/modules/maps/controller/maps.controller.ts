import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus } from '@nestjs/common'
import { MapsService } from '../service/maps.service'
import {
  AutocompleteQueryDTO,
  DirectionResDTO,
  DirectionsBodyDTO,
  GeocodeQueryDTO,
  GeocodeResDTO,
  PlaceAutocompleteResDTO,
  PlaceDetailQueryDTO,
  PlaceDetailResDTO,
} from '../dto/map.dto'
import { Roles } from 'src/common/decorators/roles.decorator'
import roleName from 'src/common/constants/role.constant'
import { ZodSerializerDto } from 'nestjs-zod'

@Controller('maps')
export class MapsController {
  constructor(private readonly mapsService: MapsService) {}

  @Get('places/autocomplete')
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  @ZodSerializerDto(PlaceAutocompleteResDTO)
  autocomplete(@Query() query: AutocompleteQueryDTO) {
    return this.mapsService.autocomplete(query)
  }

  @Get('places/detail')
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  @ZodSerializerDto(PlaceDetailResDTO)
  placeDetail(@Query() query: PlaceDetailQueryDTO) {
    return this.mapsService.placeDetail(query)
  }

  @Get('geocode')
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  @ZodSerializerDto(GeocodeResDTO)
  geocode(@Query() query: GeocodeQueryDTO) {
    return this.mapsService.geocode(query)
  }

  @Post('directions')
  @HttpCode(HttpStatus.OK)
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  @ZodSerializerDto(DirectionResDTO)
  directions(@Body() body: DirectionsBodyDTO) {
    return this.mapsService.directions(body)
  }
}
