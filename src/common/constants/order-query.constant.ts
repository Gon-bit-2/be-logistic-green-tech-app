import { Prisma } from 'generated/prisma'

export const DISPATCHABLE_PAYMENT_FILTER = {
  OR: [
    {
      payment: {
        is: {
          method: 'COD',
        },
      },
    },
    {
      payment: {
        is: {
          method: 'STRIPE',
          status: 'COMPLETED',
        },
      },
    },
  ],
} as const satisfies Prisma.OrderWhereInput
