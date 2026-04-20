import { Injectable, BadRequestException } from '@nestjs/common'
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary'
import envConfig from '../../../config/config'
import * as streamifier from 'streamifier'

@Injectable()
export class UploadService {
  constructor() {
    cloudinary.config({
      cloud_name: envConfig.CLOUDINARY_CLOUD_NAME,
      api_key: envConfig.CLOUDINARY_API_KEY,
      api_secret: envConfig.CLOUDINARY_API_SECRET,
    })
  }

  uploadFile(file: Express.Multer.File, folder: string = 'logistic_green_tech'): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder },
        (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
          if (error) return reject(new BadRequestException('Lỗi tải ảnh lên Cloudinary: ' + error.message))
          if (!result) return reject(new BadRequestException('Lỗi máy chủ: Không nhận được kết quả từ Cloudinary'))
          resolve(result)
        },
      )
      streamifier.createReadStream(file.buffer).pipe(uploadStream)
    })
  }
}
