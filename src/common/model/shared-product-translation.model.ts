import z from 'zod'

export const ProductTranslationSchema = z.object({
  id: z.number(),
  productId: z.number(),
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

export type ProductTranslationType = z.infer<typeof ProductTranslationSchema>
