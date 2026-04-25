import z from 'zod'
import { PaginationQuerySchema } from 'src/common/model/request.model'
import roleName from 'src/common/constants/role.constant'

export const HubSchema = z.object({
  id: z.number(),
  code: z
    .string()
    .min(1, 'Mã kho không được để trống')
    .max(20, 'Mã kho tối đa 20 ký tự')
    .regex(/^[A-Z0-9-]+$/, 'Mã kho chỉ được chứa chữ in hoa, số và dấu gạch ngang (VD: SGN-HUB-01)'),
  name: z.string().min(1, 'Tên kho không được để trống').max(255, 'Tên kho tối đa 255 ký tự'),
  address: z.string().min(1, 'Địa chỉ không được để trống').max(500, 'Địa chỉ tối đa 500 ký tự'),
  latitude: z
    .number({ error: 'Vĩ độ phải là số' })
    .min(-90, 'Vĩ độ phải nằm trong khoảng -90 đến 90')
    .max(90, 'Vĩ độ phải nằm trong khoảng -90 đến 90'),
  longitude: z
    .number({ error: 'Kinh độ phải là số' })
    .min(-180, 'Kinh độ phải nằm trong khoảng -180 đến 180')
    .max(180, 'Kinh độ phải nằm trong khoảng -180 đến 180'),
  imageUrl: z.string().url().nullable().optional(), // URL ảnh đại diện kho (Cloudinary)
})

export const CreateHubBodySchema = HubSchema.pick({
  name: true,
  code: true,
  address: true,
  latitude: true,
  longitude: true,
})
  .extend({
    imageUrl: z.string().url().optional(), // Ảnh không bắt buộc khi tạo hub
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

export const AssignDriverBodySchema = AssignStaffBodySchema

export const GetHubAssignableUsersQuerySchema = z
  .object({
    role: z.enum([roleName.WAREHOUSE_STAFF, roleName.DRIVER]),
    search: z.string().trim().optional(),
  })
  .strict()

export type HubSchemaType = z.infer<typeof HubSchema>
export type CreateHubBodyType = z.infer<typeof CreateHubBodySchema>
export type UpdateHubBodyType = z.infer<typeof UpdateHubBodySchema>
export type GetAllHubsQueryType = z.infer<typeof GetAllHubsQuerySchema>
export type GetAllHubsResType = z.infer<typeof GetAllHubsResSchema>
export type AssignStaffBodyType = z.infer<typeof AssignStaffBodySchema>
export type AssignDriverBodyType = z.infer<typeof AssignDriverBodySchema>
export type GetHubAssignableUsersQueryType = z.infer<typeof GetHubAssignableUsersQuerySchema>
