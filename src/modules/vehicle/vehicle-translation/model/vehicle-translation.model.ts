import z from 'zod'

export const VehicleTranslationSchema = z.object({
  id: z.number(),
  vehicleId: z.number(),
  languageId: z.string(),
  name: z.string(),
  description: z.string(),

  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
})

export const GetVehicleTranslationParamsSchema = z
  .object({
    vehicleTranslationId: z.coerce.number().int().positive(),
  })
  .strict()

export const GetVehicleTranslationDetailSchema = VehicleTranslationSchema

export const CreateVehicleTranslationBodySchema = VehicleTranslationSchema.pick({
  vehicleId: true,
  languageId: true,
  name: true,
  description: true,
}).strict()

export const UpdateVehicleTranslationBodySchema = CreateVehicleTranslationBodySchema
export const DeleteVehicleTranslationParamsSchema = GetVehicleTranslationParamsSchema
export type VehicleTranslationType = z.infer<typeof VehicleTranslationSchema>
export type GetVehicleTranslationParamsType = z.infer<typeof GetVehicleTranslationParamsSchema>
export type GetVehicleTranslationDetailType = z.infer<typeof GetVehicleTranslationDetailSchema>
export type CreateVehicleTranslationBodyType = z.infer<typeof CreateVehicleTranslationBodySchema>
export type UpdateVehicleTranslationBodyType = z.infer<typeof UpdateVehicleTranslationBodySchema>
export type DeleteVehicleTranslationParamsType = z.infer<typeof DeleteVehicleTranslationParamsSchema>
