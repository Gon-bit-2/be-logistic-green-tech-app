import { Injectable, BadRequestException } from '@nestjs/common'
import { WalletRepository } from '@src/modules/wallet/repository/wallet.repo'
import { PrismaService } from '@src/database/prisma.service'
import { CodSettlementService } from '@src/common/services/cod-settlement.service'

@Injectable()
export class WalletService {
  constructor(
    private readonly walletRepo: WalletRepository,
    private readonly prisma: PrismaService,
    private readonly codSettlementService: CodSettlementService,
  ) {}

  async getMyWallet(userId: number) {
    return this.walletRepo.getWalletByUserId(userId)
  }

  async addCodToDriver(driverId: number, orderId: number, amount: number) {
    return this.codSettlementService.collectCodForOrder(orderId, driverId, { amount })
  }

  async reconcileCodForDriver(
    adminId: number,
    driverId: number,
    amount: number,
    referenceId: string,
    description?: string,
  ) {
    const desc = description || `Đối soát COD bởi Admin #${adminId}`
    try {
      const result = await this.walletRepo.reconcileCod(driverId, amount, referenceId, desc)

      const orderReferenceMatch = /^ORDER_(\d+)$/i.exec(referenceId.trim())
      if (orderReferenceMatch) {
        await this.prisma.order.updateMany({
          where: {
            id: Number(orderReferenceMatch[1]),
            isCodCollected: true,
          },
          data: {
            codReconciledAt: new Date(),
          },
        })
      }

      return result
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Lỗi đối soát COD'
      throw new BadRequestException(message)
    }
  }
}
