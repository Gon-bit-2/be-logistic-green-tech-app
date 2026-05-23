import { Injectable, BadRequestException } from '@nestjs/common'
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary'
import envConfig from '../../../config/config'
import { unlink } from 'node:fs/promises'

/**
 * Service to manage file uploads to Cloudinary storage.
 * Handles Cloudinary configuration and encapsulates upload operations,
 * ensuring temporary local files are cleaned up after upload attempts.
 * 
 * Dịch vụ quản lý việc tải tệp tin lên bộ lưu trữ Cloudinary.
 * Xử lý cấu hình Cloudinary và bao bọc các thao tác tải lên,
 * đảm bảo các tệp tin tạm thời cục bộ được dọn dẹp sau khi tải lên.
 */
@Injectable()
export class UploadService {
  /**
   * Initializes the UploadService and configures Cloudinary with environment credentials.
   * 
   * Khởi tạo UploadService và cấu hình Cloudinary với các thông tin xác thực từ biến môi trường.
   */
  constructor() {
    cloudinary.config({
      cloud_name: envConfig.CLOUDINARY_CLOUD_NAME,
      api_key: envConfig.CLOUDINARY_API_KEY,
      api_secret: envConfig.CLOUDINARY_API_SECRET,
    })
  }

  /**
   * Uploads a file to Cloudinary in a specified folder.
   * Ensures that the local temporary file is deleted after the attempt, even if the upload fails.
   * 
   * Tải một tệp tin lên Cloudinary vào một thư mục được chỉ định.
   * Đảm bảo tệp tin tạm thời cục bộ bị xóa sau khi thực hiện, ngay cả khi quá trình tải lên thất bại.
   * 
   * @param file - The Multer file details representing the uploaded file / Thông tin chi tiết tệp tin Multer đại diện cho tệp tin đã tải lên.
   * @param folder - The target Cloudinary folder name / Tên thư mục Cloudinary đích.
   * @returns Detailed upload API response / Phản hồi chi tiết API tải lên.
   * @throws BadRequestException - If file path is invalid or Cloudinary upload fails / Nếu đường dẫn tệp tin không hợp lệ hoặc tải lên Cloudinary thất bại.
   */
  async uploadFile(file: Express.Multer.File, folder: string = 'logistic_green_tech'): Promise<UploadApiResponse> {
    if (!file.path) {
      throw new BadRequestException('Không thể xử lý file tải lên')
    }

    try {
      return await cloudinary.uploader.upload(file.path, {
        folder,
        resource_type: 'image',
      })
    } catch (error) {
      const cloudinaryError = error as UploadApiErrorResponse | Error
      throw new BadRequestException('Lỗi tải ảnh lên Cloudinary: ' + cloudinaryError.message)
    } finally {
      await unlink(file.path).catch(() => undefined)
    }
  }
}
