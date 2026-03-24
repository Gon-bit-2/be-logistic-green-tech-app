export const REQUEST_USER_KEY = 'user'
export const REQUEST_ROLE_PERMISSIONS = 'role_permissions'
export const AuthType = {
  Bearer: 'Bearer',
  None: 'None',
  APIKey: 'ApiKey',
  PaymentAPIKey: 'PaymentAPIKey',
} as const
export type AuthTypeType = (typeof AuthType)[keyof typeof AuthType]
export const ConditionGuard = {
  And: 'And',
  Or: 'Or',
} as const
export type ConditionGuardType = (typeof ConditionGuard)[keyof typeof ConditionGuard]
export const UserStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  BLOCKED: 'BLOCKED',
} as const

export const TypeOfVerificationCode = {
  REGISTER: 'REGISTER',
  FORGOT_PASSWORD: 'FORGOT_PASSWORD',
  LOGIN: 'LOGIN',
} as const
export type TypeOfVerificationCodeType = (typeof TypeOfVerificationCode)[keyof typeof TypeOfVerificationCode]
