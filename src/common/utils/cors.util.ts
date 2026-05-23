/**
 * Parses a comma-separated list of CORS origins into an array of trimmed strings.
 * Phân tích danh sách các nguồn CORS phân tách bằng dấu phẩy thành một mảng chứa các chuỗi đã cắt khoảng trắng.
 *
 * @param {string} [origins] - The comma-separated origins string.
 * @param {string} [origins] - Chuỗi các nguồn phân tách bằng dấu phẩy.
 * @returns {string[] | undefined} An array of valid origin strings, or undefined.
 * @returns {string[] | undefined} Mảng các chuỗi nguồn hợp lệ, hoặc undefined.
 */
export function parseCorsOrigins(origins?: string) {
  return origins
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}
