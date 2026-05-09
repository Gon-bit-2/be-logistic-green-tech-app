import { z } from 'zod'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import {
  TRACKING_EVENT_TYPE,
  EVENT_SOURCE,
  FAILURE_REASON_CODE,
  PACKAGE_CONDITION,
  PROOF_IMAGE_TYPE,
} from 'src/common/constants/tracking.constant'

// ===== Enum Schemas =====

export const TrackingEventTypeSchema = z.enum([
  TRACKING_EVENT_TYPE.STATUS_CHANGE,
  TRACKING_EVENT_TYPE.SCAN,
  TRACKING_EVENT_TYPE.NOTE,
  TRACKING_EVENT_TYPE.POD,
  TRACKING_EVENT_TYPE.EXCEPTION,
  TRACKING_EVENT_TYPE.ETA_UPDATE,
])

export const EventSourceSchema = z.enum([
  EVENT_SOURCE.DRIVER_APP,
  EVENT_SOURCE.HUB_SCANNER,
  EVENT_SOURCE.SYSTEM,
  EVENT_SOURCE.ADMIN_PORTAL,
  EVENT_SOURCE.CUSTOMER_APP,
])

export const OrderStatusSchema = z.enum([
  ORDER_STATUS.PENDING,
  ORDER_STATUS.ASSIGNED,
  ORDER_STATUS.PICKED_UP,
  ORDER_STATUS.IN_TRANSIT,
  ORDER_STATUS.ARRIVED_AT_HUB,
  ORDER_STATUS.OUT_FOR_DELIVERY,
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.CANCELLED,
])

export const FailureReasonCodeSchema = z.enum([
  FAILURE_REASON_CODE.CUSTOMER_NOT_AVAILABLE,
  FAILURE_REASON_CODE.INCORRECT_ADDRESS,
  FAILURE_REASON_CODE.REFUSED_BY_CUSTOMER,
  FAILURE_REASON_CODE.BUSINESS_CLOSED,
  FAILURE_REASON_CODE.INACCESSIBLE_LOCATION,
  FAILURE_REASON_CODE.PACKAGE_DAMAGED,
  FAILURE_REASON_CODE.WEATHER_DELAY,
  FAILURE_REASON_CODE.VEHICLE_BREAKDOWN,
  FAILURE_REASON_CODE.OTHER,
])

export const PackageConditionSchema = z.enum([
  PACKAGE_CONDITION.INTACT,
  PACKAGE_CONDITION.DAMAGED,
  PACKAGE_CONDITION.PARTIAL,
])

export const ProofImageTypeSchema = z.enum([
  PROOF_IMAGE_TYPE.PACKAGE,
  PROOF_IMAGE_TYPE.SIGNATURE,
  PROOF_IMAGE_TYPE.DELIVERY_LOCATION,
  PROOF_IMAGE_TYPE.DAMAGE_EVIDENCE,
  PROOF_IMAGE_TYPE.FAILED_ATTEMPT,
])

// ===== POD Schemas =====

export const ProofImageInputSchema = z.object({
  url: z.string().url('URL ảnh không hợp lệ'),
  type: ProofImageTypeSchema,
})

export const ProofOfDeliveryInputSchema = z.object({
  receiverName: z.string().min(1, 'Tên người nhận không được để trống'),
  receiverRelation: z.string().optional(),
  packageCondition: PackageConditionSchema.default(PACKAGE_CONDITION.INTACT),
  deliveryNote: z.string().optional(),
  images: z.array(ProofImageInputSchema).min(1, 'POD phải có ít nhất 1 ảnh'),
})

// ===== Create Tracking Event Schema =====

