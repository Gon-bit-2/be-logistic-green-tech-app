import { ActiveUser } from '@src/common/decorators/active-user.decorator'
import { Roles } from '@src/common/decorators/roles.decorator'
import { RolesGuard } from '@src/common/guards/roles.guard'
import type { AccessTokenPayload } from '@src/common/types/jwt.type'
import { ZodValidationPipe } from '@src/common/pipes/zod.pipe'
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common'
import type { Response } from 'express'
import { ZodSerializerDto } from 'nestjs-zod'
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
  CodSettlementBatchResponseDto,
  OutstandingCodOrderListDto,
  SettlementBatchListResponseDto,
  WalletResponseDto,
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

/**
 * Controller for managing driver digital wallets, COD cash collections, and financial settlement batches.
 * 
 * Controller quản lý ví điện tử của tài xế, việc thu tiền mặt COD và các lô/đợt quyết toán tài chính.
 */
@UseGuards(RolesGuard)
@Controller('wallet')
export class WalletController {
  /**
   * Initializes the WalletController.
   * 
   * Khởi tạo WalletController.
   * 
   * @param walletService - The Wallet service instance / Instance của dịch vụ ví.
   */
  constructor(private readonly walletService: WalletService) {}

  /**
   * Retrieves the wallet details of the currently logged-in driver.
   * Only accessible by Driver.
   * 
   * Lấy chi tiết thông tin ví của tài xế đang đăng nhập.
   * Chỉ có thể truy cập bởi Tài xế.
   * 
   * @param user - Active user JWT payload / Payload JWT của người dùng đang đăng nhập.
   * @returns Driver wallet balance and metadata / Số dư ví tài xế và siêu dữ liệu.
   */
  @Get('my-wallet')
  @Roles(roleName.DRIVER) // Driver only
  @ZodSerializerDto(WalletResponseDto)
  async getMyWallet(@ActiveUser() user: AccessTokenPayload) {
    return this.walletService.getMyWallet(user.userId)
  }

