import z from 'zod'
import roleName from 'src/common/constants/role.constant'
import { HTTPMethod } from 'src/common/constants/role.constant'
import { PaginationQuerySchema } from 'src/common/dtos/request.dto'
import { RoleRequestStatus } from 'src/common/constants/role-request.constant'
import { IsoDateTimeCodec } from 'src/common/utils/date-codec.util'

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
  createdAt: IsoDateTimeCodec,
  updatedById: z.number().nullable(),
  updatedAt: IsoDateTimeCodec,
  deletedById: z.number().nullable(),
  deletedAt: IsoDateTimeCodec.nullable(),
})

export const RoleSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean().default(true),
  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),
  createdAt: IsoDateTimeCodec,
  updatedAt: IsoDateTimeCodec,
  deletedAt: IsoDateTimeCodec.nullable(),
})

export const RolePermissionSchema = RoleSchema.extend({
  permissions: z.array(PermissionSchema),
})

export const RoleRequestTargetRoleSchema = z.enum([roleName.DRIVER, roleName.WAREHOUSE_STAFF])

export const CreateRoleRequestBodySchema = z
  .object({
    targetRoleName: RoleRequestTargetRoleSchema,
    reason: z.string().trim().min(1).max(1000),
    hubId: z.number().int().positive(),
  })
  .strict()

export const ApproveRoleRequestBodySchema = z
  .object({
    reviewNote: z.string().trim().max(1000).optional(),
    hubId: z.number().int().positive().optional(),
  })
  .strict()

export const RejectRoleRequestBodySchema = z
  .object({
    reviewNote: z.string().trim().min(1).max(1000),
  })
  .strict()

export const RoleRequestParamsSchema = z
  .object({
    id: z.coerce.number().int().positive(),
  })
  .strict()

export const GetRoleRequestsQuerySchema = PaginationQuerySchema.extend({
  status: z.enum([RoleRequestStatus.PENDING, RoleRequestStatus.APPROVED, RoleRequestStatus.REJECTED]).optional(),
  targetRoleName: RoleRequestTargetRoleSchema.optional(),
})

export const RoleRequestRequesterSchema = z.object({
  id: z.number().int().positive(),
  fullName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().nullable(),
  hubId: z.number().int().positive().nullable(),
})

export const RoleRequestRoleSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(255),
})

export const RoleRequestAssignedHubSchema = z.object({
  id: z.number().int().positive(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(255),
})

export const RoleRequestItemSchema = z.object({
  id: z.number().int().positive(),
  requesterId: z.number().int().positive(),
  currentRoleId: z.number().int().positive(),
  targetRoleId: z.number().int().positive(),
  reason: z.string().min(1).max(1000),
  status: z.enum([RoleRequestStatus.PENDING, RoleRequestStatus.APPROVED, RoleRequestStatus.REJECTED]),
  reviewNote: z.string().nullable(),
  reviewedById: z.number().int().positive().nullable(),
  reviewedAt: IsoDateTimeCodec.nullable(),
  assignedHubId: z.number().int().positive().nullable(),
  createdAt: IsoDateTimeCodec,
  updatedAt: IsoDateTimeCodec,
  requester: RoleRequestRequesterSchema,
  currentRole: RoleRequestRoleSchema,
  targetRole: RoleRequestRoleSchema,
  assignedHub: RoleRequestAssignedHubSchema.nullable(),
})

export const GetRoleRequestsResSchema = z.object({
  data: z.array(RoleRequestItemSchema),
  totalItems: z.number().int().nonnegative(),
})

export type PermissionType = z.infer<typeof PermissionSchema>
export type RoleType = z.infer<typeof RoleSchema>
export type RolePermissionType = z.infer<typeof RolePermissionSchema>
export type CreateRoleRequestBodyType = z.infer<typeof CreateRoleRequestBodySchema>
export type ApproveRoleRequestBodyType = z.infer<typeof ApproveRoleRequestBodySchema>
export type RejectRoleRequestBodyType = z.infer<typeof RejectRoleRequestBodySchema>
export type GetRoleRequestsQueryType = z.infer<typeof GetRoleRequestsQuerySchema>
