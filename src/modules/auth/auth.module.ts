import { Module } from '@nestjs/common'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'

import { GoogleService } from './google.service'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import { VerificationCodeRepository } from 'src/modules/auth/repository/verificationCode.repo'
import { SharedRoleRepository } from 'src/common/repositories/shared-role.repo'

@Module({
  controllers: [AuthController],
  providers: [AuthService, GoogleService, AuthRepository, VerificationCodeRepository, SharedRoleRepository],
})
export class AuthModule {}
