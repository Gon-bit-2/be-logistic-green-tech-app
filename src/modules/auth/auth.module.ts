import { Module } from '@nestjs/common'
import { AuthService } from 'src/modules/auth/service/auth.service'
import { AuthController } from 'src/modules/auth/controller/auth.controller'

import { GoogleService } from 'src/modules/auth/service/google.service'

import { VerificationCodeRepository } from 'src/modules/auth/repository/verificationCode.repo'
import { EmailService } from 'src/common/services/email.service'
import { TokenService } from 'src/common/services/token.service'
import { HashingService } from 'src/common/services/hashing.service'
import { JwtModule } from '@nestjs/jwt'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import { PrismaService } from 'src/database/prisma.service'
import { AccessTokenGuard } from 'src/common/guards/access-token.guard'
import { ApiKeyGuard } from 'src/common/guards/api-key.guard'
import { PaymentApiKeyGuard } from 'src/common/guards/payment-api-key.guard'
import { AuthenticationGuard } from 'src/common/guards/authentication.guard'
import { AppAccessGuard } from 'src/common/guards/app-access.guard'
import { RolesGuard } from 'src/common/guards/roles.guard'
import { ResourceAccessGuard } from 'src/common/guards/resource-access.guard'
import { RoleRepository } from 'src/modules/role/repository/role.repo'

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleService,
    EmailService,
    TokenService,
    HashingService,
    AuthRepository,
    RoleRepository,
    VerificationCodeRepository,
    PrismaService,
    AccessTokenGuard,
    ApiKeyGuard,
    PaymentApiKeyGuard,
    AuthenticationGuard,
    AppAccessGuard,
    RolesGuard,
    ResourceAccessGuard,
  ],
  exports: [
    TokenService,
    AccessTokenGuard,
    ApiKeyGuard,
    PaymentApiKeyGuard,
    AuthenticationGuard,
    AppAccessGuard,
    RolesGuard,
    ResourceAccessGuard,
  ],
})
export class AuthModule {}
