import type { AccessTokenPayload } from 'src/types/jwt.type';
import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { WalletService } from '../service/wallet.service';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import roleName from 'src/common/constants/role.constant';
import type { AddCodDto, ReconcileCodDto } from '../dto/wallet.dto';
import { AddCodSchema, ReconcileCodSchema } from '../model/wallet.model';
import { ZodValidationPipe } from 'src/common/pipes/zod.pipe';

@UseGuards(RolesGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('my-wallet')
  @Roles(roleName.DRIVER) // Driver only
  async getMyWallet(@ActiveUser() user: AccessTokenPayload) {
    return this.walletService.getMyWallet(user.userId);
  }

  @Post('add-cod')
  @Roles(roleName.DRIVER) // Driver can add COD when they received cash
  async addCodToDriver(
    @ActiveUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(AddCodSchema)) body: AddCodDto
  ) {
    return this.walletService.addCodToDriver(user.userId, body.orderId, body.amount);
  }

  @Post('reconcile-cod')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF) // Admins/Managers reconcile COD
  async reconcileCodForDriver(
    @ActiveUser() admin: AccessTokenPayload,
    @Body(new ZodValidationPipe(ReconcileCodSchema)) body: ReconcileCodDto
  ) {
    return this.walletService.reconcileCodForDriver(
      admin.userId,
      body.driverId,
      body.amount,
      body.referenceId,
      body.description
    );
  }
}
