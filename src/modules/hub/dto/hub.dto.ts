import { createZodDto } from 'nestjs-zod'
import {
  AssignStaffBodySchema,
  AssignDriverBodySchema,
  CreateHubBodySchema,
  GetAllHubsQuerySchema,
  GetAllHubsResSchema,
  GetHubAssignableUsersQuerySchema,
  HubSchema,
  UpdateHubBodySchema,
} from 'src/modules/hub/model/hub.model'

export class CreateHubBodyDTO extends createZodDto(CreateHubBodySchema) {}
export class UpdateHubBodyDTO extends createZodDto(UpdateHubBodySchema) {}
export class GetAllHubsQueryDTO extends createZodDto(GetAllHubsQuerySchema) {}
export class GetAllHubsResDTO extends createZodDto(GetAllHubsResSchema) {}
export class HubDetailResDTO extends createZodDto(HubSchema) {}
export class AssignStaffBodyDTO extends createZodDto(AssignStaffBodySchema) {}
export class AssignDriverBodyDTO extends createZodDto(AssignDriverBodySchema) {}
export class GetHubAssignableUsersQueryDTO extends createZodDto(GetHubAssignableUsersQuerySchema) {}
