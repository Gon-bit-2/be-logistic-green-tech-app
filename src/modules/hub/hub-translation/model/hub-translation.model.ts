import z from 'zod'

export const HubTranslationSchema = z.object({
  id: z.number(),
  hubId: z.number(),
  languageId: z.string(),
  name: z.string(),
  description: z.string(),
  address: z.string(),

  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
})

export const GetHubTranslationParamsSchema = z
  .object({
    hubTranslationId: z.coerce.number().int().positive(),
  })
  .strict()

export const GetHubTranslationDetailSchema = HubTranslationSchema

export const CreateHubTranslationBodySchema = HubTranslationSchema.pick({
  hubId: true,
  languageId: true,
  name: true,
  description: true,
  address: true,
}).strict()

export const UpdateHubTranslationBodySchema = CreateHubTranslationBodySchema
export const DeleteHubTranslationParamsSchema = GetHubTranslationParamsSchema

export type HubTranslationType = z.infer<typeof HubTranslationSchema>
export type GetHubTranslationParamsType = z.infer<typeof GetHubTranslationParamsSchema>
export type GetHubTranslationDetailType = z.infer<typeof GetHubTranslationDetailSchema>
export type CreateHubTranslationBodyType = z.infer<typeof CreateHubTranslationBodySchema>
export type UpdateHubTranslationBodyType = z.infer<typeof UpdateHubTranslationBodySchema>
export type DeleteHubTranslationParamsType = z.infer<typeof DeleteHubTranslationParamsSchema>
