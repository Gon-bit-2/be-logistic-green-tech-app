import z from 'zod'

export const languageSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
})

export const GetLanguageResSchema = z.object({
  data: z.array(languageSchema),
  totalItems: z.number(),
})
export const GetLanguageParamsSchema = z
  .object({
    languageId: z.string().max(10),
  })
  .strict()
export const GetLanguageDetailResSchema = languageSchema
export const CreateLanguageSchema = languageSchema
  .pick({
    id: true,
    name: true,
    code: true,
  })
  .strict()
export const UpdateLanguageSchema = languageSchema
  .pick({
    name: true,
    code: true,
  })
  .strict()
export type GetLanguageResType = z.infer<typeof GetLanguageResSchema>
export type GetLanguageParamsType = z.infer<typeof GetLanguageParamsSchema>
export type GetLanguageDetailResType = z.infer<typeof GetLanguageDetailResSchema>
export type CreateLanguageType = z.infer<typeof CreateLanguageSchema>
export type UpdateLanguageType = z.infer<typeof UpdateLanguageSchema>
export type LanguageType = z.infer<typeof languageSchema>