  /**
   * Manually adds a collected COD cash amount to the driver's wallet.
   * Only accessible by Driver.
   * 
   * Thêm thủ công một lượng tiền COD thu được vào ví của tài xế.
   * Chỉ có thể truy cập bởi Tài xế.
   * 
   * @param user - Active driver user JWT payload / Payload JWT của tài xế đang thực hiện.
   * @param body - Input details of order ID and amount / Chi tiết đầu vào gồm ID đơn hàng và số tiền.
   * @returns Updated driver wallet balance / Số dư ví tài xế sau khi cập nhật.
   */
  @Post('add-cod')
  @HttpCode(HttpStatus.OK)
  @Roles(roleName.DRIVER) // Driver can add COD when they received cash
  @ZodSerializerDto(WalletResponseDto)
  async addCodToDriver(
    @ActiveUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(AddCodSchema)) body: AddCodDto,
  ) {
    return this.walletService.addCodToDriver(user.userId, body.orderId, body.amount)
  }

  /**
   * Reconciles (completes hand-over of) driver's collected cash at a hub.
   * Accessible by Admin and Warehouse Staff.
   * 
   * Quyết toán và đối soát (hoàn tất bàn giao) số tiền mặt tài xế thu được tại kho.
   * Có thể truy cập bởi Admin và Nhân viên kho.
   * 
   * @param admin - Active admin user JWT payload / Payload JWT của admin/nhân viên kho đang thực hiện.
   * @param body - Reconciliation details including driver ID, amount, and reference / Chi tiết đối soát gồm ID tài xế, số tiền và mã tham chiếu.
   * @returns Reconciled driver wallet balance / Số dư ví tài xế sau khi đối soát.
   */
  @Post('reconcile-cod')
  @HttpCode(HttpStatus.OK)
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF) // Admins/Managers reconcile COD
  @ZodSerializerDto(WalletResponseDto)
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

  /**
   * Retrieves a list of outstanding COD orders that need to be handed over.
   * Accessible by Admin, Warehouse Staff, and Driver.
   * 
   * Lấy danh sách các đơn hàng COD đang tồn đọng cần phải bàn giao tiền mặt.
   * Có thể truy cập bởi Admin, Nhân viên kho và Tài xế.
   * 
   * @param user - Active user JWT payload / Payload JWT của người dùng đang đăng nhập.
   * @param rawQuery - Query filters / Các bộ lọc truy vấn thô.
   * @returns List of outstanding COD orders / Danh sách các đơn hàng COD tồn đọng.
   */
  @Get('cod/outstanding')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  @ZodSerializerDto(OutstandingCodOrderListDto)
  async getOutstandingCod(@ActiveUser() user: AccessTokenPayload, @Query() rawQuery: Record<string, unknown>) {
    // Query pipe hiện tại chỉ validate body, nên query được parse trực tiếp bằng Zod
    // để vẫn giữ error envelope thống nhất qua AllExceptionsFilter.
    const query = OutstandingCodQuerySchema.parse(rawQuery)
    return this.walletService.getOutstandingCod(user, query)
  }

  /**
   * Creates a new financial settlement batch for COD hand-overs.
   * Accessible by Admin and Warehouse Staff.
   * 
   * Tạo một lô/đợt quyết toán tài chính mới cho việc bàn giao tiền COD.
   * Có thể truy cập bởi Admin và Nhân viên kho.
   * 
   * @param user - Active user JWT payload / Payload JWT của người dùng đang đăng nhập.
   * @param body - Settlement batch creation details / Chi tiết tạo lô quyết toán.
   * @returns Detailed information of the newly created batch / Chi tiết thông tin của lô vừa được tạo.
   */
  @Post('cod/settlement-batches')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  @ZodSerializerDto(CodSettlementBatchResponseDto)
  async createSettlementBatch(
    @ActiveUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateSettlementBatchSchema)) body: CreateSettlementBatchDto,
  ) {
    return this.walletService.createSettlementBatch(user, body)
  }

  /**
   * Lists all existing COD settlement batches with optional filters.
   * Accessible by Admin, Warehouse Staff, and Driver.
   * 
   * Danh sách tất cả các lô quyết toán COD hiện có với các bộ lọc tùy chọn.
   * Có thể truy cập bởi Admin, Nhân viên kho và Tài xế.
   * 
   * @param user - Active user JWT payload / Payload JWT của người dùng đang đăng nhập.
   * @param rawQuery - Search and filter parameters / Các tham số lọc và tìm kiếm.
   * @returns Paginated list of settlement batches / Danh sách các lô quyết toán.
   */
  @Get('cod/settlement-batches')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  @ZodSerializerDto(SettlementBatchListResponseDto)
  async listSettlementBatches(@ActiveUser() user: AccessTokenPayload, @Query() rawQuery: Record<string, unknown>) {
    const query = ListSettlementBatchesQuerySchema.parse(rawQuery)
    return this.walletService.listSettlementBatches(user, query)
  }

  /**
   * Retrieves details of a specific COD settlement batch by ID.
   * Accessible by Admin, Warehouse Staff, and Driver.
   * 
   * Lấy chi tiết thông tin của một lô quyết toán COD cụ thể theo ID.
   * Có thể truy cập bởi Admin, Nhân viên kho và Tài xế.
   * 
   * @param user - Active user JWT payload / Payload JWT của người dùng đang đăng nhập.
   * @param id - Settlement batch ID / ID lô quyết toán.
   * @returns Detailed info of the settlement batch / Chi tiết thông tin của lô quyết toán.
   */
  @Get('cod/settlement-batches/:id')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  @ZodSerializerDto(CodSettlementBatchResponseDto)
  async getSettlementBatch(@ActiveUser() user: AccessTokenPayload, @Param('id', ParseIntPipe) id: number) {
    return this.walletService.getSettlementBatch(user, id)
  }

  /**
   * Marks a specific COD settlement batch as completed/approved.
   * Accessible by Admin and Warehouse Staff.
   * 
   * Đánh dấu hoàn tất/phê duyệt một lô quyết toán COD cụ thể.
   * Có thể truy cập bởi Admin và Nhân viên kho.
   * 
   * @param user - Active user JWT payload / Payload JWT của người dùng đang đăng nhập.
   * @param id - Settlement batch ID / ID lô quyết toán.
   * @param body - Approval details (e.g. notes) / Chi tiết phê duyệt (ví dụ: ghi chú).
   * @returns Updated settlement batch info / Thông tin lô quyết toán sau khi cập nhật.
   */
  @Post('cod/settlement-batches/:id/complete')
  @HttpCode(HttpStatus.OK)
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  @ZodSerializerDto(CodSettlementBatchResponseDto)
  async completeSettlementBatch(
    @ActiveUser() user: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(CompleteSettlementBatchSchema)) body: CompleteSettlementBatchDto,
  ) {
    return this.walletService.completeSettlementBatch(user, id, body)
  }

  /**
   * Places a specific COD settlement batch in a disputed state due to discrepancies.
   * Accessible by Admin and Warehouse Staff.
   * 
   * Đưa một lô quyết toán COD cụ thể vào trạng thái tranh chấp do sai lệch số liệu.
   * Có thể truy cập bởi Admin và Nhân viên kho.
   * 
   * @param user - Active user JWT payload / Payload JWT của người dùng đang đăng nhập.
   * @param id - Settlement batch ID / ID lô quyết toán.
   * @param body - Dispute reason details / Chi tiết lý do tranh chấp.
   * @returns Updated settlement batch info / Thông tin lô quyết toán sau khi cập nhật.
   */
  @Post('cod/settlement-batches/:id/dispute')
  @HttpCode(HttpStatus.OK)
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF)
  @ZodSerializerDto(CodSettlementBatchResponseDto)
  async disputeSettlementBatch(
    @ActiveUser() user: AccessTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(DisputeSettlementBatchSchema)) body: DisputeSettlementBatchDto,
  ) {
    return this.walletService.disputeSettlementBatch(user, id, body)
  }

  /**
   * Exports settlement batch details to a downloadable CSV format.
   * Accessible by Admin, Warehouse Staff, and Driver.
   * 
   * Xuất chi tiết thông tin của lô quyết toán thành định dạng tệp tải xuống CSV.
   * Có thể truy cập bởi Admin, Nhân viên kho và Tài xế.
   * 
   * @param user - Active user JWT payload / Payload JWT của người dùng đang đăng nhập.
   * @param id - Settlement batch ID / ID lô quyết toán.
   * @param response - Express response object to send CSV attachment / Đối tượng response của Express để gửi tệp CSV.
   */
  @Get('cod/settlement-batches/:id/export')
  @Roles(roleName.ADMIN, roleName.WAREHOUSE_STAFF, roleName.DRIVER)
  // CSV export uses @Res(), so it intentionally bypasses ZodSerializerInterceptor.
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
