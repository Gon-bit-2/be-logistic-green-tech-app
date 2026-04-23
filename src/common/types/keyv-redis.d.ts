declare module '@keyv/redis' {
  import type Keyv from 'keyv'
  export function createKeyv(uri: string, options?: Record<string, unknown>): Keyv
}
