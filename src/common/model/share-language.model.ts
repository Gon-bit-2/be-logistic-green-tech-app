import z from 'zod'

export const languageSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
})

export type LanguageType = z.infer<typeof languageSchema>
