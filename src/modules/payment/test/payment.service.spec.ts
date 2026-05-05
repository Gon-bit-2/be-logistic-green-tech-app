import { Test, TestingModule } from '@nestjs/testing'
import { PaymentService } from '../service/payment.service'
import { PaymentRepository } from '../repository/payment.repo'
import { PrismaService } from 'src/database/prisma.service'
import { BadRequestException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import * as StripeModule from 'stripe' // Import to mock
import roleName from 'src/common/constants/role.constant'
import { CodSettlementService } from 'src/common/services/cod-settlement.service'

jest.mock('src/config/config', () => ({
  STRIPE_SECRET_KEY: 'test_sec_key',
  STRIPE_WEBHOOK_SECRET: 'secret',
}))

// Mock the Stripe module fully
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => {
    return {
      paymentIntents: {
        create: jest.fn(),
        retrieve: jest.fn(),
      },
      webhooks: {
        constructEvent: jest.fn(),
      },
    }
  })
})

describe('PaymentService', () => {
  let service: PaymentService
  let paymentRepo: jest.Mocked<PaymentRepository>
  let prismaService: any
  let prismaTransactionClient: any
  let stripeMockIntance: any // Used to assert stripe calls

  beforeEach(async () => {
    const paymentRepoMock = {
      upsertPayment: jest.fn(),
      updateCodPayment: jest.fn(),
      updateByTransactionId: jest.fn(),
      findByOrderId: jest.fn(),
    }

    prismaTransactionClient = {
      order: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payment: {
        create: jest.fn(),
        update: jest.fn(),
      },
      transaction: {
        create: jest.fn(),
      },
      wallet: {
        upsert: jest.fn(),
        update: jest.fn(),
      },
    }

    const prismaServiceMock = {
      order: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (tx: any) => Promise<unknown>) => callback(prismaTransactionClient)),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService, // stripe instance will be initialised here
        CodSettlementService,
        {
          provide: PaymentRepository,
          useValue: paymentRepoMock,
        },
        {
          provide: PrismaService,
          useValue: prismaServiceMock,
        },
      ],
    }).compile()

    service = module.get<PaymentService>(PaymentService)
    paymentRepo = module.get(PaymentRepository)
    prismaService = module.get(PrismaService)

    // Grab the mocked instance of stripe to assert inner calls
    stripeMockIntance = (service as any).stripe
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('createPaymentIntent', () => {
    it('Tạo intent bình thường khi input hợp lệ', async () => {
      prismaService.order.findUnique.mockResolvedValue({
        id: 10,
        customerId: 1,
        shippingFee: 15000,
        payment: null,
      })
      stripeMockIntance.paymentIntents.create.mockResolvedValue({
        id: 'pi_123',
        client_secret: 'secret_abc',
      })

      const res = await service.createPaymentIntent(10, 1)

      expect(res).toEqual({ clientSecret: 'secret_abc', transactionId: 'pi_123', amount: 15000 })
      expect(stripeMockIntance.paymentIntents.create).toHaveBeenCalledWith(
        {
          amount: 15000,
          currency: 'vnd',
          metadata: { orderId: '10' },
        },
        {
          idempotencyKey: 'payment-intent-order-10',
        },
      )
      expect(paymentRepo.upsertPayment).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ transactionId: 'pi_123', status: 'PENDING' }),
        expect.anything(),
      )
    })

    it('làm tròn shipping fee thập phân trước khi gửi sang Stripe với VND', async () => {
      prismaService.order.findUnique.mockResolvedValue({
        id: 21,
        customerId: 1,
        shippingFee: 26089.8,
        payment: null,
      })
      stripeMockIntance.paymentIntents.create.mockResolvedValue({
        id: 'pi_decimal',
        client_secret: 'secret_decimal',
      })

      const res = await service.createPaymentIntent(21, 1)

      expect(res).toEqual({ clientSecret: 'secret_decimal', transactionId: 'pi_decimal', amount: 26090 })
      expect(stripeMockIntance.paymentIntents.create).toHaveBeenCalledWith(
        {
          amount: 26090,
          currency: 'vnd',
          metadata: { orderId: '21' },
        },
        {
          idempotencyKey: 'payment-intent-order-21',
        },
      )
      expect(paymentRepo.upsertPayment).toHaveBeenCalledWith(
        21,
        expect.objectContaining({ amount: 26090, transactionId: 'pi_decimal' }),
        expect.objectContaining({ amount: 26090 }),
      )
    })

    it('tái sử dụng payment intent pending hiện có để tránh tạo lặp', async () => {
      prismaService.order.findUnique.mockResolvedValue({
        id: 10,
        customerId: 1,
        shippingFee: 15000,
        payment: { status: 'PENDING', method: 'STRIPE', transactionId: 'pi_existing' },
      })
      stripeMockIntance.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_existing',
        client_secret: 'secret_existing',
        status: 'requires_payment_method',
      })

      const res = await service.createPaymentIntent(10, 1)

      expect(res).toEqual({ clientSecret: 'secret_existing', transactionId: 'pi_existing', amount: 15000 })
      expect(stripeMockIntance.paymentIntents.retrieve).toHaveBeenCalledWith('pi_existing')
      expect(stripeMockIntance.paymentIntents.create).not.toHaveBeenCalled()
      expect(paymentRepo.upsertPayment).not.toHaveBeenCalled()
    })

    it('tạo intent mới với retry idempotency key khi intent cũ không còn tái sử dụng được', async () => {
      prismaService.order.findUnique.mockResolvedValue({
        id: 10,
        customerId: 1,
        shippingFee: 15000,
        payment: { status: 'PENDING', method: 'STRIPE', transactionId: 'pi_old' },
      })
      stripeMockIntance.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_old',
        client_secret: 'secret_old',
        status: 'succeeded',
      })
      stripeMockIntance.paymentIntents.create.mockResolvedValue({
        id: 'pi_new',
        client_secret: 'secret_new',
      })

      const res = await service.createPaymentIntent(10, 1)

      expect(res).toEqual({ clientSecret: 'secret_new', transactionId: 'pi_new', amount: 15000 })
      expect(stripeMockIntance.paymentIntents.retrieve).toHaveBeenCalledWith('pi_old')
      expect(stripeMockIntance.paymentIntents.create).toHaveBeenCalledWith(
        {
          amount: 15000,
          currency: 'vnd',
          metadata: { orderId: '10' },
        },
        {
          idempotencyKey: 'payment-intent-order-10-retry-pi_old',
        },
      )
      expect(paymentRepo.upsertPayment).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ transactionId: 'pi_new', status: 'PENDING' }),
        expect.objectContaining({ transactionId: 'pi_new', amount: 15000 }),
      )
    })

    it('văng NotFoundException nếu order k tồn tại', async () => {
      prismaService.order.findUnique.mockResolvedValue(null)
      await expect(service.createPaymentIntent(10, 1)).rejects.toThrow(NotFoundException)
    })

    it('văng BadRequestException nếu ko phải chủ order', async () => {
      prismaService.order.findUnique.mockResolvedValue({ id: 10, customerId: 99 })
      await expect(service.createPaymentIntent(10, 1)).rejects.toThrow(BadRequestException)
    })

    it('văng BadRequestException nếu order đã thanh toán completed', async () => {
      prismaService.order.findUnique.mockResolvedValue({
        id: 10,
        customerId: 1,
        payment: { status: 'COMPLETED' },
      })
      await expect(service.createPaymentIntent(10, 1)).rejects.toThrow(BadRequestException)
    })

    it('văng BadRequestException nếu order đang được đánh dấu COD', async () => {
      prismaService.order.findUnique.mockResolvedValue({
        id: 10,
        customerId: 1,
        shippingFee: 15000,
        payment: { status: 'PENDING', method: 'COD' },
      })

      await expect(service.createPaymentIntent(10, 1)).rejects.toThrow(BadRequestException)
      expect(stripeMockIntance.paymentIntents.create).not.toHaveBeenCalled()
    })
  })

  describe('confirmCOD', () => {
    it('nhập payment COD thành công khi chưa thanh toán lần nào', async () => {
      prismaTransactionClient.order.findUnique.mockResolvedValue({
        id: 10,
        shippingFee: 20000,
        trackingCode: 'ORD010',
        isCodCollected: false,
        payment: null,
      })
      prismaTransactionClient.wallet.upsert.mockResolvedValue({ id: 501 })

      const res = await service.confirmCOD(10, 99) // driverId = 99

      expect(res).toEqual({ success: true, message: 'Đã xác nhận thu hộ tiền mặt (COD) thành công' })
      expect(prismaService.$transaction).toHaveBeenCalled()
      expect(prismaTransactionClient.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 10,
          amount: 20000,
          method: 'COD',
          status: 'COMPLETED',
          createdById: 99,
          updatedById: 99,
        }),
      })
      expect(prismaTransactionClient.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          walletId: 501,
          amount: 20000,
          type: 'COD_COLLECTION',
          status: 'COMPLETED',
          referenceId: 'ORDER_10',
        }),
      })
      expect(prismaTransactionClient.order.updateMany).toHaveBeenCalledWith({
        where: { id: 10, isCodCollected: false },
        data: expect.objectContaining({
          codAmount: 20000,
          isCodCollected: true,
        }),
      })
    })

    it('làm tròn shipping fee thập phân khi xác nhận COD', async () => {
      prismaTransactionClient.order.findUnique.mockResolvedValue({
        id: 10,
        shippingFee: 26089.8,
        trackingCode: 'ORD010',
        isCodCollected: false,
        payment: null,
      })
      prismaTransactionClient.wallet.upsert.mockResolvedValue({ id: 501 })

      await service.confirmCOD(10, 99)

      expect(prismaTransactionClient.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ amount: 26090, method: 'COD', status: 'COMPLETED' }),
      })
    })

    it('chỉ update driver COD khi payment COD đã được create hờ trc đó nhưng chưa thanh toán', async () => {
      prismaTransactionClient.order.findUnique.mockResolvedValue({
        id: 10,
        shippingFee: 20000,
        trackingCode: 'ORD010',
        isCodCollected: false,
        payment: { status: 'PENDING', method: 'COD' },
      })
      prismaTransactionClient.wallet.upsert.mockResolvedValue({ id: 501 })

      const res = await service.confirmCOD(10, 99)
      expect(res.success).toBe(true)
      expect(prismaTransactionClient.payment.update).toHaveBeenCalledWith({
        where: { orderId: 10 },
        data: expect.objectContaining({ method: 'COD', status: 'COMPLETED', updatedById: 99 }),
      })
    })

    it('văng BadRequestException nếu hóa đơn đã đc thanh toán', async () => {
      prismaTransactionClient.order.findUnique.mockResolvedValue({
        id: 10,
        isCodCollected: false,
        payment: { status: 'COMPLETED' },
      })
      await expect(service.confirmCOD(10, 99)).rejects.toThrow(BadRequestException)
    })

    it('chặn confirmCOD trên đơn thanh toán online', async () => {
      prismaTransactionClient.order.findUnique.mockResolvedValue({
        id: 10,
        isCodCollected: false,
        payment: { status: 'PENDING', method: 'STRIPE' },
      })

      await expect(service.confirmCOD(10, 99)).rejects.toThrow(BadRequestException)
      expect(prismaTransactionClient.payment.update).not.toHaveBeenCalled()
    })
  })

  describe('handleStripeWebhook', () => {
    it('cập nhật list payment COMPLETED khi stripe call payment_intent.succeeded', async () => {
      stripeMockIntance.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_abc' } },
      })

      const res = await service.handleStripeWebhook('signature', Buffer.from('{}'))

      expect(res).toEqual({ received: true })
      expect(paymentRepo.updateByTransactionId).toHaveBeenCalledWith('pi_abc', 'COMPLETED', expect.any(Date))
    })

    it('cập nhật list payment FAILED khi stripe call payment_intent.payment_failed', async () => {
      stripeMockIntance.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.payment_failed',
        data: { object: { id: 'pi_fail' } },
      })

      const res = await service.handleStripeWebhook('signature', Buffer.from('{}'))
      expect(res).toEqual({ received: true })
      expect(paymentRepo.updateByTransactionId).toHaveBeenCalledWith('pi_fail', 'FAILED')
    })

    it('văng  BadRequestException khi signaure sai', async () => {
      stripeMockIntance.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('invalid sig')
      })

      await expect(service.handleStripeWebhook('bad-sig', Buffer.from('{}'))).rejects.toThrow(BadRequestException)
    })

    it('bypass các loại event k liên quan, return OK', async () => {
      stripeMockIntance.webhooks.constructEvent.mockReturnValue({
        type: 'some_other_type',
        data: { object: { id: 'evt' } },
      })

      const res = await service.handleStripeWebhook('signature', Buffer.from('{}'))
      expect(res).toEqual({ received: true })
      expect(paymentRepo.updateByTransactionId).not.toHaveBeenCalled()
    })

    it('từ chối webhook nếu chưa cấu hình webhook secret', async () => {
      const envConfig = require('src/config/config')
      const previousSecret = envConfig.STRIPE_WEBHOOK_SECRET
      envConfig.STRIPE_WEBHOOK_SECRET = undefined

      await expect(service.handleStripeWebhook('signature', Buffer.from('{}'))).rejects.toThrow(
        ServiceUnavailableException,
      )

      envConfig.STRIPE_WEBHOOK_SECRET = previousSecret
      expect(stripeMockIntance.webhooks.constructEvent).not.toHaveBeenCalled()
    })
  })

  describe('getPaymentByOrderId', () => {
    it('gọi findByOrderId của repo', async () => {
      paymentRepo.findByOrderId.mockResolvedValue({ id: 1 } as any)
      const res = await service.getPaymentByOrderId(1)
      expect(res).toEqual({ id: 1 })
      expect(paymentRepo.findByOrderId).toHaveBeenCalledWith(1)
    })

    it('customer chỉ xem được payment của order thuộc sở hữu của mình', async () => {
      prismaService.order.findUnique.mockResolvedValue({ customerId: 7 })
      paymentRepo.findByOrderId.mockResolvedValue({ id: 1 } as any)

      await service.getPaymentByOrderId(1, {
        userId: 7,
        deviceId: 1,
        roleId: 2,
        roleName: roleName.CUSTOMER,
        exp: 1,
        iat: 1,
      })

      expect(prismaService.order.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: { customerId: true },
      })
      expect(paymentRepo.findByOrderId).toHaveBeenCalledWith(1)
    })

    it('customer bị chặn nếu order không thuộc sở hữu của mình', async () => {
      prismaService.order.findUnique.mockResolvedValue({ customerId: 8 })

      await expect(
        service.getPaymentByOrderId(1, {
          userId: 7,
          deviceId: 1,
          roleId: 2,
          roleName: roleName.CUSTOMER,
          exp: 1,
          iat: 1,
        }),
      ).rejects.toThrow(ForbiddenException)

      expect(paymentRepo.findByOrderId).not.toHaveBeenCalled()
    })
  })
})
