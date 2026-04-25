/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// Source - https://stackoverflow.com/a/63333671
// Posted by oviniciusfeitosa, modified by community. See post 'Timeline' for change history
// Retrieved 2025-12-16, License - CC BY-SA 4.0

import { NestFactory } from '@nestjs/core'
import { AppModule } from 'src/app.module'
import { PrismaService } from 'src/database/prisma.service'
import roleName, { HTTPMethod } from 'src/common/constants/role.constant'
import { createClient } from 'redis'
import envConfig from 'src/config/config'

const DriverModule = [
  'AUTH',
  'VEHICLES',
  'TRIPS',
  'ORDERS',
  'TRACKING-EVENTS',
  'PAYMENTS',
  'LANGUAGE',
  'ROLE-REQUESTS',
  'NOTIFICATIONS',
  'MAPS',
  'WALLET',
  'GAMIFICATION',
]

const CustomerModule = [
  'AUTH',
  'ORDERS',
  'TRACKING-EVENTS',
  'TRACKING',
  'TRIPS',
  'HUBS',
  'PAYMENTS',
  'LANGUAGE',
  'ROLE-REQUESTS',
  'NOTIFICATIONS',
  'MAPS',
  'GAMIFICATION',
]

const WarehouseStaffModule = [
  'AUTH',
  'HUBS',
  'ORDERS',
  'TRACKING-EVENTS',
  'VEHICLE',
  'ANALYTICS',
  'GREEN-TECH',
  'LANGUAGE',
  'ROLE-REQUESTS',
  'NOTIFICATIONS',
  'MAPS',
  'WALLET',
  'TRIPS',
  'GAMIFICATION',
]

const prisma = new PrismaService()
async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  await app.listen(3001)
  const server = app.getHttpAdapter().getInstance()

  const router = server.router
  const permissionInDb = await prisma.permission.findMany({
    where: {
      deletedAt: null,
    },
  })
  const availableRoutes: { path: string; method: keyof typeof HTTPMethod; name: string; module: string }[] =
    router.stack
      .map((layer) => {
        if (layer.route) {
          const path = layer.route.path
          const method = layer.route.stack[0].method.toUpperCase() as keyof typeof HTTPMethod
          const moduleName = path.split('/')[1].toUpperCase()
          return {
            path,
            method,
            name: `${method} ${path}`,
            module: moduleName,
          }
        }
      })

      .filter((item) => item !== undefined && HTTPMethod[item.method])
  console.log(availableRoutes)

  //tạo obj permissionInDbMap với key là [method-path]
  const permissionInDbMap: Record<string, (typeof permissionInDb)[0]> = permissionInDb.reduce((acc, item) => {
    acc[`${item.method}-${item.path}`] = item
    return acc
  }, {})
  //tạo obj availableRoutesMap với key là [method-path]
  const availableRoutesMap: Record<string, (typeof availableRoutes)[0]> = availableRoutes.reduce((acc, item) => {
    acc[`${item.method}-${item.path}`] = item
    return acc
  }, {})

  //tìm permissionInDbMap không có trong availableRoutesMap
  const permissionToDelete = permissionInDb.filter((item) => !availableRoutesMap[`${item.method}-${item.path}`])

  //xóa permission không tồn tại trong availableRoutes
  if (permissionToDelete.length > 0) {
    const deleteResult = await prisma.permission.deleteMany({
      where: {
        id: {
          in: permissionToDelete.map((item) => item.id),
        },
      },
    })
    console.log('Deleted permission count:', deleteResult.count)
  } else {
    console.log('No permission to delete')
  }

  //tìm ruotes mà không tồn tại trong permissionInDb
  const permissionToCreate = availableRoutes.filter((item) => !permissionInDbMap[`${item.method}-${item.path}`]) as any

  //thêm các route vào permission db
  if (permissionToCreate.length > 0) {
    const createResult = await prisma.permission.createMany({
      data: permissionToCreate as any,
      skipDuplicates: true,
    })
    console.log('Created permission count:', createResult.count)
  } else {
    console.log('No permission to create')
  }
  // lấy lại permission trong database
  const updatedPermissionInDb = await prisma.permission.findMany({
    where: {
      deletedAt: null,
    },
  })
  const adminPermissionIds = updatedPermissionInDb.map((item) => ({
    id: item.id,
  }))
  // Lọc danh sách các quyền (permissions) từ database dựa trên các module được phép truy cập
  const driverPermissionIds = updatedPermissionInDb
    .filter((item) => DriverModule.includes(item.module.toUpperCase()))
    .map((item) => ({ id: item.id }))

  const customerPermissionIds = updatedPermissionInDb
    .filter((item) => CustomerModule.includes(item.module.toUpperCase()))
    .map((item) => ({ id: item.id }))

  const warehouseStaffPermissionIds = updatedPermissionInDb
    .filter((item) => WarehouseStaffModule.includes(item.module.toUpperCase()))
    .map((item) => ({ id: item.id }))

  await Promise.all([
    updateRole(adminPermissionIds, roleName.ADMIN),
    updateRole(driverPermissionIds, roleName.DRIVER),
    updateRole(customerPermissionIds, roleName.CUSTOMER),
    updateRole(warehouseStaffPermissionIds, roleName.WAREHOUSE_STAFF),
  ])

  // Clear cached role permissions in Redis
  const redisClient = createClient({
    username: envConfig.REDIS_USERNAME,
    password: envConfig.REDIS_PASSWORD,
    socket: {
      host: envConfig.REDIS_HOST,
      port: envConfig.REDIS_PORT,
    },
  })
  await redisClient.connect()
  const keys = await redisClient.keys('*roleId:*')
  if (keys.length > 0) {
    await redisClient.del(keys)
    console.log('Cleared cached role permissions:', keys)
  } else {
    console.log('No cached role permissions to clear')
  }
  await redisClient.disconnect()

  process.exit(0)
}
const updateRole = async (permissionIds: { id: number }[], roleName: string) => {
  //cập nhập permission trong admin role
  const role = await prisma.role.findFirstOrThrow({
    where: {
      name: roleName,
      deletedAt: null,
    },
  })
  console.log(`Updated Role: ${role.name}, ID: ${role.id}`)
  await prisma.role.update({
    where: {
      id: role.id,
    },
    data: {
      permissions: {
        set: permissionIds,
      },
    },
  })
}
bootstrap().catch((error) => {
  console.error('Error during bootstrap:', error)
  process.exit(1)
})
