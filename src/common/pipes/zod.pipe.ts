import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common'
import { ZodError, type ZodSchema } from 'zod'

/**
 * Pipe to validate request input values against a Zod schema.
 * Pipe để kiểm chứng các giá trị đầu vào của request dựa trên một schema Zod.
 *
 * Ensures that client payload conforms to the required structures and types before
 * reaching request handlers.
 * Đảm bảo payload từ client tuân thủ cấu trúc và kiểu bắt buộc trước khi đến
 * trình xử lý request.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema<unknown>) {}

  /**
   * Transforms and validates the incoming request payload using the Zod schema.
   * Chuyển đổi và kiểm chứng payload của request gửi đến bằng cách sử dụng schema Zod.
   *
   * Only validates the request payload if the metadata type is 'body'.
   * Chỉ thực hiện kiểm chứng payload request nếu kiểu metadata là 'body'.
   *
   * @param {unknown} value - The raw incoming request payload.
   * @param {unknown} value - Payload request thô gửi đến.
   * @param {ArgumentMetadata} metadata - Metadata about the request parameter.
   * @param {ArgumentMetadata} metadata - Metadata về tham số request.
   * @returns {any} The parsed and validated payload.
   * @returns {any} Payload đã được phân tích và kiểm chứng thành công.
   * @throws {BadRequestException} If the validation fails, returning detailed Zod issues.
   * @throws {BadRequestException} Nếu kiểm chứng thất bại, trả về chi tiết lỗi từ Zod.
   */
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== 'body') {
      return value
    }
    try {
      const parsedValue = this.schema.parse(value)
      return parsedValue
    } catch (error: unknown) {
      throw new BadRequestException(error instanceof ZodError ? error.issues : error)
    }
  }
}
