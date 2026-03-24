import z from 'zod'
import { BrandTranslationSchema } from './share-brand-translation.model'

export const BrandSchema = z.object({
  id: z.number(),
  name: z.string().min(3).max(100),
  logo: z.string().url().max(1000),

  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const BrandIncludeTranslationsSchema = BrandSchema.extend({
  brandTranslations: z.array(BrandTranslationSchema),
})
