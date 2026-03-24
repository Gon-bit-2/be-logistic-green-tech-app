export const DISCOUNT_TYPE = ['PERCENTAGE', 'FIXED_AMOUNT', 'SHIPPING', 'COIN_CASHBACK'] as const

export const DISCOUNT_SCOPE = ['PLATFORM', 'SHOP'] as const

export const DISCOUNT_APPLY_TO = ['ALL', 'SPECIFIC'] as const

export type DiscountType = (typeof DISCOUNT_TYPE)[number]
export type DiscountScopeType = (typeof DISCOUNT_SCOPE)[number]
export type DiscountApplyToType = (typeof DISCOUNT_APPLY_TO)[number]
