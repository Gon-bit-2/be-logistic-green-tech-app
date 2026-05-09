import type { RoleNameType } from '../constants/role.constant'

export interface IAccessTokenPayload {
  userId: number
  deviceId: number
  roleId: number
  roleName: RoleNameType
  hubId?: number | null
}
export interface AccessTokenPayload extends IAccessTokenPayload {
  exp: number
  iat: number
}
export interface IRefreshTokenPayload {
  userId: number
}

export interface RefreshTokenPayload extends IRefreshTokenPayload {
  exp: number
  iat: number
}
