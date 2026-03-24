import { SetMetadata } from '@nestjs/common'
import { AuthType, ConditionGuard, ConditionGuardType } from 'src/common/constants/auth.constant'
import { TAuthType } from 'src/common/decorators/custom-validator.decorator'

export const AUTH_TYPE_KEY = 'authType'

export type AuthTypeDecoratorPayload = { authTypes: TAuthType[]; options: { condition: ConditionGuardType } }
export const Auth = (authTypes: TAuthType, options?: { condition: ConditionGuardType }) => {
  return SetMetadata(AUTH_TYPE_KEY, { authTypes, options: options ?? { condition: ConditionGuard.And } })
}

/**
 * 'Pass Authentication'
 * @returns true
 */
export const isPublic = () => Auth(AuthType.None)
