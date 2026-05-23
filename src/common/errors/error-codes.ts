export const ErrorCode = {
  Auth: {
    InvalidAccessToken: 'Error.InvalidAccessToken',
    MissingAccessToken: 'Error.MissingAccessToken',
    SessionExpired: 'Error.Auth.SessionExpired',
  },
  Forbidden: 'Error.Forbidden',
  Language: {
    Conflict: 'Error.Language.Conflict',
    NotFound: 'Error.Language.NotFound',
  },
  PermissionDenied: 'Error.PermissionDenied',
  Resource: {
    NotFound: 'Error.Resource.NotFound',
  },
  User: {
    AlreadyExists: 'Error.User.AlreadyExists',
    NotFound: 'Error.User.NotFound',
  },
} as const

export type ErrorCodeValue =
  | typeof ErrorCode.Forbidden
  | typeof ErrorCode.PermissionDenied
  | (typeof ErrorCode.Auth)[keyof typeof ErrorCode.Auth]
  | (typeof ErrorCode.Language)[keyof typeof ErrorCode.Language]
  | (typeof ErrorCode.Resource)[keyof typeof ErrorCode.Resource]

/**
 * Helper function to construct a standardized application error response object.
 * Hàm bổ trợ để xây dựng một đối tượng phản hồi lỗi ứng dụng tiêu chuẩn hóa.
 *
 * @param {ErrorCodeValue} errorCode - The predefined application error code.
 * @param {ErrorCodeValue} errorCode - Mã lỗi ứng dụng đã được định nghĩa trước.
 * @param {string} [message] - Optional descriptive error message, defaulting to the error code string.
 * @param {string} [message] - Thông điệp lỗi mô tả tùy chọn, mặc định là chuỗi mã lỗi.
 * @returns {object} Standardized error response body containing errorCode and message.
 * @returns {object} Body phản hồi lỗi tiêu chuẩn chứa errorCode và message.
 */
export function createErrorResponse(errorCode: ErrorCodeValue, message = errorCode) {
  return {
    errorCode,
    message,
  }
}
