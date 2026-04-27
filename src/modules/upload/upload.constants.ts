import { BadRequestException } from '@nestjs/common'
import { diskStorage } from 'multer'
import { extname, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'

const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const TEMP_UPLOAD_DIR = resolve(process.cwd(), 'tmp', 'uploads')

function ensureTempUploadDir() {
  mkdirSync(TEMP_UPLOAD_DIR, { recursive: true })
  return TEMP_UPLOAD_DIR
}

export const MAX_UPLOAD_FILE_SIZE = 5 * 1024 * 1024
export const MAX_UPLOAD_FILE_COUNT = 5

export const uploadMulterOptions = {
  storage: diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, ensureTempUploadDir())
    },
    filename: (_req, file, callback) => {
      const safeExtension = extname(file.originalname).toLowerCase()
      callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExtension}`)
    },
  }),
  limits: {
    fileSize: MAX_UPLOAD_FILE_SIZE,
  },
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      callback(
        new BadRequestException('Định dạng file không hỗ trợ, vui lòng tải lên ảnh (jpg, png, webp, gif).'),
        false,
      )
      return
    }

    callback(null, true)
  },
}
