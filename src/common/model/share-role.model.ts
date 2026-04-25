import z from 'zod'
import { PermissionSchema } from './share-permission.model'

export const RoleSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean().default(true),
  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
})
export const RolePermissionSchema = RoleSchema.extend({
  permissions: z.array(PermissionSchema),
})
export type RoleType = z.infer<typeof RoleSchema>
export type RolePermissionType = z.infer<typeof RolePermissionSchema>
