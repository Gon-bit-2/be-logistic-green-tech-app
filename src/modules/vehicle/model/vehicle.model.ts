import z from 'zod'
import { FuelType, VehicleType } from 'src/common/constants/vehicle.constant'
import { PaginationQuerySchema } from 'src/common/dtos/request.dto'

export const VehicleSchema = z.object({
  id: z.number(),
  licensePlate: z.string(),
  type: z.enum([VehicleType.VAN, VehicleType.TRUCK, VehicleType.ELECTRIC_VAN, VehicleType.MOTORCYCLE]),
  fuelType: z.enum([FuelType.DIESEL, FuelType.ELECTRIC, FuelType.GASOLINE]),
  capacityWeight: z.number().positive(),
  capacityVolume: z.number().positive(),
  emissionRatePerKm: z.number().positive(),
  imageUrl: z.string().url().nullable(), // URL ảnh đại diện xe (Cloudinary)
  isActive: z.boolean(),
  hubId: z.number().int().positive().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
  deletedById: z.number().nullable(),
  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
})

export const CreateVehicleBodySchema = VehicleSchema.pick({
  licensePlate: true,
  type: true,
  fuelType: true,
  capacityWeight: true,
  capacityVolume: true,
  emissionRatePerKm: true,
  hubId: true,
})
  .extend({
    imageUrl: z.string().url().optional(), // Ảnh không bắt buộc khi tạo xe
  })
  .strict()

export const UpdateVehicleBodySchema = CreateVehicleBodySchema.extend({
  isActive: z.boolean().optional(),
}).partial()

export const GetAllVehiclesQuerySchema = PaginationQuerySchema.extend({
  type: z.enum([VehicleType.VAN, VehicleType.TRUCK, VehicleType.ELECTRIC_VAN, VehicleType.MOTORCYCLE]).optional(),
  fuelType: z.enum([FuelType.DIESEL, FuelType.ELECTRIC, FuelType.GASOLINE]).optional(),
  isActive: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  search: z.string().optional(),
})

export const GetAllVehiclesResSchema = z.object({
  data: z.array(VehicleSchema),
  totalItems: z.number(),
})

export const GetVehicleParamsSchema = z
  .object({
    vehicleId: z.coerce.number().int().positive(),
  })
  .strict()

export const GetVehicleDetailResSchema = VehicleSchema

export type VehicleSchemaType = z.infer<typeof VehicleSchema>
export type GetAllVehiclesResType = z.infer<typeof GetAllVehiclesResSchema>
export type GetAllVehiclesQueryType = z.infer<typeof GetAllVehiclesQuerySchema>
export type GetVehicleParamsType = z.infer<typeof GetVehicleParamsSchema>
export type UpdateVehicleBodyType = z.infer<typeof UpdateVehicleBodySchema>
export type CreateVehicleBodyType = z.infer<typeof CreateVehicleBodySchema>
