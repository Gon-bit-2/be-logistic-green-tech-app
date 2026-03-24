import { createZodDto } from 'nestjs-zod'
import { GetUsserProfileResSchema, UpdateProfileResSchema } from '../model/shared-user.model'

/**
 * Áp dụng cho response của api GET("/profile") và GET("/users/:id")
 */
export class GetUserProfileResDTO extends createZodDto(GetUsserProfileResSchema) {}

/**
 * Áp dụng cho response của api PUT("/profile") và PUT("/users/:id")
 */
export class UpdateUserProfileResDTO extends createZodDto(UpdateProfileResSchema) {}
