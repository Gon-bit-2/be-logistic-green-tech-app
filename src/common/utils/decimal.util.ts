import { z } from 'zod'

type DecimalLike = {
  toNumber?: () => number
  toString: () => string
}

/**
 * Type guard to check if a value acts like a Prisma Decimal type.
 * Type guard để kiểm tra xem một giá trị có hoạt động giống kiểu Decimal của Prisma hay không.
 *
 * @param {unknown} value - The value to inspect.
 * @param {unknown} value - Giá trị cần kiểm tra.
 * @returns {boolean} True if the value matches the Decimal structure, false otherwise.
 * @returns {boolean} True nếu giá trị khớp với cấu trúc Decimal, ngược lại là false.
 */
export function isDecimalLike(value: unknown): value is DecimalLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toString?: unknown }).toString === 'function' &&
    (typeof (value as { toNumber?: unknown }).toNumber === 'function' ||
      (value as { constructor?: { name?: string } }).constructor?.name === 'Decimal')
  )
}

/**
 * Converts a Decimal-like value into a native JavaScript number.
 * Chuyển đổi một giá trị dạng Decimal thành kiểu số thực (number) gốc của JavaScript.
 *
 * Returns the original value if it is not Decimal-like or cannot be parsed as a finite number.
 * Trả về giá trị ban đầu nếu nó không giống Decimal hoặc không thể phân tích thành một số hữu hạn.
 *
 * @param {unknown} value - The input value to convert.
 * @param {unknown} value - Giá trị đầu vào cần chuyển đổi.
 * @returns {unknown} The parsed number or the original value.
 * @returns {unknown} Số được phân tích hoặc giá trị ban đầu.
 */
export function decimalToNumber(value: unknown): unknown {
  if (isDecimalLike(value)) {
    const numberValue = typeof value.toNumber === 'function' ? value.toNumber() : Number.parseFloat(value.toString())
    return Number.isFinite(numberValue) ? numberValue : value
  }

  return value
}

/**
 * Recursively converts all Decimal-like properties in an object or array into native numbers.
 * Chuyển đổi đệ quy tất cả các thuộc tính dạng Decimal trong một đối tượng hoặc mảng thành kiểu số thường.
 *
 * Useful for serializing Prisma responses containing Decimal types.
 * Hữu ích cho việc serialize các phản hồi từ Prisma chứa kiểu dữ liệu Decimal.
 *
 * @template T
 * @param {T} value - The object or array containing decimal fields.
 * @param {T} value - Đối tượng hoặc mảng chứa các trường decimal.
 * @returns {T} The converted structure.
 * @returns {T} Cấu trúc đã được chuyển đổi.
 */
export function convertDecimalsToNumbers<T>(value: T): T {
  const converted = decimalToNumber(value)
  if (converted !== value) {
    return converted as T
  }

  if (Array.isArray(value)) {
    return value.map((item) => convertDecimalsToNumbers(item)) as T
  }

  if (value instanceof Date || value === null || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key, convertDecimalsToNumbers(entryValue)]),
  ) as T
}

export const DecimalNumberSchema = z.preprocess(decimalToNumber, z.number())
