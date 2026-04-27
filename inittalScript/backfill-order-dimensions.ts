import { PrismaClient } from '../generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'
import fs from 'node:fs'
import path from 'node:path'
import 'dotenv/config'

type Dimensions = {
  height: number
  length: number
  width: number
}

type OverrideEntry = {
  dimensions: string
  itemId?: number
  orderId?: number
  trackingCode?: string
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

function parseDimensions(value: string): Dimensions | null {
  const normalizedValue = value
    .trim()
    .toLowerCase()
    .replace(/[×*]/g, 'x')
    .replace(/cm|mm|m/g, ' ')

  const parts = (normalizedValue.match(/(\d+(?:[.,]\d+)?)/g) ?? [])
    .map((part) => Number(part.replace(',', '.')))
    .filter((part) => Number.isFinite(part) && part > 0)

  if (parts.length !== 3) {
    return null
  }

  const [length, width, height] = parts
  return { height, length, width }
}

function resolveArg(flag: string) {
  const index = process.argv.findIndex((item) => item === flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function hasFlag(flag: string) {
  return process.argv.includes(flag)
}

function loadOverrides(filePath?: string): OverrideEntry[] {
  if (!filePath) {
    return []
  }

  const absolutePath = path.resolve(process.cwd(), filePath)
  const content = fs.readFileSync(absolutePath, 'utf8')
  const parsed = JSON.parse(content) as OverrideEntry[]
  return Array.isArray(parsed) ? parsed : []
}

function findMatchingOverride(
  overrides: OverrideEntry[],
  order: { id: number; trackingCode: string },
  item: { id: number },
) {
  return overrides.find((entry) => {
    const orderMatched =
      (entry.orderId != null && entry.orderId === order.id) ||
      (entry.trackingCode != null && entry.trackingCode === order.trackingCode)

    if (!orderMatched) {
      return false
    }

    return entry.itemId == null || entry.itemId === item.id
  })
}

async function main() {
  const shouldApply = hasFlag('--apply')
  const limit = Number(resolveArg('--limit') ?? 200)
  const overridePath = resolveArg('--overrides')
  const overrides = loadOverrides(overridePath)

  console.log('🔎 Đang quét đơn hàng thiếu kích thước...')
  if (overridePath) {
    console.log(`📄 Đã nạp file override: ${path.resolve(process.cwd(), overridePath)}`)
  }

  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      items: {
        some: {
          OR: [{ length: null }, { width: null }, { height: null }],
        },
      },
    },
    include: {
      items: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: Number.isFinite(limit) && limit > 0 ? limit : 200,
  })

  const plannedUpdates: Array<{
    itemId: number
    orderId: number
    source: 'auto' | 'override'
    trackingCode: string
    values: Dimensions
  }> = []
  const unresolved: Array<{
    itemId: number
    itemName: string
    orderId: number
    trackingCode: string
  }> = []

  for (const order of orders) {
    for (const item of order.items) {
      if (item.length != null && item.width != null && item.height != null) {
        continue
      }

      const override = findMatchingOverride(overrides, order, item)
      const overrideDimensions = override ? parseDimensions(override.dimensions) : null

      if (override && overrideDimensions) {
        plannedUpdates.push({
          itemId: item.id,
          orderId: order.id,
          source: 'override',
          trackingCode: order.trackingCode,
          values: overrideDimensions,
        })
        continue
      }

      const autoDetectedDimensions = parseDimensions(item.name)
      if (autoDetectedDimensions) {
        plannedUpdates.push({
          itemId: item.id,
          orderId: order.id,
          source: 'auto',
          trackingCode: order.trackingCode,
          values: autoDetectedDimensions,
        })
        continue
      }

      unresolved.push({
        itemId: item.id,
        itemName: item.name,
        orderId: order.id,
        trackingCode: order.trackingCode,
      })
    }
  }

  console.log(`🧾 Tìm thấy ${orders.length} đơn có item thiếu kích thước.`)
  console.log(`✅ Có thể backfill ${plannedUpdates.length} item.`)
  console.log(`⚠️  Còn ${unresolved.length} item cần nhập tay.`)

  if (plannedUpdates.length > 0) {
    console.table(
      plannedUpdates.map((item) => ({
        ItemId: item.itemId,
        OrderId: item.orderId,
        Source: item.source,
        TrackingCode: item.trackingCode,
        Dimensions: `${item.values.length}x${item.values.width}x${item.values.height}`,
      })),
    )
  }

  if (unresolved.length > 0) {
    console.table(
      unresolved.map((item) => ({
        ItemId: item.itemId,
        OrderId: item.orderId,
        TrackingCode: item.trackingCode,
        ItemName: item.itemName,
      })),
    )
    console.log(
      '💡 Với các item unresolved, hãy tạo file JSON theo mẫu backend/inittalScript/order-dimensions.overrides.example.json và chạy lại script với --overrides <path>.',
    )
  }

  if (!shouldApply) {
    console.log('🛑 Dry run hoàn tất. Thêm --apply để ghi dữ liệu xuống DB.')
    return
  }

  if (plannedUpdates.length === 0) {
    console.log('ℹ️ Không có bản ghi nào đủ dữ liệu để backfill.')
    return
  }

  for (const update of plannedUpdates) {
    await prisma.orderItem.update({
      where: { id: update.itemId },
      data: update.values,
    })
  }

  console.log(`🎉 Đã cập nhật ${plannedUpdates.length} item thiếu kích thước.`)
}

main()
  .catch((error) => {
    console.error('❌ Backfill thất bại:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
