/**
 * Generates a random tracking code for orders.
 * Tạo ngẫu nhiên một mã theo dõi hành trình (tracking code) cho các đơn hàng.
 *
 * Uses a standard prefix of 'GONLG' followed by 10 randomly generated digits.
 * Sử dụng tiền tố tiêu chuẩn 'GONLG' tiếp sau là 10 chữ số được tạo ngẫu nhiên.
 *
 * @returns {string} The unique generated tracking code string.
 * @returns {string} Chuỗi mã theo dõi hành trình duy nhất đã tạo.
 */
const generateTrackingCode = (): string => {
  let result = 'GONLG'
  for (let i = 0; i < 10; i++) {
    result += Math.floor(Math.random() * 10).toString()
  }
  return result
}
export { generateTrackingCode }
