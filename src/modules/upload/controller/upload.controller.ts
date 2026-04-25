import { Controller, Post, UseInterceptors, UploadedFile, BadRequestException, UploadedFiles, Query } from '@nestjs/common'
import { UploadService } from '../service/upload.service'
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express'
import { type Express } from 'express'
import { MAX_UPLOAD_FILE_COUNT, uploadMulterOptions } from '../upload.constants'

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * Upload ảnh chung (dùng cho vehicle, hub, và các entity khác)
   * Query param `folder` để phân loại thư mục trên Cloudinary
   * Mặc định folder = 'logistic_general'
   */
  @Post('image')
  @UseInterceptors(FileInterceptor('file', uploadMulterOptions))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder?: string,
  ) {
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

  /** Upload ảnh POD (Proof of Delivery) — dùng cho tracking module */
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

  /** Upload nhiều ảnh POD cùng lúc (tối đa 5 ảnh) */
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
