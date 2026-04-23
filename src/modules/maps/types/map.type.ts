/**
 * Định nghĩa các kiểu dữ liệu liên quan đến Maps, bao gồm:
 * - Prediction: Kết quả dự đoán autocomplete
 * - PlaceResult: Kết quả chi tiết địa điểm
 * - GeocodeResult: Kết quả phân tích địa chỉ thành tọa độ
 * - RouteResult: Kết quả tuyến đường giữa hai điểm
 */
type Prediction = {
  place_id: string
  description: string
  structured_formatting?: { main_text?: string; secondary_text?: string }
}
type PlaceResult = {
  place_id: string
  name?: string
  formatted_address: string
  geometry: { location: { lat: number; lng: number } }
}
type GeocodeResult = {
  formatted_address: string
  geometry: { location: { lat: number; lng: number } }
  place_id: string
}
type RouteResult = {
  overview_polyline: { points: string }
  bounds: unknown
  legs: Array<{
    distance: { value: number }
    duration: { value: number }
  }>
}
export type { Prediction, PlaceResult, GeocodeResult, RouteResult }
