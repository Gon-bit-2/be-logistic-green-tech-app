import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import {
  CreateHubBodyType,
  GetAllHubsQueryType,
  GetHubAssignableUsersQueryType,
  UpdateHubBodyType,
} from 'src/modules/hub/model/hub.model'
import { HubRepository } from 'src/modules/hub/repository/hub.repo'
import { ShareUserRepository } from 'src/common/repositories/shared-user.repo'
import roleName from 'src/common/constants/role.constant'

@Injectable()
export class HubService {
  constructor(
    private readonly hubRepo: HubRepository,
    private readonly shareUserRepo: ShareUserRepository,
  ) {}

  async create(data: CreateHubBodyType) {
    const existing = await this.hubRepo.findByCode(data.code)
    if (existing) {
      throw new ConflictException('Mã kho đã tồn tại trong hệ thống')
    }
    return this.hubRepo.create(data)
  }

  async findAll(query: GetAllHubsQueryType) {
    return this.hubRepo.findAll(query)
  }

  async findById(id: number) {
    const hub = await this.hubRepo.findById(id)
    if (!hub) {
      throw new NotFoundException('Không tìm thấy kho trung chuyển')
    }
    return hub
  }

  async update(id: number, data: UpdateHubBodyType) {
    await this.findById(id)

    if (data.code) {
      const existing = await this.hubRepo.findByCode(data.code)
      if (existing && existing.id !== id) {
        throw new ConflictException('Mã kho đã tồn tại trong hệ thống')
      }
    }

    return this.hubRepo.update(id, data)
  }

  async delete(id: number, deletedById: number) {
    await this.findById(id)
    return this.hubRepo.delete(id, deletedById)
  }

  async assignStaff(hubId: number, userId: number) {
    await this.findById(hubId)

    const user = await this.shareUserRepo.findUniqueIncludeRolePermissions({ id: userId })
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng')
    }

    if (user.role.name !== roleName.WAREHOUSE_STAFF) {
      throw new BadRequestException('Chỉ có thể gán nhân viên có vai trò WAREHOUSE_STAFF vào kho')
    }

    return this.hubRepo.assignStaff(hubId, userId)
  }

  async removeStaff(hubId: number, userId: number) {
    await this.findById(hubId)

    const user = await this.shareUserRepo.findUniqueIncludeRolePermissions({ id: userId })
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng')
    }

    if (user.role.name !== roleName.WAREHOUSE_STAFF) {
      throw new BadRequestException('Chỉ có thể xoá nhân viên có vai trò WAREHOUSE_STAFF khỏi kho')
    }

    if (user.hubId !== hubId) {
      throw new BadRequestException('Nhân viên này không thuộc kho trung chuyển đã chọn')
    }

    return this.hubRepo.removeStaff(userId)
  }

  async assignDriver(hubId: number, userId: number) {
    await this.findById(hubId)

    const user = await this.shareUserRepo.findUniqueIncludeRolePermissions({ id: userId })
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng')
    }

    if (user.role.name !== roleName.DRIVER) {
      throw new BadRequestException('Chỉ có thể gán tài xế có vai trò DRIVER vào kho')
    }

    return this.hubRepo.assignDriver(hubId, userId)
  }

  async removeDriver(hubId: number, userId: number) {
    await this.findById(hubId)

    const user = await this.shareUserRepo.findUniqueIncludeRolePermissions({ id: userId })
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng')
    }

    if (user.role.name !== roleName.DRIVER) {
      throw new BadRequestException('Chỉ có thể xoá tài xế có vai trò DRIVER khỏi kho')
    }

    if (user.hubId !== hubId) {
      throw new BadRequestException('Tài xế này không thuộc kho trung chuyển đã chọn')
    }

    return this.hubRepo.removeDriver(userId)
  }

  async findAssignableUsers(hubId: number, query: GetHubAssignableUsersQueryType) {
    await this.findById(hubId)
    return this.hubRepo.findAssignableUsers(hubId, query)
  }
}
