import z from 'zod'
import { PaginationQuerySchema } from 'src/common/model/request.model'

export const HubSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  address: z.string(),
  latitude: z.number(),
  longitude: z.number(),
})

export const CreateHubBodySchema = HubSchema.pick({
  name: true,
  code: true,
  address: true,
  latitude: true,
  longitude: true,
})
  .extend({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict()

export const UpdateHubBodySchema = CreateHubBodySchema.partial()

export const GetAllHubsQuerySchema = PaginationQuerySchema.extend({
  search: z.string().optional(),
})

export const GetAllHubsResSchema = z.object({
  data: z.array(HubSchema),
  totalItems: z.number(),
})

export const AssignStaffBodySchema = z
  .object({
    userId: z.number().int().positive(),
  })
  .strict()

export type HubSchemaType = z.infer<typeof HubSchema>
export type CreateHubBodyType = z.infer<typeof CreateHubBodySchema>
export type UpdateHubBodyType = z.infer<typeof UpdateHubBodySchema>
export type GetAllHubsQueryType = z.infer<typeof GetAllHubsQuerySchema>
export type GetAllHubsResType = z.infer<typeof GetAllHubsResSchema>
export type AssignStaffBodyType = z.infer<typeof AssignStaffBodySchema>
