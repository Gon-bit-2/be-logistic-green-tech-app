import { Module } from '@nestjs/common'
import { AuthService } from 'src/modules/auth/service/auth.service'
import { AuthAddressBookService } from 'src/modules/auth/service/auth-address-book.service'
import { AuthOtpService } from 'src/modules/auth/service/auth-otp.service'
import { AuthPasswordRecoveryService } from 'src/modules/auth/service/auth-password-recovery.service'
import { AuthProfileService } from 'src/modules/auth/service/auth-profile.service'
import { AuthRegistrationService } from 'src/modules/auth/service/auth-registration.service'
import { AuthSessionService } from 'src/modules/auth/service/auth-session.service'
import { AuthController } from 'src/modules/auth/controller/auth.controller'

import { GoogleService } from 'src/modules/auth/service/google.service'

import { VerificationCodeRepository } from 'src/modules/auth/repository/verificationCode.repo'
import { EmailService } from 'src/common/services/email.service'
import { TokenService } from 'src/common/services/token.service'
import { HashingService } from 'src/common/services/hashing.service'
import { JwtModule } from '@nestjs/jwt'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import { AccessTokenGuard } from 'src/common/guards/access-token.guard'
import { ApiKeyGuard } from 'src/common/guards/api-key.guard'
import { PaymentApiKeyGuard } from 'src/common/guards/payment-api-key.guard'
import { AuthenticationGuard } from 'src/common/guards/authentication.guard'
import { AppAccessGuard } from 'src/common/guards/app-access.guard'
import { RolesGuard } from 'src/common/guards/roles.guard'
import { ResourceAccessGuard } from 'src/common/guards/resource-access.guard'
import { RoleRepository } from 'src/modules/role/repository/role.repo'
import { DatabaseModule } from 'src/database/database.module'

@Module({
  imports: [DatabaseModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthProfileService,
    AuthAddressBookService,
    AuthOtpService,
    AuthRegistrationService,
    AuthSessionService,
    AuthPasswordRecoveryService,
    GoogleService,
    EmailService,
    TokenService,
    HashingService,
    AuthRepository,
    RoleRepository,
    VerificationCodeRepository,
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
