import { PrismaClient } from '../generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'
import * as bcrypt from 'bcrypt'
import 'dotenv/config'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

function normalizeEmailCode(code: string) {
  return code
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function main() {
  console.log('🌱 Bắt đầu seed dữ liệu...')

  // ===== SEED ROLES =====
  const roles = [
    { id: 1, name: 'ADMIN', description: 'Quản trị viên' },
    { id: 2, name: 'CUSTOMER', description: 'Khách hàng đăng đơn' },
    { id: 3, name: 'DRIVER', description: 'Tài xế giao hàng' },
    { id: 4, name: 'WAREHOUSE_STAFF', description: 'Nhân viên kho bãi' },
  ]
  for (const role of roles) {
    await prisma.role.upsert({ where: { name: role.name }, update: {}, create: role })
  }
  console.log('✅ Đã khởi tạo Roles')

  // ===== SEED USERS =====
  const saltRounds = 10
  const hashPassword = await bcrypt.hash('123456aA@', saltRounds)

  const admin = await prisma.user.upsert({
    where: { email_isDeleted: { email: 'admin@greentech.local', isDeleted: false } },
    update: {},
    create: { email: 'admin@greentech.local', password: hashPassword, fullName: 'Super Admin', roleId: 1 },
  })
  const customer = await prisma.user.upsert({
    where: { email_isDeleted: { email: 'customer@greentech.local', isDeleted: false } },
    update: {},
    create: { email: 'customer@greentech.local', password: hashPassword, fullName: 'Alice Customer', roleId: 2 },
  })
  const driver = await prisma.user.upsert({
    where: { email_isDeleted: { email: 'driver@greentech.local', isDeleted: false } },
    update: {},
    create: { email: 'driver@greentech.local', password: hashPassword, fullName: 'Bob Driver', roleId: 3 },
  })
  console.log('✅ Đã tạo Users mẫu (Mật khẩu: 123456aA@)')

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
  ])
  console.log(`✅ Đã tạo ${hubs.length} kho trung chuyển`)

  // ===== SEED HUB STAFF & DRIVERS =====
  const activeHubs = await prisma.hub.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { code: 'asc' },
  })

  const hubAccounts: { hubCode: string; hubName: string; staffEmail: string; driverEmail: string }[] = []
  for (const hub of activeHubs) {
    const emailCode = normalizeEmailCode(hub.code)
    const staffEmail = `staff.${emailCode}@greentech.local`
    const driverEmail = `driver.${emailCode}@greentech.local`

    await prisma.user.upsert({
      where: { email_isDeleted: { email: staffEmail, isDeleted: false } },
      update: {
        fullName: `Staff ${hub.code}`,
        hubId: hub.id,
        roleId: 4,
      },
      create: {
        email: staffEmail,
        password: hashPassword,
        fullName: `Staff ${hub.code}`,
        phone: `091${String(hub.id).padStart(7, '0')}`,
        roleId: 4,
        hubId: hub.id,
      },
    })

    await prisma.user.upsert({
      where: { email_isDeleted: { email: driverEmail, isDeleted: false } },
      update: {
        fullName: `Driver ${hub.code}`,
        hubId: hub.id,
        roleId: 3,
      },
      create: {
        email: driverEmail,
        password: hashPassword,
        fullName: `Driver ${hub.code}`,
        phone: `092${String(hub.id).padStart(7, '0')}`,
        roleId: 3,
        hubId: hub.id,
      },
    })

    hubAccounts.push({
      hubCode: hub.code,
      hubName: hub.name,
      staffEmail,
      driverEmail,
    })
  }

  console.log(`✅ Đã tạo/gán ${hubAccounts.length} staff và ${hubAccounts.length} driver theo Hub`)
  console.table(
    hubAccounts.map((account) => ({
      Hub: account.hubCode,
      Staff: account.staffEmail,
      Driver: account.driverEmail,
      Password: '123456aA@',
    })),
  )

  // ===== SEED VEHICLES =====
  const vehicleData = [
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
      licensePlate: '30A-11113',
      type: 'TRUCK' as const,
      fuelType: 'DIESEL' as const,
      capacityWeight: 5000,
      capacityVolume: 25.0,
      emissionRatePerKm: 250,
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
  ]
  let vehicleCount = 0
  for (const vehicle of vehicleData) {
    await prisma.vehicle.upsert({ where: { licensePlate: vehicle.licensePlate }, update: {}, create: vehicle })
    vehicleCount++
  }
  console.log(`✅ Đã tạo ${vehicleCount} phương tiện`)

  // ===== SEED ORDERS =====
  const orderCount = await prisma.order.count()
  if (orderCount === 0) {
    for (let i = 1; i <= 10; i++) {
      await prisma.order.create({
        data: {
          trackingCode: 'GT-ORD-2026' + i.toString().padStart(4, '0'),
          customerId: customer.id,
          senderName: customer.fullName,
          senderPhone: '0901234567',
          senderAddress: '123 Cầu Giấy, Hà Nội',
          senderLat: 21.033 + Math.random() * 0.01,
          senderLng: 105.8 + Math.random() * 0.01,
          receiverName: 'Receiver Nguyễn Văn A',
          receiverPhone: '0987654321',
          receiverAddress: '456 Hai Bà Trưng, Quận 1, HCM',
          receiverLat: 10.78 + Math.random() * 0.01,
          receiverLng: 106.68 + Math.random() * 0.01,
          totalWeight: 5.5 + i * 0.5,
          totalVolume: 0.1,
          shippingFee: 50000 + i * 2000,
          codAmount: i % 2 === 0 ? 0 : 200000,

          estimatedCo2Saved: 12.5,
          status: 'PENDING',
          items: { create: [{ name: 'Sản phẩm xanh số ' + i, quantity: 1, weight: 5.5 + i * 0.5 }] },
        },
      })
    }
    console.log('✅ Đã tạo 10 Đơn hàng mẫu PENDING')
  }

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
