import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import type { ZodSchema } from 'zod'
import { AutocompleteQueryDTO, DirectionsBodyDTO, GeocodeQueryDTO, PlaceDetailQueryDTO } from '../dto/map.dto'
import envConfig from 'src/config/config'
import {
  GoongAutocompleteResponseSchema,
  GoongDirectionsResponseSchema,
  GoongGeocodeResponseSchema,
  GoongPlaceDetailResponseSchema,
} from '../model/map.model'

/**
 * Service managing integration with external mapping services (e.g. Goong API) to handle geocoding, autocomplete, and routing.
 * 
 * Dịch vụ quản lý tích hợp với các dịch vụ bản đồ bên ngoài (ví dụ: Goong API) để xử lý geocoding, tự động hoàn thành địa điểm và chỉ đường.
 */
@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name)
  private readonly baseUrl = envConfig.GOONG_BASE_URL || 'https://rsapi.goong.io'
  private readonly apiKey = envConfig.GOONG_MAPS_API_KEY

  /**
   * Helper that parses and validates mapping API responses against a Zod schema.
   * 
   * Trình hỗ trợ phân tích và xác thực dữ liệu phản hồi từ Maps API dựa trên một Zod schema.
   * 
   * @param schema - Target validation Zod schema / Zod schema xác thực đích.
   * @param data - Raw response object / Đối tượng dữ liệu phản hồi thô.
   * @returns Validated schema object / Đối tượng dữ liệu sau xác thực.
   * @throws BadRequestException if the schema validation fails / BadRequestException nếu xác thực dữ liệu thất bại.
   */
  private parseGoongResponse<T>(schema: ZodSchema<T>, data: unknown): T {
    const result = schema.safeParse(data)
    if (!result.success) {
      this.logger.warn('Goong API response schema mismatch')
      throw new BadRequestException('Dữ liệu trả về từ Maps API không hợp lệ')
    }
    return result.data
  }

  /**
   * Queries autocomplete predictions for locations or places from Goong API.
   * 
   * Truy vấn gợi ý tự động hoàn thành địa điểm hoặc khu vực địa lý từ Goong API.
   * 
   * @param query - Input keyword and optional lat/lng proximity / Từ khóa tìm kiếm và tọa độ vị trí gần đó tùy chọn.
   * @returns Array of autocomplete predictions / Mảng danh sách các gợi ý tự động hoàn thành địa điểm.
   * @throws BadRequestException if mapping API returns error status / BadRequestException nếu Maps API trả về lỗi.
   */
  async autocomplete(query: AutocompleteQueryDTO) {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      input: query.input,
    })

    if (query.sessionToken) params.append('sessiontoken', query.sessionToken)
    if (query.lat && query.lng) params.append('location', `${query.lat},${query.lng}`)
    if (query.limit) params.append('limit', query.limit.toString())

    try {
      const response = await fetch(`${this.baseUrl}/Place/AutoComplete?${params.toString()}`)

      const data = this.parseGoongResponse(GoongAutocompleteResponseSchema, await response.json())

      if (data.error || data.status === 'ERROR') {
        throw new BadRequestException(data.error?.message || 'Lỗi từ Goong API')
      }

      const results = data.predictions || []

      return {
        data: results.map((item) => ({
          placeId: item.place_id,
          description: item.description,
          mainText: item.structured_formatting?.main_text || item.description,
          secondaryText: item.structured_formatting?.secondary_text || '',
        })),
      }
    } catch (error: unknown) {
      this.logger.error(`Autocomplete error: ${error instanceof Error ? error.message : String(error)}`)
      if (error instanceof BadRequestException) throw error
      throw new BadRequestException('Không thể lấy dữ liệu autocomplete từ Maps API')
    }
  }

  /**
   * Retrieves detailed geographic coordinates and metadata of a place by its unique Place ID.
   * 
   * Lấy chi tiết tọa độ địa lý và thông tin liên quan của một địa điểm theo Place ID duy nhất.
   * 
   * @param query - Target place ID and optional session token / ID địa điểm đích và token phiên tùy chọn.
   * @returns Place details containing coordinates and formatted address / Chi tiết địa điểm chứa tọa độ và địa chỉ chuẩn hóa.
   * @throws BadRequestException if place is missing or API fails / BadRequestException nếu thiếu địa điểm hoặc API thất bại.
   */
  async placeDetail(query: PlaceDetailQueryDTO) {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      place_id: query.placeId,
    })

    if (query.sessionToken) params.append('sessiontoken', query.sessionToken)

    try {
      const response = await fetch(`${this.baseUrl}/Place/Detail?${params.toString()}`)

      const data = this.parseGoongResponse(GoongPlaceDetailResponseSchema, await response.json())

      if (data.error || data.status === 'ERROR') {
        throw new BadRequestException(data.error?.message || 'Lỗi từ Goong API')
      }

      const place = data.result
      if (!place) throw new BadRequestException('Không tìm thấy địa điểm')

      return {
        placeId: place.place_id,
        name: place.name || place.formatted_address,
        formattedAddress: place.formatted_address,
        latitude: place.geometry.location.lat,
        longitude: place.geometry.location.lng,
      }
    } catch (error: unknown) {
      this.logger.error(`PlaceDetail error: ${error instanceof Error ? error.message : String(error)}`)
      if (error instanceof BadRequestException) throw error
      throw new BadRequestException('Không thể lấy chi tiết địa điểm từ Maps API')
    }
  }

  /**
   * Performs forward geocoding (translates string address to geographic coordinates).
   * 
   * Thực hiện geocoding xuôi (chuyển đổi địa chỉ văn bản thành tọa độ địa lý).
   * 
   * @param query - Input target address string / Chuỗi văn bản địa chỉ đích đầu vào.
   * @returns Array of matching geocoded places containing coordinates / Mảng danh sách các địa điểm phù hợp chứa tọa độ.
   * @throws BadRequestException if geocoding fails / BadRequestException nếu geocode thất bại.
   */
  async geocode(query: GeocodeQueryDTO) {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      address: query.address,
    })

    try {
      const response = await fetch(`${this.baseUrl}/Geocode?${params.toString()}`)

      const data = this.parseGoongResponse(GoongGeocodeResponseSchema, await response.json())

      if (data.error || data.status === 'ERROR') {
        throw new BadRequestException(data.error?.message || 'Lỗi từ Goong API')
      }

      const results = data.results || []

      return {
        data: results.map((item) => ({
          formattedAddress: item.formatted_address,
          latitude: item.geometry.location.lat,
          longitude: item.geometry.location.lng,
          placeId: item.place_id,
        })),
      }
    } catch (error: unknown) {
      this.logger.error(`Geocode error: ${error instanceof Error ? error.message : String(error)}`)
      if (error instanceof BadRequestException) throw error
      throw new BadRequestException('Không thể geocode từ Maps API')
    }
  }

  /**
   * Computes driving/riding routes, distances and travel durations between origin and destination coordinates.
   * 
   * Tính toán các lộ trình di chuyển, khoảng cách và thời gian đi lại giữa tọa độ xuất phát và điểm đích.
   * 
   * @param body - Origin, destination and vehicle parameters / Điểm đi, điểm đến và các tham số loại xe.
   * @returns Calculated route geometries, distance, and duration / Hình học tuyến đường, khoảng cách và thời gian tính toán.
   * @throws BadRequestException if routing calculations fail / BadRequestException nếu tính toán định tuyến thất bại.
   */
  async directions(body: DirectionsBodyDTO) {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      origin: `${body.origin.lat},${body.origin.lng}`,
      destination: `${body.destination.lat},${body.destination.lng}`,
      vehicle: body.vehicle || 'car',
    })

    try {
      const response = await fetch(`${this.baseUrl}/Direction?${params.toString()}`)

      const data = this.parseGoongResponse(GoongDirectionsResponseSchema, await response.json())

      if (data.error || data.status === 'ERROR' || !data.routes || data.routes.length === 0) {
        throw new BadRequestException(data.error?.message || 'Lỗi từ Goong API hoặc không tìm thấy tuyến đường')
      }

      const route = data.routes[0]
      const leg = route.legs[0]

      return {
        distanceMeters: leg.distance.value,
        durationSeconds: leg.duration.value,
        polyline: route.overview_polyline.points,
        bounds: route.bounds,
      }
    } catch (error: unknown) {
      this.logger.error(`Directions error: ${error instanceof Error ? error.message : String(error)}`)
      if (error instanceof BadRequestException) throw error
      throw new BadRequestException('Không thể lấy hướng dẫn đường đi từ Maps API')
    }
  }
}
