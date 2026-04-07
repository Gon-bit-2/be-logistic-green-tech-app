import z from 'zod'
import { FuelType, VehicleType } from 'src/common/constants/vehicle.constant'

export const VehicleSchema = z.object({
  id: z.number(),
  licensePlate: z.string(),
  type: z.enum([VehicleType.VAN, VehicleType.TRUCK, VehicleType.ELECTRIC_VAN, VehicleType.MOTORCYCLE]),
  fuelType: z.enum([FuelType.DIESEL, FuelType.ELECTRIC, FuelType.GASOLINE]),
  capacityWeight: z.number().int().positive(),
  capacityVolume: z.number().int().positive(),
  emissionRatePerKm: z.number().int().positive(),
  isActive: z.boolean(),
  hubId: z.number().int().positive().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
  deletedById: z.number().nullable(),
  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
})
export const GetAllVehiclesResSchema = z.object({
  data: z.array(VehicleSchema),
  totalItems: z.number(),
})
export const GetAllVehiclesQuerySchema = z.object({
  type: z.enum([VehicleType.VAN, VehicleType.TRUCK, VehicleType.ELECTRIC_VAN, VehicleType.MOTORCYCLE]).optional(),
  fuelType: z.enum([FuelType.DIESEL, FuelType.ELECTRIC, FuelType.GASOLINE]).optional(),
  isActive: z.boolean().optional(),
})

export const GetVehicleParamsSchema = z
  .object({
    vehicleId: z.coerce.number().int().positive(),
  })
  .strict()

export const CreateVehicleBodySchema = VehicleSchema.pick({
  type: true,
  fuelType: true,
  capacityWeight: true,
  capacityVolume: true,
  emissionRatePerKm: true,
  licensePlate: true,
  hubId: true,
}).strict()
export const UpdateVehicleBodySchema = CreateVehicleBodySchema.partial()

export type VehicleType = z.infer<typeof VehicleSchema>
export type GetAllVehiclesResType = z.infer<typeof GetAllVehiclesResSchema>
export type GetAllVehiclesQueryType = z.infer<typeof GetAllVehiclesQuerySchema>
export type GetVehicleParamsType = z.infer<typeof GetVehicleParamsSchema>
export type UpdateVehicleBodyType = z.infer<typeof UpdateVehicleBodySchema>
export type CreateVehicleBodyType = z.infer<typeof CreateVehicleBodySchema>
