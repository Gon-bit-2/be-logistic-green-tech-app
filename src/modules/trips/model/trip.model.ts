import { STOP_TYPE, TRIP_STATUS } from 'src/common/constants/strip.constant'
import { PaginationQuerySchema } from 'src/common/model/request.model'
import z from 'zod'

export const TripStatusSchema = z.enum([
  TRIP_STATUS.PENDING,
  TRIP_STATUS.IN_PROGRESS,
  TRIP_STATUS.COMPLETED,
  TRIP_STATUS.CANCELLED,
])

export const StopTypeSchema = z.enum([STOP_TYPE.PICKUP, STOP_TYPE.DROPOFF, STOP_TYPE.HUB_TRANSFER])

export const TripStopSchema = z.object({
  id: z.number(),
  tripId: z.number(),
  orderId: z.number().nullable().optional(),
  hubId: z.number().nullable().optional(),
  stopSequence: z.number().int().positive(),
  stopType: StopTypeSchema,
  expectedArrivalTime: z.date().nullable().optional(),
  actualArrivalTime: z.date().nullable().optional(),
})

export const TripSchema = z.object({
  id: z.number(),
  vehicleId: z.number(),
  driverId: z.number(),
  status: TripStatusSchema,
  startTime: z.date().nullable().optional(),
  endTime: z.date().nullable().optional(),
  totalDistance: z.number().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// DTO Response sau khi đã lược bỏ dữ liệu nhạy cảm hoặc join data
export const TripResponseSchema = TripSchema.extend({
  stops: z.array(TripStopSchema).optional(),
})

// Query Params
export const GetTripListQuerySchema = PaginationQuerySchema.extend({
  status: TripStatusSchema.optional(),
  vehicleId: z.coerce.number().optional(),
  driverId: z.coerce.number().optional(),
})

// Response DTOs
export const GetTripListResSchema = z.object({
  data: z.array(TripResponseSchema),
  totalItems: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
})

export const GetTripDetailResSchema = TripResponseSchema

// Auto Dispatch (BullMQ Trigger) Zod Schemas
export const AutoDispatchQuerySchema = z.object({
  hubId: z.coerce.number().int().positive().optional(),
})

export const AutoDispatchResSchema = z.object({
  message: z.string(),
  jobId: z.string(),
})

export const GetTripParamsSchema = z
  .object({
    tripId: z.coerce.number().int().positive(),
  })
  .strict()

// Manual Trip Creation
export const CreateManualTripSchema = z.object({
  vehicleId: z.number().int().positive(),
  driverId: z.number().int().positive(),
  orderIds: z.array(z.number().int().positive()).min(1),
})

// Assign Vehicle
export const AssignVehicleSchema = z.object({
  vehicleId: z.number().int().positive(),
})

// Add Orders
export const AddOrdersToTripSchema = z.object({
  orderIds: z.array(z.number().int().positive()).min(1),
})

// TypeScript types
export type TripType = z.infer<typeof TripSchema>
export type TripStopType = z.infer<typeof TripStopSchema>
export type TripResponseType = z.infer<typeof TripResponseSchema>
export type GetTripListQueryType = z.infer<typeof GetTripListQuerySchema>
export type GetTripListResType = z.infer<typeof GetTripListResSchema>
export type GetTripDetailResType = z.infer<typeof GetTripDetailResSchema>
export type AutoDispatchQueryType = z.infer<typeof AutoDispatchQuerySchema>
export type AutoDispatchResType = z.infer<typeof AutoDispatchResSchema>
export type GetTripParamsType = z.infer<typeof GetTripParamsSchema>
export type CreateManualTripType = z.infer<typeof CreateManualTripSchema>
export type AssignVehicleType = z.infer<typeof AssignVehicleSchema>
export type AddOrdersToTripType = z.infer<typeof AddOrdersToTripSchema>