export const CreateTrackingEventSchema = z
  .object({
    orderId: z.number().int().positive('Order ID phải là số dương'),
    eventType: TrackingEventTypeSchema,
    status: OrderStatusSchema.optional(),
    source: EventSourceSchema,

    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    location: z.string().optional(),

    description: z.string().optional(),

    failureReasonCode: FailureReasonCodeSchema.optional(),
    attemptNumber: z.number().int().min(1).max(5).optional(),

    occurredAt: z.coerce.date().optional(),

    pod: ProofOfDeliveryInputSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.eventType === TRACKING_EVENT_TYPE.STATUS_CHANGE && !data.status) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Phải có status khi eventType là STATUS_CHANGE',
        path: ['status'],
      })
    }

    if (data.eventType === TRACKING_EVENT_TYPE.EXCEPTION && !data.failureReasonCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Phải có failureReasonCode khi eventType là EXCEPTION',
        path: ['failureReasonCode'],
      })
    }

    if (data.status === ORDER_STATUS.DELIVERED && !data.pod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Phải cung cấp Proof of Delivery (POD) khi giao thành công',
        path: ['pod'],
      })
    }
  })

// ===== Query Schemas =====

export const GetTrackingTimelineQuerySchema = z.object({
  orderId: z.coerce.number().int().positive(),
})

export const GetPublicTrackingParamsSchema = z.object({
  trackingCode: z.string().min(1),
})

// ===== Response Schemas =====

export const ProofImageResponseSchema = z.object({
  id: z.number(),
  url: z.string(),
  type: ProofImageTypeSchema,
})

export const ProofOfDeliveryResponseSchema = z.object({
  id: z.number(),
  receiverName: z.string(),
  receiverRelation: z.string().nullable(),
  packageCondition: PackageConditionSchema,
  deliveryNote: z.string().nullable(),
  images: z.array(ProofImageResponseSchema),
})

export const TrackingEventResponseSchema = z.object({
  id: z.number(),
  orderId: z.number(),
  eventType: TrackingEventTypeSchema,
  status: OrderStatusSchema.nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  source: EventSourceSchema,
  failureReasonCode: FailureReasonCodeSchema.nullable(),
  attemptNumber: z.number().nullable(),
  occurredAt: z.date(),
  recordedAt: z.date(),
  createdById: z.number().nullable(),
  pod: ProofOfDeliveryResponseSchema.nullable().optional(),
})

export const TrackingTimelineResponseSchema = z.object({
  trackingCode: z.string(),
  currentStatus: OrderStatusSchema,
  eta: z
    .object({
      actualArrivalTime: z.date().nullable(),
      expectedArrivalTime: z.date(),
      tripId: z.number(),
    })
    .nullable()
    .optional(),
  events: z.array(TrackingEventResponseSchema),
})

export const PublicTrackingEventResponseSchema = z.object({
  id: z.number(),
  eventType: TrackingEventTypeSchema,
  status: OrderStatusSchema.nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  occurredAt: z.date(),
  pod: z
    .object({
      receiverName: z.string(),
      packageCondition: PackageConditionSchema,
      images: z.array(
        z.object({
          url: z.string(),
          type: ProofImageTypeSchema,
        }),
      ),
    })
    .nullable(),
})

export const PublicTrackingTimelineResponseSchema = TrackingTimelineResponseSchema.omit({ events: true }).extend({
  events: z.array(PublicTrackingEventResponseSchema),
})

export type CreateTrackingEventType = z.infer<typeof CreateTrackingEventSchema>
export type GetTrackingTimelineQueryType = z.infer<typeof GetTrackingTimelineQuerySchema>
export type GetPublicTrackingParamsType = z.infer<typeof GetPublicTrackingParamsSchema>
export type TrackingEventResponseType = z.infer<typeof TrackingEventResponseSchema>
export type TrackingTimelineResponseType = z.infer<typeof TrackingTimelineResponseSchema>
export type PublicTrackingTimelineResponseType = z.infer<typeof PublicTrackingTimelineResponseSchema>
export type ProofOfDeliveryInputType = z.infer<typeof ProofOfDeliveryInputSchema>
