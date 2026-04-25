import roleName from 'src/common/constants/role.constant'
import { HashingService } from 'src/common/services/hashing.service'
import envConfig from 'src/config/config'
import { PrismaService } from 'src/database/prisma.service'

const prisma = new PrismaService()
const hashingPassword = new HashingService()
const main = async () => {
  const roleCount = await prisma.role.count()
  if (roleCount > 0) {
    throw new Error('Roles Already Exit')
  }
  const roles = await prisma.role.createMany({
    data: [
      {
        name: roleName.ADMIN,
        description: 'Admin Role',
      },
      {
        name: roleName.CUSTOMER,
        description: 'Customer Role',
      },
      {
        name: roleName.DRIVER,
        description: 'Driver Role',
      },
      {
        name: roleName.WAREHOUSE_STAFF,
        description: 'Warehouse Staff Role',
      },
    ],
  })

  const adminRole = await prisma.role.findFirstOrThrow({
    where: {
      name: roleName.ADMIN,
    },
  })
  const adminUser = await prisma.user.create({
    data: {
      email: envConfig.ADMIN_EMAIL,
      password: await hashingPassword.hash(envConfig.ADMIN_PASSWORD),
      fullName: envConfig.ADMIN_NAME,
      phone: envConfig.ADMIN_PHONE_NUMBER,
      roleId: adminRole.id,
    },
  })
  return {
    createRoleCount: roles.count,
    adminUser,
  }
}
main()
  .then(({ adminUser, createRoleCount }) => {
    console.log(`Created ${createRoleCount} roles`)
    console.log(`Created Admin User: ${adminUser.email}`)
  })
  .catch((error) => {
    console.error('Error during initialization:', error)
  })
