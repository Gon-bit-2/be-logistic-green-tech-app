/**
 * Utility codec for ISO DateTime string validation and conversion using Zod.
 * Tiện ích codec để kiểm chứng và chuyển đổi chuỗi ISO DateTime sử dụng Zod.
 *
 * Decodes string to Date object, and encodes Date object back into ISO string.
 * Giải mã chuỗi thành đối tượng Date, và mã hóa đối tượng Date ngược lại thành chuỗi ISO.
 */
import { z } from 'zod'


export const IsoDateTimeCodec = z.codec(z.iso.datetime(), z.date(), {
  decode: (value) => new Date(value),
  encode: (value) => value.toISOString(),
})
