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

/**
 * Controller for managing geographical map integrations, geocoding, places queries, and routes/directions.
 * 
 * Controller quản lý việc tích hợp bản đồ địa lý, chuyển đổi địa chỉ (geocoding), truy vấn địa điểm và chỉ đường/tối ưu lộ trình.
 */
@Controller('maps')
export class MapsController {
  /**
   * Initializes the MapsController.
   * 
   * Khởi tạo MapsController.
   * 
   * @param mapsService - The Maps service instance / Instance của dịch vụ bản đồ.
   */
  constructor(private readonly mapsService: MapsService) {}

  /**
   * Performs autocomplete queries for geographical locations or places.
   * Accessible by Customer, Admin, Warehouse Staff, and Driver.
   * 
   * Thực hiện các truy vấn tự động hoàn thành cho các địa điểm hoặc khu vực địa lý.
   * Có thể truy cập bởi Khách hàng, Admin, Nhân viên kho và Tài xế.
   * 
   * @param query - Input search keyword / Từ khóa tìm kiếm đầu vào.
   * @returns Place autocomplete options / Danh sách các địa điểm tự động hoàn thành phù hợp.
   */
  @Get('places/autocomplete')
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  @ZodSerializerDto(PlaceAutocompleteResDTO)
  autocomplete(@Query() query: AutocompleteQueryDTO) {
    return this.mapsService.autocomplete(query)
  }

  /**
   * Retrieves detailed place information (coordinates, formatted address) by Place ID.
   * Accessible by Customer, Admin, Warehouse Staff, and Driver.
   * 
   * Lấy thông tin địa điểm chi tiết (tọa độ, địa chỉ chuẩn hóa) theo ID địa điểm (Place ID).
   * Có thể truy cập bởi Khách hàng, Admin, Nhân viên kho và Tài xế.
   * 
   * @param query - Target place ID / ID địa điểm đích.
   * @returns Detailed place information / Thông tin địa điểm chi tiết.
   */
  @Get('places/detail')
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  @ZodSerializerDto(PlaceDetailResDTO)
  placeDetail(@Query() query: PlaceDetailQueryDTO) {
    return this.mapsService.placeDetail(query)
  }

  /**
   * Performs geocoding (address to coordinates translation).
   * Accessible by Customer, Admin, Warehouse Staff, and Driver.
   * 
   * Thực hiện chuyển đổi địa chỉ văn bản thành tọa độ địa lý (geocoding).
   * Có thể truy cập bởi Khách hàng, Admin, Nhân viên kho và Tài xế.
   * 
   * @param query - Target address string / Chuỗi địa chỉ đích.
   * @returns Coordinates and formatted address metadata / Tọa độ và siêu dữ liệu địa chỉ đã định dạng.
   */
  @Get('geocode')
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  @ZodSerializerDto(GeocodeResDTO)
  geocode(@Query() query: GeocodeQueryDTO) {
    return this.mapsService.geocode(query)
  }

  /**
   * Computes routes, directions, and optimal distances between coordinates.
   * Accessible by Customer, Admin, Warehouse Staff, and Driver.
   * 
   * Tính toán lộ trình di chuyển, chỉ đường và khoảng cách tối ưu giữa các tọa độ.
   * Có thể truy cập bởi Khách hàng, Admin, Nhân viên kho và Tài xế.
   * 
   * @param body - Origin and destination coordinates / Tọa độ điểm bắt đầu và điểm đích.
   * @returns Route geometries and travel durations / Hình học tuyến đường và thời gian di chuyển.
   */
  @Post('directions')
  @HttpCode(HttpStatus.OK)
  @Roles(roleName.CUSTOMER, roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  @ZodSerializerDto(DirectionResDTO)
  directions(@Body() body: DirectionsBodyDTO) {
    return this.mapsService.directions(body)
  }
}
