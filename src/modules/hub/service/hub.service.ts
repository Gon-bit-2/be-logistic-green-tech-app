import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { CreateHubBodyType, GetAllHubsQueryType, UpdateHubBodyType } from 'src/modules/hub/model/hub.model'
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

  async delete(id: number) {
    await this.findById(id)
    return this.hubRepo.delete(id)
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
}
