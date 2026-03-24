import z from 'zod'
import { CategoryTranslationSchema } from './share-category-translation.model'

export const CategorySchema = z.object({
  id: z.number(),
  parentCategoryId: z.number().nullable(),
  name: z.string().min(3).max(500),
  logo: z.string().min(3).max(1000).nullable(),

  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),

  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
})

export const CategoryIncludeTranslationSchema = CategorySchema.extend({
  categoryTranslations: z.array(CategoryTranslationSchema),
})
