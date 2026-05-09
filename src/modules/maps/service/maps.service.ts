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

@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name)
  private readonly baseUrl = envConfig.GOONG_BASE_URL || 'https://rsapi.goong.io'
  private readonly apiKey = envConfig.GOONG_MAPS_API_KEY

  private parseGoongResponse<T>(schema: ZodSchema<T>, data: unknown): T {
    const result = schema.safeParse(data)
    if (!result.success) {
      this.logger.warn('Goong API response schema mismatch')
      throw new BadRequestException('Dữ liệu trả về từ Maps API không hợp lệ')
    }
    return result.data
  }

  /**
   * 1. Gợi ý địa chỉ từ từ khóa (Autocomplete)
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
   * 2. Lấy chi tiết địa điểm và tọa độ từ placeId (Place Detail)
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
   * 3. Phân tích địa chỉ text thành tọa độ (Geocode)
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
   * 4. Tính toán quãng đường và thời gian (Directions)
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
