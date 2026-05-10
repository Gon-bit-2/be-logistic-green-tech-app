import { createZodDto } from 'nestjs-zod'
import {
  AutoDispatchQuerySchema,
  AutoDispatchResSchema,
  GetTripDetailResSchema,
  GetTripListQuerySchema,
  GetTripListResSchema,
  GetTripParamsSchema,
  CreateManualTripSchema,
  AssignVehicleSchema,
  AddOrdersToTripSchema,
  ApproveDriverAssignmentRequestSchema,
  AssignmentRequestInboxResSchema,
  CreateDriverAssignmentRequestSchema,
  DispatchApproveSchema,
  DispatchBoardQuerySchema,
  DispatchBoardResSchema,
  DispatchPreviewQuerySchema,
  DriverDispatchBoardQuerySchema,
  DriverAssignmentRequestListResSchema,
  DriverDispatchBoardResSchema,
  RejectDriverAssignmentRequestSchema,
  UpdateTripStatusSchema,
} from '../model/trip.model'

export class GetTripListDto extends createZodDto(GetTripListQuerySchema) {}
export class GetTripListResDto extends createZodDto(GetTripListResSchema, { codec: true }) {}
export class GetTripDetailResDto extends createZodDto(GetTripDetailResSchema, { codec: true }) {}
export class AutoDispatchQueryDto extends createZodDto(AutoDispatchQuerySchema) {}
export class AutoDispatchResDto extends createZodDto(AutoDispatchResSchema) {}
export class GetTripParamsDto extends createZodDto(GetTripParamsSchema) {}
export class CreateManualTripDto extends createZodDto(CreateManualTripSchema) {}
export class AssignVehicleDto extends createZodDto(AssignVehicleSchema) {}
export class AddOrdersToTripDto extends createZodDto(AddOrdersToTripSchema) {}
export class DispatchPreviewQueryDto extends createZodDto(DispatchPreviewQuerySchema) {}
export class DispatchBoardQueryDto extends createZodDto(DispatchBoardQuerySchema) {}
export class DriverDispatchBoardQueryDto extends createZodDto(DriverDispatchBoardQuerySchema) {}
export class DispatchBoardResDto extends createZodDto(DispatchBoardResSchema, { codec: true }) {}
export class DispatchApproveDto extends createZodDto(DispatchApproveSchema, { codec: true }) {}
export class UpdateTripStatusDto extends createZodDto(UpdateTripStatusSchema) {}
export class DriverDispatchBoardResDto extends createZodDto(DriverDispatchBoardResSchema, { codec: true }) {}
export class DriverAssignmentRequestListResDto extends createZodDto(DriverAssignmentRequestListResSchema, { codec: true }) {}
export class AssignmentRequestInboxResDto extends createZodDto(AssignmentRequestInboxResSchema, { codec: true }) {}
export class CreateDriverAssignmentRequestDto extends createZodDto(CreateDriverAssignmentRequestSchema) {}
export class ApproveDriverAssignmentRequestDto extends createZodDto(ApproveDriverAssignmentRequestSchema) {}
export class RejectDriverAssignmentRequestDto extends createZodDto(RejectDriverAssignmentRequestSchema) {}
