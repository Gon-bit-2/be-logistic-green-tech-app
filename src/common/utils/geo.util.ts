/**
 * Tính khoảng cách đường chim bay giữa 2 điểm bằng thuật toán Haversine
 * @param lat1 Vĩ độ điểm đi
 * @param lon1 Kinh độ điểm đi
 * @param lat2 Vĩ độ điểm đến
 * @param lon2 Kinh độ điểm đến
 * @returns Khoảng cách theo kilometer (km)
 */
export function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Bán kính Trái Đất (km)
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = R * c

  return distance
}
