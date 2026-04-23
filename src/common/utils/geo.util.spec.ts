import { calculateHaversineDistance } from './geo.util'

describe('Geo utility', () => {
  describe('calculateHaversineDistance', () => {
    it('nên trả về 0 nếu 2 tọa độ giống hệt nhau', () => {
      const lat = 10.762622
      const lng = 106.660172
      const distance = calculateHaversineDistance(lat, lng, lat, lng)
      expect(distance).toBe(0)
    })

    it('nếu khoảng cách HCM -> Hà Nội thì tầm khoảng ~1138 km', () => {
      // HCM
      const lat1 = 10.8231
      const lon1 = 106.6297
      // HN
      const lat2 = 21.0285
      const lon2 = 105.8542

      const distance = calculateHaversineDistance(lat1, lon1, lat2, lon2)
      // Kỳ vọng khoảng 1130 - 1150 km, set độ lớn bù trừ (tolerance) để so sánh
      expect(distance).toBeGreaterThan(1130)
      expect(distance).toBeLessThan(1150)
    })

    it('nên hoạt động bình thường với kinh độ/vĩ độ âm', () => {
      // New York
      const lat1 = 40.7128
      const lon1 = -74.006
      // Los Angeles
      const lat2 = 34.0522
      const lon2 = -118.2437

      const distance = calculateHaversineDistance(lat1, lon1, lat2, lon2)
      // Khoảng cách NY tới LA khoảng ~3935 km
      expect(distance).toBeGreaterThan(3900)
      expect(distance).toBeLessThan(4000)
    })

    it('nên tính được khoảng cách ngắn trong thành phố với độ chính xác cao', () => {
      // Bitexco Financial Tower (lat: 10.7716, lon: 106.7042)
      // Landmark 81 (lat: 10.7930, lon: 106.7214)
      const dist = calculateHaversineDistance(10.7716, 106.7042, 10.793, 106.7214)
      // Khoảng cách chim bay khoảng ngót 3km
      expect(dist).toBeGreaterThan(2.5)
      expect(dist).toBeLessThan(3.5)
    })
  })
})
