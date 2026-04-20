import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { WalletRepository } from '../repository/wallet.repo';
import { PrismaService } from 'src/database/prisma.service';

@Injectable()
export class WalletService {
  constructor(
    private readonly walletRepo: WalletRepository,
    private readonly prisma: PrismaService,
  ) {}

  async getMyWallet(userId: number) {
    return this.walletRepo.getWalletByUserId(userId);
  }

  async addCodToDriver(driverId: number, orderId: number, amount: number) {
    // Check if order exists and valid
    const order = await this.prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.isCodCollected) {
      throw new BadRequestException('COD already collected for this order');
    }

    const description = `Thu hộ COD cho đơn hàng #${order.trackingCode || order.id}`;
    
    const result = await this.walletRepo.addCodToWallet(driverId, amount, `ORDER_${orderId}`, description);

    // Update order status
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        isCodCollected: true,
      }
    });

    return result;
  }

  async reconcileCodForDriver(adminId: number, driverId: number, amount: number, referenceId: string, description?: string) {
    const desc = description || `Đối soát COD bởi Admin #${adminId}`;
    try {
      return await this.walletRepo.reconcileCod(driverId, amount, referenceId, desc);
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Lỗi đối soát COD');
    }
  }
}
