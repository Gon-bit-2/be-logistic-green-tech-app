import { Controller, Post, UseInterceptors, UploadedFile, BadRequestException, UploadedFiles } from '@nestjs/common'
import { UploadService } from '../service/upload.service'
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express'
import { type Express } from 'express'
import { MAX_UPLOAD_FILE_COUNT, uploadMulterOptions } from '../upload.constants'

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

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
