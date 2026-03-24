import { randomInt } from 'crypto'

/**
 * @description Tạo mã OTP
 * @returns
 */
export const generateOTP = () => {
  return String(randomInt(100000, 1000000))
}
/**
 *@description Tạo id cho job cancel payment
 * @param paymentId
 * @returns
 */
export const generateCancelPaymentJobId = (paymentId: number) => {
  return `cancel-payment-${paymentId}`
}

export const generateRoomUserId = (userId: number) => {
  return `user-${userId}`
}
