import { STOP_TYPE, TRIP_STATUS } from 'src/common/constants/trip.constant'
import { PaginationQuerySchema } from 'src/common/dtos/request.dto'
import { IsoDateTimeCodec } from 'src/common/utils/date-codec.util'
import { DecimalNumberSchema } from 'src/common/utils/decimal.util'
import { ProofOfDeliveryInputSchema } from 'src/modules/tracking/model/tracking.model'
import { DriverAssignmentRequestStatus } from 'src/common/constants/driver-assignment-request.constant'
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
  expectedArrivalTime: IsoDateTimeCodec.nullable().optional(),
  actualArrivalTime: IsoDateTimeCodec.nullable().optional(),
})

export const TripSchema = z.object({
  id: z.number(),
  vehicleId: z.number(),
  driverId: z.number(),
  status: TripStatusSchema,
  startTime: IsoDateTimeCodec.nullable().optional(),
  endTime: IsoDateTimeCodec.nullable().optional(),
  totalDistance: z.number().nullable().optional(),
  createdAt: IsoDateTimeCodec,
  updatedAt: IsoDateTimeCodec,
})

// DTO Response sau khi đã lược bỏ dữ liệu nhạy cảm hoặc join data
export const TripResponseSchema = TripSchema.extend({
  stops: z.array(TripStopSchema.passthrough()).optional(),
  driver: z
    .object({
      avatar: z.string().nullable().optional(),
      fullName: z.string(),
      id: z.number().int().positive(),
    })
    .passthrough()
    .optional(),
  driverName: z.string().optional(),
  orderCount: z.number().int().nonnegative().optional(),
  vehicle: z
    .object({
      hubId: z.number().int().positive().nullable().optional(),
      id: z.number().int().positive(),
      isActive: z.boolean().optional(),
      licensePlate: z.string(),
      type: z.string().optional(),
    })
    .passthrough()
    .optional(),
  vehicleLicensePlate: z.string().optional(),
}).passthrough()

// Query Params
export const GetTripListQuerySchema = PaginationQuerySchema.extend({
  status: TripStatusSchema.optional(),
  vehicleId: z.coerce.number().optional(),
  driverId: z.coerce.number().optional(),
  hubId: z.coerce.number().int().positive().optional(),
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
  hubId: z.number().int().positive().optional(),
  vehicleId: z.number().int().positive(),
  driverId: z.number().int().positive(),
  orderIds: z.array(z.number().int().positive()).min(1),
})

// Assign Vehicle
export const AssignVehicleSchema = z.object({
  vehicleId: z.number().int().positive(),
  driverId: z.number().int().positive().optional(),
})

// Add Orders
export const AddOrdersToTripSchema = z.object({
  orderIds: z.array(z.number().int().positive()).min(1),
})

export const DispatchPreviewQuerySchema = z.object({
  hubId: z.coerce.number().int().positive().optional(),
})

export const DispatchBoardQuerySchema = z.object({
  driversLimit: z.coerce.number().int().positive().max(500).default(200),
  hubId: z.coerce.number().int().positive().optional(),
  ordersLimit: z.coerce.number().int().positive().max(500).default(100),
  pendingTripsLimit: z.coerce.number().int().positive().max(200).default(50),
  vehiclesLimit: z.coerce.number().int().positive().max(500).default(200),
})

export const DriverDispatchBoardQuerySchema = z.object({
  assignableOrdersLimit: z.coerce.number().int().positive().max(500).default(100),
  requestsLimit: z.coerce.number().int().positive().max(100).default(12),
})

const DispatchBoardOrderSchema = z.object({
  id: z.number().int().positive(),
  trackingCode: z.string().nullable().optional(),
  receiverName: z.string().nullable().optional(),
  receiverAddress: z.string().nullable().optional(),
  senderAddress: z.string().nullable().optional(),
  status: z.string(),
  totalVolume: DecimalNumberSchema,
  totalWeight: DecimalNumberSchema,
})

const DispatchBoardDriverSchema = z.object({
  activeTripId: z.number().int().positive().nullable().optional(),
  activeTripStatus: TripStatusSchema.nullable().optional(),
  fullName: z.string(),
  id: z.number().int().positive(),
  isAvailable: z.boolean(),
  phone: z.string().nullable().optional(),
})

