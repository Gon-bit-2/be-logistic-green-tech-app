import { Injectable, BadRequestException } from '@nestjs/common'
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary'
import envConfig from '../../../config/config'
import { unlink } from 'node:fs/promises'

@Injectable()
export class UploadService {
  constructor() {
    cloudinary.config({
      cloud_name: envConfig.CLOUDINARY_CLOUD_NAME,
      api_key: envConfig.CLOUDINARY_API_KEY,
      api_secret: envConfig.CLOUDINARY_API_SECRET,
    })
  }

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
