import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UploadedFiles,
  Query,
} from '@nestjs/common'
import { UploadService } from '@src/modules/upload/service/upload.service'
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express'
import { type Express } from 'express'
import { MAX_UPLOAD_FILE_COUNT, uploadMulterOptions } from '@src/modules/upload/upload.constants'

/**
 * Controller for handling file upload operations.
 * Provides endpoints for uploading general images (vehicles, hubs) and Proof of Delivery (POD) images to Cloudinary.
 * 
 * Controller xử lý các thao tác tải lên tệp tin (upload).
 * Cung cấp các endpoint để tải lên hình ảnh chung (xe cộ, hub) và hình ảnh xác thực giao hàng (POD) lên Cloudinary.
 */
@Controller('upload')
export class UploadController {
  /**
   * Initializes the UploadController.
   * 
   * Khởi tạo UploadController.
   * 
   * @param uploadService - The Upload service instance / Instance của dịch vụ upload.
   */
  constructor(private readonly uploadService: UploadService) {}

  /**
   * Uploads a general image (used for vehicles, hubs, and other entities).
   * Restricts destination folder paths to allowed values for security.
   * 
   * Tải lên một hình ảnh chung (dùng cho xe cộ, hub và các thực thể khác).
   * Giới hạn các đường dẫn thư mục đích trong các giá trị cho phép để đảm bảo an toàn.
   * 
   * @param file - The uploaded image file / Tệp tin ảnh được tải lên.
   * @param folder - Query parameter to specify the Cloudinary folder / Tham số truy vấn để chỉ định thư mục trên Cloudinary.
   * @returns Detailed information of the uploaded file / Thông tin chi tiết của tệp tin đã tải lên.
   * @throws BadRequestException - If no file is provided or the upload fails / Nếu không cung cấp tệp tin hoặc tải lên thất bại.
   */
  @Post('image')
  @UseInterceptors(FileInterceptor('file', uploadMulterOptions))
  async uploadImage(@UploadedFile() file: Express.Multer.File, @Query('folder') folder?: string) {
    if (!file) {
      throw new BadRequestException('Vui lòng cung cấp file ảnh.')
    }

    // Chỉ cho phép các folder hợp lệ để tránh lạm dụng
    const allowedFolders = ['logistic_vehicles', 'logistic_hubs', 'logistic_general']
    const targetFolder = allowedFolders.includes(folder ?? '') ? folder! : 'logistic_general'

    try {
      const result = await this.uploadService.uploadFile(file, targetFolder)
      return {
        message: 'Tải ảnh lên thành công',
        url: result.secure_url,
        public_id: result.public_id,
        format: result.format,
        bytes: result.bytes,
      }
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Upload ảnh thất bại')
    }
  }

  /**
   * Uploads a Proof of Delivery (POD) image (used in tracking module).
   * 
   * Tải lên hình ảnh xác thực giao hàng (POD) — dùng trong module tracking.
   * 
   * @param file - The uploaded POD image file / Tệp tin hình ảnh POD tải lên.
   * @returns Detailed information of the uploaded POD image / Thông tin chi tiết của hình ảnh POD đã tải lên.
   * @throws BadRequestException - If no file is provided or the upload fails / Nếu không cung cấp tệp tin hoặc tải lên thất bại.
   */
  @Post('pod')
  @UseInterceptors(FileInterceptor('file', uploadMulterOptions))
  async uploadProofOfDelivery(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Vui lòng cung cấp file ảnh POD (Proof Of Delivery).')
    }

    try {
      const result = await this.uploadService.uploadFile(file, 'logistic_pod')
      return {
        message: 'Tải ảnh POD thành công',
        url: result.secure_url,
        public_id: result.public_id,
        format: result.format,
        bytes: result.bytes,
      }
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Upload failed')
    }
  }

  /**
   * Uploads multiple Proof of Delivery (POD) images simultaneously (up to maximum allowed count).
   * 
   * Tải lên nhiều hình ảnh xác thực giao hàng (POD) cùng lúc (tối đa theo số lượng cho phép).
   * 
   * @param files - Array of uploaded POD image files / Danh sách các tệp tin hình ảnh POD tải lên.
   * @returns A list containing URLs and public IDs of successfully uploaded files / Danh sách chứa các URL và public ID của các tệp tin đã tải lên thành công.
   * @throws BadRequestException - If no files are provided / Nếu không cung cấp tệp tin nào.
   */
  @Post('multiple-pod')
  @UseInterceptors(FilesInterceptor('files', MAX_UPLOAD_FILE_COUNT, uploadMulterOptions))
  async uploadMultipleProofOfDelivery(@UploadedFiles() files: Array<Express.Multer.File>) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Vui lòng cung cấp ít nhất 1 file ảnh.')
    }

    const uploadPromises = files.map((file) => this.uploadService.uploadFile(file, 'logistic_pod'))

    const results = await Promise.all(uploadPromises)

    return {
      message: 'Tải ảnh hàng loạt thành công',
      data: results.map((res) => ({
        url: res.secure_url,
        public_id: res.public_id,
      })),
    }
  }
}
