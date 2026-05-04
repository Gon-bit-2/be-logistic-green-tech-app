import { Injectable } from '@nestjs/common'
import { PrismaService } from '@src/database/prisma.service'
import { TransactionStatus, TransactionType } from 'generated/prisma'

@Injectable()
export class WalletRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createWallet(userId: number) {
    return this.prisma.wallet.create({
      data: {
        userId,
      },
    })
  }

  async getWalletByUserId(userId: number) {
    let wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    })

    // Auto-create if not exists
    if (!wallet) {
      wallet = await this.createWallet(userId)
    }

    return wallet
  }

  async addCodToWallet(userId: number, amount: number, referenceId: string, description: string) {
    const wallet = await this.getWalletByUserId(userId)

    return this.prisma.$transaction(async (tx) => {
      // 1. Create transaction record
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          amount,
          type: 'COD_COLLECTION',
          status: 'COMPLETED',
          referenceId,
          description,
        },
      })

      // 2. Update wallet balances
      return tx.wallet.update({
        where: { id: wallet.id },
        data: {
          codCollected: {
            increment: amount,
          },
        },
      })
    })
  }

  async reconcileCod(userId: number, amount: number, referenceId: string, description: string) {
    const wallet = await this.getWalletByUserId(userId)

    if (Number(wallet.codCollected) < amount) {
      throw new Error(`Không đủ lượng COD đang nợ để đối soát. Số dư: ${wallet.codCollected}, yêu cầu: ${amount}`)
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          amount: -amount,
          type: TransactionType.COD_RECONCILIATION,
          status: TransactionStatus.COMPLETED,
          referenceId,
          description,
        },
      })

      return tx.wallet.update({
        where: { id: wallet.id },
        data: {
          codCollected: {
            decrement: amount,
          },
        },
      })
    })
  }
}
