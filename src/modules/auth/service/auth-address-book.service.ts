import { Injectable, NotFoundException } from '@nestjs/common'
import {
  CreateAddressBookBodyType,
  UpdateAddressBookBodyType,
} from 'src/modules/auth/model/auth.model'
import { AuthRepository } from 'src/modules/auth/repository/auth.repository'
import { PrismaService } from 'src/database/prisma.service'

@Injectable()
export class AuthAddressBookService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly prismaService: PrismaService,
  ) {}

  async getAddressBooks(userId: number) {
    const data = await this.authRepository.findAddressBooksByUserId(userId)
    return { data }
  }

  async createAddressBook(userId: number, body: CreateAddressBookBodyType) {
    const totalItems = await this.authRepository.countActiveAddressBooksByUserId(userId)
    const isDefault = body.isDefault ?? totalItems === 0

    return this.prismaService.$transaction(async (tx) => {
      if (isDefault) {
        await this.authRepository.clearDefaultAddressBooks(userId, undefined, tx)
      }

      return this.authRepository.createAddressBook(
        {
          ...body,
          userId,
          isDefault,
        },
        tx,
      )
    })
  }

  async updateAddressBook(userId: number, addressBookId: number, body: UpdateAddressBookBodyType) {
    const existingAddress = await this.authRepository.findAddressBookByIdForUser(addressBookId, userId)
    if (!existingAddress) {
      throw new NotFoundException('Address book entry not found')
    }

    return this.prismaService.$transaction(async (tx) => {
      if (body.isDefault === true) {
        await this.authRepository.clearDefaultAddressBooks(userId, addressBookId, tx)
      }

      return this.authRepository.updateAddressBook(
        addressBookId,
        {
          ...body,
          ...(body.label !== undefined ? { label: body.label ?? null } : {}),
          ...(body.latitude !== undefined ? { latitude: body.latitude ?? null } : {}),
          ...(body.longitude !== undefined ? { longitude: body.longitude ?? null } : {}),
        },
        tx,
      )
    })
  }

  async deleteAddressBook(userId: number, addressBookId: number) {
    const existingAddress = await this.authRepository.findAddressBookByIdForUser(addressBookId, userId)
    if (!existingAddress) {
      throw new NotFoundException('Address book entry not found')
    }

    await this.prismaService.$transaction(async (tx) => {
      await this.authRepository.updateAddressBook(
        addressBookId,
        {
          deletedAt: new Date(),
          isDefault: false,
        },
        tx,
      )

      if (existingAddress.isDefault) {
        const fallbackAddress = await this.authRepository.findFirstActiveAddressBookByUserId(userId, tx)
        if (fallbackAddress) {
          await this.authRepository.updateAddressBook(
            fallbackAddress.id,
            {
              isDefault: true,
            },
            tx,
          )
        }
      }
    })

    return {
      message: 'Xóa địa chỉ thành công',
    }
  }
}
