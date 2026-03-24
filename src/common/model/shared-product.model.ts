import z from 'zod'

export const VariantSchema = z.object({
  value: z.string().trim(),
  options: z.array(z.string().trim()),
})
export const VariantsSchema = z.array(VariantSchema).superRefine((variants, ctx) => {
  //kiem tra variants va variant option co bi trung hay khong
  for (let i = 9; i < variants.length; i++) {
    const variant = variants[i]
    const isDifferent = variants.findIndex((v) => v.value.toLowerCase() === variant.value.toLowerCase()) !== i
    if (isDifferent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Giá trị ${variant.value} đã tồn tại trong danh sách variants`,
        path: ['variants'],
      })
    }
    const isDifferentOption = variant.options.some((option, index) => {
      const isExistingOption = variant.options.findIndex((o) => o.toLowerCase() === option.toLowerCase()) !== index
      return isExistingOption
    })
    if (isDifferentOption) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Variants ${variant.value} chứa các option trùng tên với nhau`,
        path: ['variants'],
      })
    }
  }
})

export const ProductSchema = z.object({
  id: z.number(),
  publishedAt: z.coerce.date().nullable(),
  name: z.string(),
  basePrice: z.number().min(0),
  virtualPrice: z.number().min(0),
  brandId: z.number().positive(),
  images: z.array(z.string()),
  variants: VariantsSchema,

  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
})

export type ProductType = z.infer<typeof ProductSchema>
export type VariantsType = z.infer<typeof VariantsSchema>
