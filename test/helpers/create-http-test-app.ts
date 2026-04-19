import { INestApplication, Provider, Type } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod'
import { REQUEST_USER_KEY } from 'src/common/constants/auth.constant'
import roleName from 'src/common/constants/role.constant'
import { AuthenticationGuard } from 'src/common/guards/authentication.guard'
import { RolesGuard } from 'src/common/guards/roles.guard'

type CreateHttpTestAppOptions = {
  controllers: Type<unknown>[]
  providers?: Provider[]
  requestUser?: Record<string, unknown>
  attachRawBody?: boolean
  allowAuth?: boolean
  allowRoles?: boolean
}

const defaultRequestUser = {
  userId: 99,
  deviceId: 10,
  roleId: 1,
  roleName: roleName.ADMIN,
  exp: 9999999999,
  iat: 1,
}

export async function createHttpTestApp({
  controllers,
  providers = [],
  requestUser = defaultRequestUser,
  attachRawBody = false,
  allowAuth = true,
  allowRoles = true,
}: CreateHttpTestAppOptions) {
  const authGuard = { canActivate: jest.fn().mockReturnValue(allowAuth) }
  const rolesGuard = { canActivate: jest.fn().mockReturnValue(allowRoles) }

  const moduleBuilder = Test.createTestingModule({
    controllers,
    providers: [...providers],
  })
    .overrideGuard(AuthenticationGuard)
    .useValue(authGuard)
    .overrideGuard(RolesGuard)
    .useValue(rolesGuard)

  const moduleRef = await moduleBuilder.compile()

  const app = moduleRef.createNestApplication()
  app.use((req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req[REQUEST_USER_KEY] = requestUser
    if (attachRawBody && typeof req.body !== 'undefined') {
      req.rawBody = Buffer.from(JSON.stringify(req.body))
    }
    next()
  })
  app.useGlobalPipes(new ZodValidationPipe())
  app.useGlobalInterceptors(new ZodSerializerInterceptor(app.get(Reflector)))
  await app.init()

  return {
    app: app as INestApplication,
    moduleRef,
    authGuard,
    rolesGuard,
  }
}
