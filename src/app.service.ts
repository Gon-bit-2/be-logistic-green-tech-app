import { Injectable } from '@nestjs/common'

/**
 * Root service of the application, provides core application-wide logic.
 * Service gốc của ứng dụng, cung cấp logic cốt lõi ở cấp độ ứng dụng.
 */
@Injectable()
export class AppService {
  /**
   * Returns a hello world greeting string.
   * Trả về chuỗi chào mừng Hello World.
   *
   * @returns {string} The greeting string.
   * @returns {string} Chuỗi chào mừng.
   */
  getHello(): string {
    return 'Hello World!'
  }
}
