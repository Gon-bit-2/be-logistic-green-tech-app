import z from 'zod'
import { RoleSchema } from './share-role.model'
import { PermissionSchema } from './share-permission.model'

export const UserSchema = z.object({
  id: z.number(),
  email: z.string().email().min(1),
  password: z.string().min(6).max(100).min(1),
  fullName: z.string().min(1).max(100),
  phone: z.string().min(10).max(15).nullable(),
  avatar: z.string().nullable(),
  totpSecret: z.string().nullable(),
  isDeleted: z.boolean(),
  roleId: z.number().positive(),
  hubId: z.number().nullable(),
  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
/**
 * Áp dụng cho response của api GET("/profile")
 */
export const GetUsserProfileResSchema = UserSchema.omit({
  password: true,
  totpSecret: true,
}).extend({
  isTwoFactorEnabled: z.boolean(),
  role: RoleSchema.pick({
    id: true,
    name: true,
  }).extend({
    permissions: z.array(
      PermissionSchema.pick({
        id: true,
        name: true,
        module: true,
        path: true,
        method: true,
      }),
    ),
  }),
})
/**
 * Áp dụng cho response của api PUT("profile") và Put("users/:id")
 */
export const UpdateProfileResSchema = UserSchema.omit({
  password: true,
  totpSecret: true,
}).extend({
  isTwoFactorEnabled: z.boolean(),
})
export type UserType = z.infer<typeof UserSchema>
