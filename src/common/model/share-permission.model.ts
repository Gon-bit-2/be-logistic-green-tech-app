import z from 'zod'
import { HTTPMethod } from '../constants/role.constant'

export const PermissionSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  module: z.string().max(500),
  path: z.string().max(1000),
  method: z.enum([
    HTTPMethod.GET,
    HTTPMethod.POST,
    HTTPMethod.PUT,
    HTTPMethod.DELETE,
    HTTPMethod.PATCH,
    HTTPMethod.OPTIONS,
    HTTPMethod.HEAD,
  ]),
  createdById: z.number().nullable(),
  createdAt: z.date(),
  updatedById: z.number().nullable(),
  updatedAt: z.date(),
  deletedById: z.number().nullable(),
  deletedAt: z.date().nullable(),
})
export type PermissionType = z.infer<typeof PermissionSchema>