const DispatchBoardVehicleSchema = z.object({
  activeTripId: z.number().int().positive().nullable().optional(),
  activeTripStatus: TripStatusSchema.nullable().optional(),
  capacityVolume: DecimalNumberSchema,
  capacityWeight: DecimalNumberSchema,
  id: z.number().int().positive(),
  isAvailable: z.boolean(),
  licensePlate: z.string(),
  type: z.string(),
})

const DispatchBoardPendingTripSchema = z.object({
  driverId: z.number().int().positive(),
  driverName: z.string(),
  id: z.number().int().positive(),
  orderCount: z.number().int().nonnegative(),
  orderIds: z.array(z.number().int().positive()),
  orders: z.array(DispatchBoardOrderSchema),
  remainingVolume: z.number(),
  remainingWeight: z.number(),
  status: TripStatusSchema,
  totalAssignedVolume: z.number(),
  totalAssignedWeight: z.number(),
  vehicleId: z.number().int().positive(),
  vehicleLicensePlate: z.string(),
})

const DriverAssignmentRequestStatusSchema = z.enum([
  DriverAssignmentRequestStatus.PENDING,
  DriverAssignmentRequestStatus.APPROVED,
  DriverAssignmentRequestStatus.REJECTED,
  DriverAssignmentRequestStatus.CANCELLED,
])

const DriverAssignmentTripSummarySchema = z.object({
  id: z.number().int().positive(),
  status: TripStatusSchema,
  vehicleId: z.number().int().positive(),
  vehicleLicensePlate: z.string(),
})

const DriverAssignmentRequestSchema = z.object({
  id: z.number().int().positive(),
  orderId: z.number().int().positive(),
  orderTrackingCode: z.string(),
  driverId: z.number().int().positive(),
  driverName: z.string(),
  hubId: z.number().int().positive(),
  reviewNote: z.string().nullable().optional(),
  reviewedAt: IsoDateTimeCodec.nullable().optional(),
  reviewedById: z.number().int().positive().nullable().optional(),
  status: DriverAssignmentRequestStatusSchema,
  createdAt: IsoDateTimeCodec,
  trip: DriverAssignmentTripSummarySchema.nullable().optional(),
})

const DriverAssignableOrderSchema = z.object({
  id: z.number().int().positive(),
  preferredDeliveryTimeEnd: IsoDateTimeCodec.nullable().optional(),
  preferredDeliveryTimeStart: IsoDateTimeCodec.nullable().optional(),
  receiverAddress: z.string().nullable().optional(),
  receiverLat: z.number().nullable().optional(),
  receiverLng: z.number().nullable().optional(),
  receiverName: z.string().nullable().optional(),
  receiverPhone: z.string().nullable().optional(),
  request: DriverAssignmentRequestSchema.nullable().optional(),
  senderAddress: z.string().nullable().optional(),
  senderLat: z.number().nullable().optional(),
  senderLng: z.number().nullable().optional(),
  status: z.string(),
  totalVolume: DecimalNumberSchema,
  totalWeight: DecimalNumberSchema,
  trackingCode: z.string().nullable().optional(),
})

export const DriverDispatchBoardResSchema = z.object({
  activeTrip: DriverAssignmentTripSummarySchema.nullable(),
  assignableOrders: z.array(DriverAssignableOrderSchema),
  hasMore: z
    .object({
      assignableOrders: z.boolean(),
      requests: z.boolean(),
    })
    .optional(),
  hubId: z.number().int().positive().nullable(),
  limits: DriverDispatchBoardQuerySchema.optional(),
  requests: z.array(DriverAssignmentRequestSchema),
  summary: z.object({
    activeTripCount: z.number().int().nonnegative(),
    assignableOrderCount: z.number().int().nonnegative(),
    completedTripCount: z.number().int().nonnegative(),
    inProgressTripCount: z.number().int().nonnegative(),
    pendingRequestCount: z.number().int().nonnegative(),
  }),
})

export const DriverAssignmentRequestListResSchema = z.object({
  data: z.array(DriverAssignmentRequestSchema),
  totalItems: z.number().int().nonnegative(),
})

export const AssignmentRequestInboxItemSchema = DriverAssignmentRequestSchema.extend({
  order: z.object({
    id: z.number().int().positive(),
    receiverAddress: z.string().nullable().optional(),
    receiverName: z.string().nullable().optional(),
    senderAddress: z.string().nullable().optional(),
    status: z.string(),
    totalVolume: z.number(),
    totalWeight: z.number(),
    trackingCode: z.string().nullable().optional(),
  }),
  pendingTripsForDriver: z.array(DriverAssignmentTripSummarySchema),
})

