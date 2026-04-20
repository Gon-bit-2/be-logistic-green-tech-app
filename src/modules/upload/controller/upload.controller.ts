import { Controller, Post, UseInterceptors, UploadedFile, BadRequestException, UploadedFiles } from '@nestjs/common'
import { UploadService } from '../service/upload.service'
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express'
import { type Express } from 'express'
import { Multer } from 'multer'

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('pod')
  @UseInterceptors(FileInterceptor('file'))
  async uploadProofOfDelivery(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Vui lòng cung cấp file ảnh POD (Proof Of Delivery).')
    }

    // You can validate file types here: file.mimetype
    if (!file.mimetype.match(/\/(jpg|jpeg|png|webp|gif)$/)) {
      throw new BadRequestException('Định dạng file không hỗ trợ, vui lòng tải lên ảnh (jpg, png, webp).')
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
  @UseInterceptors(FilesInterceptor('files', 5))
  async uploadMultipleProofOfDelivery(@UploadedFiles() files: Array<Express.Multer.File>) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Vui lòng cung cấp ít nhất 1 file ảnh.')
    }

    const uploadPromises = files.map((file) => {
      // type checking
      if (!file.mimetype.match(/\/(jpg|jpeg|png|webp|gif)$/)) {
        throw new BadRequestException('Một trong số định dạng file không hỗ trợ.')
      }
      return this.uploadService.uploadFile(file, 'logistic_pod')
    })

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
