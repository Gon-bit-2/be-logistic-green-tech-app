import { Module } from '@nestjs/common'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'

import { GoogleService } from './google.service'

import { VerificationCodeRepository } from 'src/modules/auth/repository/verificationCode.repo'
import { SharedRoleRepository } from 'src/common/repositories/shared-role.repo'
import { EmailService } from 'src/common/services/email.service'
import { TokenService } from 'src/common/services/token.service'
import { HashingService } from 'src/common/services/hashing.service'
import { ShareUserRepository } from 'src/common/repositories/shared-user.repo'
import { JwtModule } from '@nestjs/jwt'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import { PrismaService } from 'src/database/prisma.service'

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
    VerificationCodeRepository,
    SharedRoleRepository,
    ShareUserRepository,
    PrismaService,
  ],
})
export class AuthModule {}
