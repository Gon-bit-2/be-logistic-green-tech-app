import { ActiveUser } from '@src/common/decorators/active-user.decorator'
import { Roles } from '@src/common/decorators/roles.decorator'
import { RolesGuard } from '@src/common/guards/roles.guard'
import type { AccessTokenPayload } from '@src/common/types/jwt.type'
import { ZodValidationPipe } from '@src/common/pipes/zod.pipe'
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { WalletService } from '@src/modules/wallet/service/wallet.service'
import roleName from '@src/common/constants/role.constant'
import type {
  AddCodDto,
  CompleteSettlementBatchDto,
  CreateSettlementBatchDto,
  DisputeSettlementBatchDto,
  ReconcileCodDto,
} from '@src/modules/wallet/dto/wallet.dto'
import {
  AddCodSchema,
  CompleteSettlementBatchSchema,
  CreateSettlementBatchSchema,
  DisputeSettlementBatchSchema,
  ListSettlementBatchesQuerySchema,
  OutstandingCodQuerySchema,
  ReconcileCodSchema,
} from '@src/modules/wallet/model/wallet.model'

@UseGuards(RolesGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('my-wallet')
  @Roles(roleName.DRIVER) // Driver only
  async getMyWallet(@ActiveUser() user: AccessTokenPayload) {
    return this.walletService.getMyWallet(user.userId)
  }

  @Post('add-cod')
  @Roles(roleName.DRIVER) // Driver can add COD when they received cash
  async addCodToDriver(
    @ActiveUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(AddCodSchema)) body: AddCodDto,
  ) {
    return this.walletService.addCodToDriver(user.userId, body.orderId, body.amount)
  }

  @Post('reconcile-cod')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF) // Admins/Managers reconcile COD
  async reconcileCodForDriver(
    @ActiveUser() admin: AccessTokenPayload,
    @Body(new ZodValidationPipe(ReconcileCodSchema)) body: ReconcileCodDto,
  ) {
    return this.walletService.reconcileCodForDriver(
      admin.userId,
      body.driverId,
      body.amount,
      body.referenceId,
      body.description,
    )
  }

  @Get('cod/outstanding')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  async getOutstandingCod(@ActiveUser() user: AccessTokenPayload, @Query() rawQuery: Record<string, unknown>) {
    // Query pipe hiện tại chỉ validate body, nên query được parse trực tiếp bằng Zod
    // để vẫn giữ error envelope thống nhất qua AllExceptionsFilter.
    const query = OutstandingCodQuerySchema.parse(rawQuery)
    return this.walletService.getOutstandingCod(user, query)
  }

  @Post('cod/settlement-batches')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  async createSettlementBatch(
    @ActiveUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateSettlementBatchSchema)) body: CreateSettlementBatchDto,
  ) {
    return this.walletService.createSettlementBatch(user, body)
  }

  @Get('cod/settlement-batches')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  async listSettlementBatches(@ActiveUser() user: AccessTokenPayload, @Query() rawQuery: Record<string, unknown>) {
    const query = ListSettlementBatchesQuerySchema.parse(rawQuery)
    return this.walletService.listSettlementBatches(user, query)
  }

  @Get('cod/settlement-batches/:id')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  async getSettlementBatch(@ActiveUser() user: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    return this.walletService.getSettlementBatch(user, id)
  }

  @Post('cod/settlement-batches/:id/complete')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  async completeSettlementBatch(
    @ActiveUser() user: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(CompleteSettlementBatchSchema)) body: CompleteSettlementBatchDto,
  ) {
    return this.walletService.completeSettlementBatch(user, id, body)
  }

  @Post('cod/settlement-batches/:id/dispute')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  async disputeSettlementBatch(
    @ActiveUser() user: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(DisputeSettlementBatchSchema)) body: DisputeSettlementBatchDto,
  ) {
    return this.walletService.disputeSettlementBatch(user, id, body)
  }

  @Get('cod/settlement-batches/:id/export')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  async exportSettlementBatch(
    @ActiveUser() user: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Res() response: Response,
  ) {
    const csv = await this.walletService.exportSettlementBatchCsv(user, id)
    response.setHeader('Content-Type', 'text/csv; charset=utf-8')
    response.setHeader('Content-Disposition', `attachment; filename="cod-settlement-${id}.csv"`)
    response.send(csv)
  }
}
