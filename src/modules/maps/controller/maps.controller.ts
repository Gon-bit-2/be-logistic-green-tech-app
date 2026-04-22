import { Controller, Get, Post, Body, Query } from '@nestjs/common'
import { MapsService } from '../service/maps.service'
import { AutocompleteQueryDTO, DirectionsBodyDTO, GeocodeQueryDTO, PlaceDetailQueryDTO } from '../dto/map.dto'
import { Roles } from 'src/common/decorators/roles.decorator'
import roleName from 'src/common/constants/role.constant'

@Controller('maps')
export class MapsController {
  constructor(private readonly mapsService: MapsService) {}

  @Get('places/autocomplete')
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  autocomplete(@Query() query: AutocompleteQueryDTO) {
    return this.mapsService.autocomplete(query)
  }

  @Get('places/detail')
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  placeDetail(@Query() query: PlaceDetailQueryDTO) {
    return this.mapsService.placeDetail(query)
  }

  @Get('geocode')
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  geocode(@Query() query: GeocodeQueryDTO) {
    return this.mapsService.geocode(query)
  }

  @Post('directions')
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  directions(@Body() body: DirectionsBodyDTO) {
    return this.mapsService.directions(body)
  }
}
