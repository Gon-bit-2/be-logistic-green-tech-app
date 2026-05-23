import { Injectable } from '@nestjs/common'
import { Prisma } from 'generated/prisma'
import roleName from 'src/common/constants/role.constant'
import { TypeOfVerificationCodeType } from 'src/common/constants/auth.constant'
import { PrismaService } from 'src/database/prisma.service'
import {
  AddressBookResType,
  CreateAddressBookBodyType,
  DeviceType,
  RefreshTokenType,
  UserType,
} from 'src/modules/auth/model/auth.model'
import { PermissionType, RoleType } from 'src/modules/role/model/role.model'

type PrismaExecutor = PrismaService | Prisma.TransactionClient
export type WhereUniqueUserType = { id: number } | { email: string }
export type UserIncludeRolePermissionType = UserType & {
  role: RoleType & {
    permissions: PermissionType[]
  }
}
export type UserIncludeRoleType = UserType & {
  role: RoleType
}

/**
 * Repository class handling all database queries related to authentication, users, refresh tokens, devices, and address books.
 * Lớp Repository xử lý toàn bộ các truy vấn cơ sở dữ liệu liên quan đến xác thực, người dùng, refresh token, thiết bị và sổ địa chỉ.
 */
@Injectable()
export class AuthRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Private helper to resolve the database client (direct prisma or active transaction).
   */
  private getClient(client?: PrismaExecutor) {
    return client ?? this.prismaService
  }

  /**
   * Finds a unique active user by id or email.
   * Tìm kiếm một người dùng hoạt động duy nhất bằng ID hoặc Email.
   *
   * @param {WhereUniqueUserType} uniqueObject - The query filter (id or email).
   * @param {WhereUniqueUserType} uniqueObject - Bộ lọc truy vấn (id hoặc email).
   * @returns {Promise<UserType | null>} The user record or null if not found.
   * @returns {Promise<UserType | null>} Bản ghi người dùng hoặc null nếu không tìm thấy.
   */
  async findUnique(uniqueObject: WhereUniqueUserType): Promise<UserType | null> {
    return await this.prismaService.user.findFirst({
      where: {
        ...uniqueObject,
        deletedAt: null,
      },
    })
  }

  /**
   * Finds a unique active user and includes their role and role permissions.
   * Tìm kiếm một người dùng hoạt động duy nhất và bao gồm vai trò (role) cùng các quyền hạn vai trò (permissions).
   *
   * @param {WhereUniqueUserType} where - The query filter (id or email).
   * @param {WhereUniqueUserType} where - Bộ lọc truy vấn (id hoặc email).
   * @returns {Promise<UserIncludeRolePermissionType | null>} The resolved user record or null.
   * @returns {Promise<UserIncludeRolePermissionType | null>} Bản ghi người dùng đã phân giải hoặc null.
   */
  async findUniqueIncludeRolePermissions(where: WhereUniqueUserType): Promise<UserIncludeRolePermissionType | null> {
    return await this.prismaService.user.findFirst({
      where: {
        ...where,
        deletedAt: null,
      },
      include: {
        role: {
          include: {
            permissions: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
    })
  }

  /**
   * Inserts a new user record into the database, omitting password and TOTP secrets from the return type.
   * Chèn một bản ghi người dùng mới vào cơ sở dữ liệu, bỏ qua mật khẩu và bí mật TOTP trong kiểu dữ liệu trả về.
   *
   * @param user - Core user details (email, fullName, password, roleId, phone).
   * @param user - Thông tin chi tiết cốt lõi của người dùng.
   * @returns The newly created user details.
   * @returns Chi tiết người dùng mới được tạo.
   */
  async createUser(
    user: Pick<UserType, 'email' | 'fullName' | 'password' | 'roleId'> & { phone: string | null },
  ): Promise<Omit<UserType, 'password' | 'totpSecret'>> {
    return await this.prismaService.user.create({
      data: user,
      omit: {
        password: true,
        totpSecret: true,
      },
    })
  }

  /**
   * Inserts a new user record into the database and includes their assigned role details.
   * Chèn một bản ghi người dùng mới vào cơ sở dữ liệu và bao gồm thông tin chi tiết vai trò được gán.
   *
   * @param user - User details including optional avatar.
   * @param user - Thông tin chi tiết người dùng bao gồm cả ảnh đại diện tùy chọn.
   * @returns The newly created user and role record.
   * @returns Bản ghi người dùng và vai trò mới được tạo.
   */
  async createUserIncludeRole(
    user: Pick<UserType, 'email' | 'fullName' | 'password' | 'roleId'> & {
      phone: string | null
      avatar: string | null
    },
  ): Promise<UserType & { role: RoleType }> {
    return await this.prismaService.user.create({
      data: user,
      include: {
        role: true,
      },
    })
  }

  /**
   * Finds a unique active user and includes their assigned role details.
   * Tìm kiếm một người dùng hoạt động duy nhất và bao gồm thông tin vai trò của họ.
   *
   * @param {WhereUniqueUserType} uniqueObject - The query filter (id or email).
   * @param {WhereUniqueUserType} uniqueObject - Bộ lọc truy vấn.
   * @returns {Promise<(UserType & { role: RoleType }) | null>} The user record or null.
   * @returns {Promise<(UserType & { role: RoleType }) | null>} Bản ghi người dùng hoặc null.
   */
  async findUniqueIncludeRole(uniqueObject: WhereUniqueUserType): Promise<(UserType & { role: RoleType }) | null> {
    const user = await this.prismaService.user.findFirst({
      where: {
        ...uniqueObject,
        deletedAt: null,
      },
      include: {
        role: true,
      },
    })
    return user
  }

  /**
   * Updates an existing user record.
   * Cập nhật bản ghi người dùng đang tồn tại.
   *
   * @param {object} where - The user ID.
   * @param {number} where.id - ID người dùng.
   * @param {Partial<UserType>} data - The updated fields.
   * @param {Partial<UserType>} data - Các trường cần cập nhật.
   * @returns The updated user record.
   * @returns Bản ghi người dùng đã cập nhật.
   * @throws {Error} If user is not found or has been deleted.
   * @throws {Error} Nếu không tìm thấy người dùng hoặc đã bị xóa.
   */
  async update(where: { id: number }, data: Partial<UserType>) {
    const existingUser = await this.prismaService.user.findFirst({
      where: {
        id: where.id,
        deletedAt: null,
      },
      select: { id: true },
    })

    if (!existingUser) {
      throw new Error('User not found or has been deleted')
    }

    return await this.prismaService.user.update({
      where: {
        id: where.id,
      },
      data,
    })
  }

  /**
   * Retrieves active, non-deleted administrator user IDs.
   * Lấy danh sách ID của các quản trị viên (Admin) đang hoạt động và chưa bị xóa.
   *
   * @returns {Promise<{ id: number }[]>} List of active admin IDs.
   * @returns {Promise<{ id: number }[]>} Danh sách ID quản trị viên đang hoạt động.
   */
  async findActiveAdmins() {
    return await this.prismaService.user.findMany({
      where: {
        deletedAt: null,
        isDeleted: false,
        role: {
          name: roleName.ADMIN,
          deletedAt: null,
          isActive: true,
        },
      },
      select: {
        id: true,
      },
    })
  }

  /**
   * Inserts a new RefreshToken record into the database.
   * Chèn một bản ghi RefreshToken mới vào cơ sở dữ liệu.
   *
   * @param {object} data - Token metadata.
   * @param {object} data - Metadata của token.
   * @returns {Promise<RefreshTokenType>} The created refresh token database record.
   * @returns {Promise<RefreshTokenType>} Bản ghi refresh token CSDL đã tạo.
   */
  async createRefreshToken(data: {
    tokenHash: string
    userId: number
    expiresAt: Date
    deviceId: number
  }): Promise<RefreshTokenType> {
    return await this.prismaService.refreshToken.create({
      data: {
        token: data.tokenHash,
        userId: data.userId,
        expiresAt: data.expiresAt,
        deviceId: data.deviceId,
      },
    })
  }

  /**
   * Finds a unique RefreshToken by its token hash and includes the user and role.
   * Tìm một RefreshToken duy nhất bằng hash của nó và bao gồm thông tin user cùng role.
   *
   * @param {object} uniqueObject - The token hash.
   * @returns The resolved RefreshToken record or null.
   */
  async findUniqueRefreshTokenIncludeUserRole(uniqueObject: { tokenHash: string }) {
    return await this.prismaService.refreshToken.findUnique({
      where: {
        token: uniqueObject.tokenHash,
      },
      include: {
        user: {
          include: {
            role: true,
          },
        },
      },
    })
  }

  /**
   * Finds the first matching RefreshToken in a candidate list of hashes and includes user/role details.
   * Tìm RefreshToken đầu tiên khớp trong danh sách mã băm ứng viên và bao gồm chi tiết user/role.
   *
   * @param {string[]} tokens - Candidate list of token hashes.
   * @returns The resolved RefreshToken or null.
   */
  async findFirstRefreshTokenIncludeUserRoleByTokens(tokens: string[]) {
    return await this.prismaService.refreshToken.findFirst({
      where: {
        token: {
          in: tokens,
        },
      },
      include: {
        user: {
          include: {
            role: true,
          },
        },
      },
    })
  }

  /**
   * Finds the first matching RefreshToken in a candidate list of hashes.
   * Tìm RefreshToken đầu tiên khớp trong danh sách mã băm ứng viên.
   *
   * @param {string[]} tokens - Candidate list of token hashes.
   * @returns {Promise<RefreshTokenType | null>} The refresh token record or null.
   */
  async findFirstRefreshTokenByTokens(tokens: string[]): Promise<RefreshTokenType | null> {
    return await this.prismaService.refreshToken.findFirst({
      where: {
        token: {
          in: tokens,
        },
      },
    })
  }

  /**
   * Inserts a new client device session record.
   * Chèn một bản ghi phiên thiết bị client mới.
   *
   * @param data - Device metadata (userId, userAgent, IP, lastActive).
   * @returns {Promise<DeviceType>} The created device session record.
   */
  async createDevice(
    data: Pick<DeviceType, 'userId' | 'userAgent' | 'ip'> & Partial<Pick<DeviceType, 'isActive' | 'lastActive'>>,
  ): Promise<DeviceType> {
    return await this.prismaService.device.create({
      data,
    })
  }

  /**
   * Updates an existing device session record.
   * Cập nhật bản ghi phiên thiết bị đang tồn tại.
   *
   * @param {number} deviceId - The ID of the device.
   * @param {Partial<DeviceType>} data - The fields to update.
   * @returns {Promise<DeviceType>} The updated device record.
   */
  async updateDevice(deviceId: number, data: Partial<DeviceType>): Promise<DeviceType> {
    return await this.prismaService.device.update({
      where: {
        id: deviceId,
      },
      data,
    })
  }

  /**
   * Deletes a RefreshToken record from the database (blacklisting).
   * Xóa một bản ghi RefreshToken khỏi cơ sở dữ liệu (vô hiệu hóa).
   *
   * @param {object} uniqueObject - The token hash.
   * @returns {Promise<RefreshTokenType>} The deleted token record.
   */
  async deleteRefreshToken(uniqueObject: { tokenHash: string }): Promise<RefreshTokenType> {
    return await this.prismaService.refreshToken.delete({
      where: {
        token: uniqueObject.tokenHash,
      },
    })
  }

  /**
   * Finds a unique active OTP verification code matching email and type.
   * Tìm một mã xác thực OTP hoạt động duy nhất khớp với email và loại hành động.
   *
   * @param {object} uniqueObject - Email, OTP code and type query filter.
   * @returns The verification code record, or null if code doesn't match.
   */
  async findUniqueVerificationCode(uniqueObject: { email: string; code: string; type: TypeOfVerificationCodeType }) {
    const verificationCode = await this.prismaService.verificationCode.findUnique({
      where: {
        email_type: {
          email: uniqueObject.email,
          type: uniqueObject.type,
        },
      },
    })
    if (verificationCode && verificationCode.code === uniqueObject.code) {
      return verificationCode
    }
    return null
  }

  /**
   * Retrieves active address book entries for a specific user.
   * Lấy danh sách các địa chỉ hoạt động trong sổ địa chỉ của một người dùng cụ thể.
   *
   * @param {number} userId - The user ID.
   * @returns {Promise<AddressBookResType[]>} Ordered list of active address entries.
   */
  async findAddressBooksByUserId(userId: number): Promise<AddressBookResType[]> {
    return await this.prismaService.addressBook.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    })
  }

  /**
   * Counts active address book entries for a specific user.
   * Đếm số lượng địa chỉ hoạt động trong sổ địa chỉ của một người dùng cụ thể.
   *
   * @param {number} userId - The user ID.
   * @returns {Promise<number>} Number of active entries.
   */
  async countActiveAddressBooksByUserId(userId: number) {
    return await this.prismaService.addressBook.count({
      where: {
        userId,
        deletedAt: null,
      },
    })
  }

  /**
   * Finds a specific active address book entry for a user.
   * Tìm kiếm một địa chỉ hoạt động cụ thể của người dùng.
   *
   * @param {number} id - The address book entry ID.
   * @param {number} userId - The user ID.
   * @param {PrismaExecutor} [client] - Optional active Prisma transaction client.
   * @returns {Promise<AddressBookResType | null>} The address book entry or null.
   */
  async findAddressBookByIdForUser(
    id: number,
    userId: number,
    client?: PrismaExecutor,
  ): Promise<AddressBookResType | null> {
    return await this.getClient(client).addressBook.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
    })
  }

  /**
   * Retrieves the first active address book entry for a user, prioritising default addresses.
   * Lấy địa chỉ hoạt động đầu tiên của người dùng, ưu tiên các địa chỉ mặc định.
   *
   * @param {number} userId - The user ID.
   * @param {PrismaExecutor} [client] - Optional active Prisma transaction client.
   * @returns {Promise<AddressBookResType | null>} The address book entry or null.
   */
  async findFirstActiveAddressBookByUserId(
    userId: number,
    client?: PrismaExecutor,
  ): Promise<AddressBookResType | null> {
    return await this.getClient(client).addressBook.findFirst({
      where: {
        userId,
        deletedAt: null,
      },
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
    })
  }

  /**
   * Clears the default flag from all active address book entries of a user.
   * Hủy cờ mặc định (isDefault) khỏi tất cả các địa chỉ hoạt động của một người dùng.
   *
   * @param {number} userId - The user ID.
   * @param {number} [excludeId] - Optional entry ID to exclude from updates.
   * @param {PrismaExecutor} [client] - Optional active Prisma transaction client.
   */
  async clearDefaultAddressBooks(userId: number, excludeId?: number, client?: PrismaExecutor) {
    return await this.getClient(client).addressBook.updateMany({
      where: {
        userId,
        deletedAt: null,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      data: {
        isDefault: false,
      },
    })
  }

  /**
   * Inserts a new address book entry into the database.
   * Chèn một bản ghi sổ địa chỉ mới vào cơ sở dữ liệu.
   *
   * @param data - Address properties including latitude/longitude.
   * @param {PrismaExecutor} [client] - Optional active Prisma transaction client.
   * @returns {Promise<AddressBookResType>} The created address book record.
   */
  async createAddressBook(
    data: CreateAddressBookBodyType & { userId: number; isDefault: boolean },
    client?: PrismaExecutor,
  ): Promise<AddressBookResType> {
    return await this.getClient(client).addressBook.create({
      data: {
        ...data,
        label: data.label ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
      },
    })
  }

  /**
   * Updates an existing address book entry.
   * Cập nhật một bản ghi sổ địa chỉ đang tồn tại.
   *
   * @param {number} id - The address book entry ID.
   * @param {Prisma.AddressBookUpdateInput} data - The fields to update.
   * @param {PrismaExecutor} [client] - Optional active Prisma transaction client.
   * @returns {Promise<AddressBookResType>} The updated address book record.
   */
  async updateAddressBook(
    id: number,
    data: Prisma.AddressBookUpdateInput | Prisma.AddressBookUncheckedUpdateInput,
    client?: PrismaExecutor,
  ): Promise<AddressBookResType> {
    return await this.getClient(client).addressBook.update({
      where: {
        id,
      },
      data,
    })
  }
}
