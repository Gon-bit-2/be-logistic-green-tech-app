// import { Injectable } from '@nestjs/common'
// import { PrismaService } from '../service/prisma.service'
// import { ORDER_STATUS } from '../constants/order.constant'
// import { PAYMENT_STATUS } from '../constants/payment.constant'

// @Injectable()
// export class SharedPaymentRepository {
//   constructor(private readonly prismaService: PrismaService) {}

//   async cancelPaymentAndOrder(paymentId: number) {
//     const payment = await this.prismaService.payment.findUnique({
//       where: {
//         id: paymentId,
//       },
//       include: {
//         order: {
//           include: {
//             items: true,
//           },
//         },
//       },
//     })
//     if (!payment) {
//       throw new Error('Payment not found')
//     }
//     const { order: orders } = payment
//     const productSKUSnapshots = orders.map((order) => order.items).flat()
//     await this.prismaService.$transaction(async (tx) => {
//       const updateOrder$ = await tx.order.updateMany({
//         where: {
//           id: {
//             in: orders.map((order) => order.id),
//           },
//           status: ORDER_STATUS.UNPAID,
//           deletedAt: null,
//         },
//         data: {
//           status: ORDER_STATUS.CANCELLED,
//         },
//       })
//       const updateSkus$ = Promise.all(
//         productSKUSnapshots
//           .filter((item) => item.skuId)
//           .map((item) =>
//             tx.sKU.update({
//               where: {
//                 id: item.skuId as number,
//               },
//               data: {
//                 stock: {
//                   increment: item.quantity, //khi cancel thì phải tăng lại stock
//                 },
//               },
//             }),
//           ),
//       )
//       const updatePayment$ = tx.payment.update({
//         where: {
//           id: paymentId,
//         },
//         data: {
//           status: PAYMENT_STATUS.FAILED,
//         },
//       })
//       return await Promise.all([updateOrder$, updateSkus$, updatePayment$])
//     })
//   }
// }
