const roleName = {
  ADMIN: 'ADMIN',
  CUSTOMER: 'CUSTOMER',
  DRIVER: 'DRIVER',
  WAREHOUSE_STAFF: 'WAREHOUSE_STAFF',
} as const
export default roleName

export const HTTPMethod = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
  PATCH: 'PATCH',
  OPTIONS: 'OPTIONS',
  HEAD: 'HEAD',
} as const
