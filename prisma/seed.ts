import { PrismaClient } from '../generated/prisma'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Bắt đầu seed dữ liệu...')

  // ===== SEED HUBS =====
  const hubs = await Promise.all([
    prisma.hub.upsert({
      where: { code: 'HN-HUB-01' },
      update: {},
      create: {
        code: 'HN-HUB-01',
        name: 'Kho Trung Chuyển Hà Nội',
        address: '123 Nguyễn Trãi, Thanh Xuân, Hà Nội',
        latitude: 21.0024,
        longitude: 105.8041,
      },
    }),
    prisma.hub.upsert({
      where: { code: 'DN-HUB-01' },
      update: {},
      create: {
        code: 'DN-HUB-01',
        name: 'Kho Trung Chuyển Đà Nẵng',
        address: '45 Điện Biên Phủ, Thanh Khê, Đà Nẵng',
        latitude: 16.0544,
        longitude: 108.2022,
      },
    }),
    prisma.hub.upsert({
      where: { code: 'HCM-HUB-01' },
      update: {},
      create: {
        code: 'HCM-HUB-01',
        name: 'Kho Trung Chuyển TP.HCM',
        address: '789 Cách Mạng Tháng 8, Quận 3, TP.HCM',
        latitude: 10.7769,
        longitude: 106.6951,
      },
    }),
    prisma.hub.upsert({
      where: { code: 'HP-HUB-01' },
      update: {},
      create: {
        code: 'HP-HUB-01',
        name: 'Kho Trung Chuyển Hải Phòng',
        address: '56 Lạch Tray, Ngô Quyền, Hải Phòng',
        latitude: 20.8449,
        longitude: 106.6881,
      },
    }),
    prisma.hub.upsert({
      where: { code: 'CT-HUB-01' },
      update: {},
      create: {
        code: 'CT-HUB-01',
        name: 'Kho Trung Chuyển Cần Thơ',
        address: '12 Hòa Bình, Ninh Kiều, Cần Thơ',
        latitude: 10.0452,
        longitude: 105.7469,
      },
    }),
  ])

  console.log(`✅ Đã tạo ${hubs.length} kho trung chuyển`)

  // ===== SEED VEHICLES =====
  const vehicleData = [
    // Xe tải điện (Green Tech)
    {
      licensePlate: '30A-11111',
      type: 'ELECTRIC_VAN' as const,
      fuelType: 'ELECTRIC' as const,
      capacityWeight: 1500,
      capacityVolume: 8.0,
      emissionRatePerKm: 0,
      hubId: hubs[0].id,
    },
    {
      licensePlate: '30A-11112',
      type: 'ELECTRIC_VAN' as const,
      fuelType: 'ELECTRIC' as const,
      capacityWeight: 2000,
      capacityVolume: 10.0,
      emissionRatePerKm: 0,
      hubId: hubs[0].id,
    },
    {
      licensePlate: '43A-22221',
      type: 'ELECTRIC_VAN' as const,
      fuelType: 'ELECTRIC' as const,
      capacityWeight: 1800,
      capacityVolume: 9.0,
      emissionRatePerKm: 0,
      hubId: hubs[1].id,
    },
    {
      licensePlate: '51A-33331',
      type: 'ELECTRIC_VAN' as const,
      fuelType: 'ELECTRIC' as const,
      capacityWeight: 2500,
      capacityVolume: 12.0,
      emissionRatePerKm: 0,
      hubId: hubs[2].id,
    },

    // Xe tải diesel
    {
      licensePlate: '30A-11113',
      type: 'TRUCK' as const,
      fuelType: 'DIESEL' as const,
      capacityWeight: 5000,
      capacityVolume: 25.0,
      emissionRatePerKm: 250,
      hubId: hubs[0].id,
    },
    {
      licensePlate: '30A-11114',
      type: 'TRUCK' as const,
      fuelType: 'DIESEL' as const,
      capacityWeight: 8000,
      capacityVolume: 40.0,
      emissionRatePerKm: 350,
      hubId: hubs[0].id,
    },
    {
      licensePlate: '43A-22222',
      type: 'TRUCK' as const,
      fuelType: 'DIESEL' as const,
      capacityWeight: 6000,
      capacityVolume: 30.0,
      emissionRatePerKm: 280,
      hubId: hubs[1].id,
    },
    {
      licensePlate: '51A-33332',
      type: 'TRUCK' as const,
      fuelType: 'DIESEL' as const,
      capacityWeight: 7000,
      capacityVolume: 35.0,
      emissionRatePerKm: 320,
      hubId: hubs[2].id,
    },
    {
      licensePlate: '15A-44441',
      type: 'TRUCK' as const,
      fuelType: 'DIESEL' as const,
      capacityWeight: 10000,
      capacityVolume: 50.0,
      emissionRatePerKm: 400,
      hubId: hubs[3].id,
    },
    {
      licensePlate: '65A-55551',
      type: 'TRUCK' as const,
      fuelType: 'DIESEL' as const,
      capacityWeight: 5500,
      capacityVolume: 28.0,
      emissionRatePerKm: 260,
      hubId: hubs[4].id,
    },

    // Xe van xăng
    {
      licensePlate: '30A-11115',
      type: 'VAN' as const,
      fuelType: 'GASOLINE' as const,
      capacityWeight: 1200,
      capacityVolume: 6.0,
      emissionRatePerKm: 180,
      hubId: hubs[0].id,
    },
    {
      licensePlate: '43A-22223',
      type: 'VAN' as const,
      fuelType: 'GASOLINE' as const,
      capacityWeight: 1000,
      capacityVolume: 5.0,
      emissionRatePerKm: 160,
      hubId: hubs[1].id,
    },
    {
      licensePlate: '51A-33333',
      type: 'VAN' as const,
      fuelType: 'GASOLINE' as const,
      capacityWeight: 1300,
      capacityVolume: 7.0,
      emissionRatePerKm: 190,
      hubId: hubs[2].id,
    },
    {
      licensePlate: '15A-44442',
      type: 'VAN' as const,
      fuelType: 'GASOLINE' as const,
      capacityWeight: 1100,
      capacityVolume: 5.5,
      emissionRatePerKm: 170,
      hubId: hubs[3].id,
    },
    {
      licensePlate: '65A-55552',
      type: 'VAN' as const,
      fuelType: 'DIESEL' as const,
      capacityWeight: 1400,
      capacityVolume: 7.5,
      emissionRatePerKm: 200,
      hubId: hubs[4].id,
    },

    // Xe máy giao hàng last-mile
    {
      licensePlate: '30A-MC001',
      type: 'MOTORCYCLE' as const,
      fuelType: 'GASOLINE' as const,
      capacityWeight: 50,
      capacityVolume: 0.5,
      emissionRatePerKm: 30,
      hubId: hubs[0].id,
    },
    {
      licensePlate: '43A-MC002',
      type: 'MOTORCYCLE' as const,
      fuelType: 'GASOLINE' as const,
      capacityWeight: 50,
      capacityVolume: 0.5,
      emissionRatePerKm: 30,
      hubId: hubs[1].id,
    },
    {
      licensePlate: '51A-MC003',
      type: 'MOTORCYCLE' as const,
      fuelType: 'GASOLINE' as const,
      capacityWeight: 60,
      capacityVolume: 0.6,
      emissionRatePerKm: 35,
      hubId: hubs[2].id,
    },
    {
      licensePlate: '51A-MC004',
      type: 'MOTORCYCLE' as const,
      fuelType: 'ELECTRIC' as const,
      capacityWeight: 40,
      capacityVolume: 0.4,
      emissionRatePerKm: 0,
      hubId: hubs[2].id,
    },
    {
      licensePlate: '15A-MC005',
      type: 'MOTORCYCLE' as const,
      fuelType: 'GASOLINE' as const,
      capacityWeight: 55,
      capacityVolume: 0.5,
      emissionRatePerKm: 32,
      hubId: hubs[3].id,
    },
  ]

  let vehicleCount = 0
  for (const vehicle of vehicleData) {
    await prisma.vehicle.upsert({
      where: { licensePlate: vehicle.licensePlate },
      update: {},
      create: vehicle,
    })
    vehicleCount++
  }

  console.log(`✅ Đã tạo ${vehicleCount} phương tiện`)
  console.log('🎉 Seed dữ liệu hoàn tất!')
}

main()
  .catch((e) => {
    console.error('❌ Seed thất bại:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
