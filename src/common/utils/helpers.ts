import { randomInt } from 'crypto'

/**
 * Generates a secure, 6-digit numeric OTP (One-Time Password).
 * Tạo mã OTP (One-Time Password) dạng số gồm 6 chữ số bảo mật.
 *
 * @returns {string} The generated 6-digit OTP string.
 * @returns {string} Chuỗi OTP 6 chữ số đã tạo.
 */
export const generateOTP = () => {
  return String(randomInt(100000, 1000000))
}

/**
 * Generates a unique job ID for a payment cancellation background job.
 * Tạo một ID duy nhất cho job ngầm hủy bỏ giao dịch thanh toán.
 *
 * @param {number} paymentId - The ID of the targeted payment.
 * @param {number} paymentId - ID của giao dịch thanh toán đích.
 * @returns {string} The formatted job ID string.
 * @returns {string} Chuỗi ID job đã định dạng.
 */
export const generateCancelPaymentJobId = (paymentId: number) => {
  return `cancel-payment-${paymentId}`
}

/**
 * Generates a standardized Socket.IO room name for a specific user.
 * Tạo một tên phòng Socket.IO tiêu chuẩn hóa cho một người dùng cụ thể.
 *
 * @param {number} userId - The ID of the user.
 * @param {number} userId - ID của người dùng.
 * @returns {string} The formatted Socket.IO room name.
 * @returns {string} Tên phòng Socket.IO đã định dạng.
 */
export const generateRoomUserId = (userId: number) => {
  return `user-${userId}`
}
