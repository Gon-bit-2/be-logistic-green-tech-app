import { createZodDto } from 'nestjs-zod'
import {
  ApproveRoleRequestBodySchema,
  CreateRoleRequestBodySchema,
  GetRoleRequestsQuerySchema,
  GetRoleRequestsResSchema,
  RejectRoleRequestBodySchema,
  RoleRequestItemSchema,
  RoleRequestParamsSchema,
} from '../model/role.model'

export class CreateRoleRequestBodyDTO extends createZodDto(CreateRoleRequestBodySchema) {}
export class ApproveRoleRequestBodyDTO extends createZodDto(ApproveRoleRequestBodySchema) {}
export class RejectRoleRequestBodyDTO extends createZodDto(RejectRoleRequestBodySchema) {}
export class GetRoleRequestsQueryDTO extends createZodDto(GetRoleRequestsQuerySchema) {}
export class GetRoleRequestsResDTO extends createZodDto(GetRoleRequestsResSchema, { codec: true }) {}
export class RoleRequestItemDTO extends createZodDto(RoleRequestItemSchema, { codec: true }) {}
export class RoleRequestParamsDTO extends createZodDto(RoleRequestParamsSchema) {}