export const AssignmentRequestInboxResSchema = z.object({
  data: z.array(AssignmentRequestInboxItemSchema),
  totalItems: z.number().int().nonnegative(),
})

export const DispatchBoardResSchema = z.object({
  dispatchableOrders: z.array(DispatchBoardOrderSchema),
  drivers: z.array(DispatchBoardDriverSchema),
  hasMore: z
    .object({
      dispatchableOrders: z.boolean(),
      drivers: z.boolean(),
      pendingTrips: z.boolean(),
      vehicles: z.boolean(),
    })
    .optional(),
  hubId: z.number().int().positive(),
  limits: DispatchBoardQuerySchema.omit({ hubId: true }).optional(),
  pendingTrips: z.array(DispatchBoardPendingTripSchema),
  summary: z.object({
    availableDriverCount: z.number().int().nonnegative(),
    availableVehicleCount: z.number().int().nonnegative(),
    dispatchableOrderCount: z.number().int().nonnegative(),
    dispatchableVolume: z.number(),
    dispatchableWeight: z.number(),
    pendingTripCount: z.number().int().nonnegative(),
  }),
  vehicles: z.array(DispatchBoardVehicleSchema),
})

export const DispatchApproveStopSchema = z.object({
  orderId: z.number().int().positive().nullable().optional(),
  hubId: z.number().int().positive().nullable().optional(),
  stopSequence: z.number().int().positive(),
  stopType: StopTypeSchema,
  expectedArrivalTime: IsoDateTimeCodec.nullable().optional(),
  actualArrivalTime: IsoDateTimeCodec.nullable().optional(),
})

export const DispatchApproveSchema = z.object({
  hubId: z.number().int().positive(),
  vehicleId: z.number().int().positive(),
  driverId: z.number().int().positive(),
  orderIds: z.array(z.number().int().positive()).min(1),
  stops: z.array(DispatchApproveStopSchema).min(1).optional(),
})

export const CreateDriverAssignmentRequestSchema = z.object({
  orderId: z.number().int().positive(),
})

export const ApproveDriverAssignmentRequestSchema = z
  .object({
    tripId: z.number().int().positive().optional(),
    vehicleId: z.number().int().positive().optional(),
  })
  .refine((value) => value.tripId != null || value.vehicleId != null, {
    message: 'Cần chọn chuyến chờ hoặc xe để tạo chuyến mới',
    path: ['tripId'],
  })

export const RejectDriverAssignmentRequestSchema = z.object({
  reviewNote: z.string().trim().min(1).max(1000),
})

export const UpdateTripStatusSchema = z.object({
  status: TripStatusSchema,
  podByOrderId: z.record(z.string(), ProofOfDeliveryInputSchema).optional(),
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
export type DispatchPreviewQueryType = z.infer<typeof DispatchPreviewQuerySchema>
export type DispatchBoardQueryType = z.infer<typeof DispatchBoardQuerySchema>
export type DriverDispatchBoardQueryType = z.infer<typeof DriverDispatchBoardQuerySchema>
export type DispatchBoardResType = z.infer<typeof DispatchBoardResSchema>
export type DispatchApproveType = z.infer<typeof DispatchApproveSchema>
export type UpdateTripStatusType = z.infer<typeof UpdateTripStatusSchema>
export type DriverDispatchBoardResType = z.infer<typeof DriverDispatchBoardResSchema>
export type DriverAssignmentRequestResType = z.infer<typeof DriverAssignmentRequestSchema>
export type DriverAssignmentRequestListResType = z.infer<typeof DriverAssignmentRequestListResSchema>
export type AssignmentRequestInboxItemType = z.infer<typeof AssignmentRequestInboxItemSchema>
export type AssignmentRequestInboxResType = z.infer<typeof AssignmentRequestInboxResSchema>
export type CreateDriverAssignmentRequestType = z.infer<typeof CreateDriverAssignmentRequestSchema>
export type ApproveDriverAssignmentRequestType = z.infer<typeof ApproveDriverAssignmentRequestSchema>
export type RejectDriverAssignmentRequestType = z.infer<typeof RejectDriverAssignmentRequestSchema>

// Aliases cho sub-services (backward-compatible)
export type ManualCreateTripType = CreateManualTripType
export type GetTripsQueryType = GetTripListQueryType
export type ReassignTripVehicleType = AssignVehicleType
export type CancelTripBodyType = { reason?: string }
