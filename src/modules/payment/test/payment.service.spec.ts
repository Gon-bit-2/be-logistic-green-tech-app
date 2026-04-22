import { Test, TestingModule } from '@nestjs/testing';
import { PaymentService } from '../service/payment.service';
import { PaymentRepository } from '../repository/payment.repo';
import { PrismaService } from 'src/database/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as StripeModule from 'stripe'; // Import to mock

jest.mock('src/config/config', () => ({
  STRIPE_SECRET_KEY: 'test_sec_key',
  STRIPE_WEBHOOK_SECRET: 'secret',
}));

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
    };
  });
});

describe('PaymentService', () => {
  let service: PaymentService;
  let paymentRepo: jest.Mocked<PaymentRepository>;
  let prismaService: any;
  let stripeMockIntance: any; // Used to assert stripe calls

  beforeEach(async () => {
    const paymentRepoMock = {
      upsertPayment: jest.fn(),
      updateCodPayment: jest.fn(),
      updateByTransactionId: jest.fn(),
      findByOrderId: jest.fn(),
    };

    const prismaServiceMock = {
      order: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService, // stripe instance will be initialised here
        {
          provide: PaymentRepository,
          useValue: paymentRepoMock,
        },
        {
          provide: PrismaService,
          useValue: prismaServiceMock,
        },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
    paymentRepo = module.get(PaymentRepository);
    prismaService = module.get(PrismaService);
    
    // Grab the mocked instance of stripe to assert inner calls
    stripeMockIntance = (service as any).stripe;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createPaymentIntent', () => {
    it('Tạo intent bình thường khi input hợp lệ', async () => {
      prismaService.order.findUnique.mockResolvedValue({ 
        id: 10, customerId: 1, shippingFee: 15000, payment: null 
      });
      stripeMockIntance.paymentIntents.create.mockResolvedValue({
        id: 'pi_123', client_secret: 'secret_abc'
      });

      const res = await service.createPaymentIntent(10, 1);

      expect(res).toEqual({ clientSecret: 'secret_abc', transactionId: 'pi_123', amount: 15000 });
      expect(stripeMockIntance.paymentIntents.create).toHaveBeenCalledWith({
        amount: 15000,
        currency: 'vnd',
        metadata: { orderId: '10' }
      }, {
        idempotencyKey: 'payment-intent-order-10'
      });
      expect(paymentRepo.upsertPayment).toHaveBeenCalledWith(
        10, 
        expect.objectContaining({ transactionId: 'pi_123', status: 'PENDING' }), 
        expect.anything()
      );
    });

    it('làm tròn shipping fee thập phân trước khi gửi sang Stripe với VND', async () => {
      prismaService.order.findUnique.mockResolvedValue({
        id: 21, customerId: 1, shippingFee: 26089.8, payment: null
      });
      stripeMockIntance.paymentIntents.create.mockResolvedValue({
        id: 'pi_decimal', client_secret: 'secret_decimal'
      });

      const res = await service.createPaymentIntent(21, 1);

      expect(res).toEqual({ clientSecret: 'secret_decimal', transactionId: 'pi_decimal', amount: 26090 });
      expect(stripeMockIntance.paymentIntents.create).toHaveBeenCalledWith({
        amount: 26090,
        currency: 'vnd',
        metadata: { orderId: '21' }
      }, {
        idempotencyKey: 'payment-intent-order-21'
      });
      expect(paymentRepo.upsertPayment).toHaveBeenCalledWith(
        21,
        expect.objectContaining({ amount: 26090, transactionId: 'pi_decimal' }),
        expect.objectContaining({ amount: 26090 })
      );
    });

    it('tái sử dụng payment intent pending hiện có để tránh tạo lặp', async () => {
      prismaService.order.findUnique.mockResolvedValue({
        id: 10,
        customerId: 1,
        shippingFee: 15000,
        payment: { status: 'PENDING', method: 'STRIPE', transactionId: 'pi_existing' },
      });
      stripeMockIntance.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_existing',
        client_secret: 'secret_existing',
        status: 'requires_payment_method',
      });

      const res = await service.createPaymentIntent(10, 1);

      expect(res).toEqual({ clientSecret: 'secret_existing', transactionId: 'pi_existing', amount: 15000 });
      expect(stripeMockIntance.paymentIntents.retrieve).toHaveBeenCalledWith('pi_existing');
      expect(stripeMockIntance.paymentIntents.create).not.toHaveBeenCalled();
      expect(paymentRepo.upsertPayment).not.toHaveBeenCalled();
    });

    it('văng NotFoundException nếu order k tồn tại', async () => {
      prismaService.order.findUnique.mockResolvedValue(null);
      await expect(service.createPaymentIntent(10, 1)).rejects.toThrow(NotFoundException);
    });

    it('văng BadRequestException nếu ko phải chủ order', async () => {
      prismaService.order.findUnique.mockResolvedValue({ id: 10, customerId: 99 });
      await expect(service.createPaymentIntent(10, 1)).rejects.toThrow(BadRequestException);
    });

    it('văng BadRequestException nếu order đã thanh toán completed', async () => {
      prismaService.order.findUnique.mockResolvedValue({ 
        id: 10, customerId: 1, payment: { status: 'COMPLETED' } 
      });
      await expect(service.createPaymentIntent(10, 1)).rejects.toThrow(BadRequestException);
    });
  });

  describe('confirmCOD', () => {
    it('nhập payment COD thành công khi chưa thanh toán lần nào', async () => {
      prismaService.order.findUnique.mockResolvedValue({ 
        id: 10, shippingFee: 20000, payment: null 
      });

      const res = await service.confirmCOD(10, 99); // driverId = 99

      expect(res).toEqual({ success: true, message: 'Đã xác nhận thu hộ tiền mặt (COD) thành công' });
      expect(paymentRepo.upsertPayment).toHaveBeenCalledWith(
        10, 
        expect.objectContaining({ method: 'COD', status: 'COMPLETED', createdById: 99 }), 
        expect.anything() // third arg is the conflict condition object {}
      );
    });

    it('làm tròn shipping fee thập phân khi xác nhận COD', async () => {
      prismaService.order.findUnique.mockResolvedValue({
        id: 10, shippingFee: 26089.8, payment: null
      });

      await service.confirmCOD(10, 99);

      expect(paymentRepo.upsertPayment).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ amount: 26090, method: 'COD', status: 'COMPLETED' }),
        expect.anything()
      );
    });

    it('chỉ update driver COD khi payment COD đã được create hờ trc đó nhưng chưa thanh toán', async () => {
      prismaService.order.findUnique.mockResolvedValue({ 
        id: 10, payment: { status: 'PENDING', method: 'COD' } 
      });

      const res = await service.confirmCOD(10, 99);
      expect(res.success).toBe(true);
      expect(paymentRepo.updateCodPayment).toHaveBeenCalledWith(10, 99);
    });

    it('văng BadRequestException nếu hóa đơn đã đc thanh toán', async () => {
      prismaService.order.findUnique.mockResolvedValue({ 
        id: 10, payment: { status: 'COMPLETED' } 
      });
      await expect(service.confirmCOD(10, 99)).rejects.toThrow(BadRequestException);
    });
  });

  describe('handleStripeWebhook', () => {
    it('cập nhật list payment COMPLETED khi stripe call payment_intent.succeeded', async () => {
      stripeMockIntance.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_abc' } }
      });

      const res = await service.handleStripeWebhook('signature', Buffer.from('{}'));
      
      expect(res).toEqual({ received: true });
      expect(paymentRepo.updateByTransactionId).toHaveBeenCalledWith('pi_abc', 'COMPLETED', expect.any(Date));
    });

    it('cập nhật list payment FAILED khi stripe call payment_intent.payment_failed', async () => {
      stripeMockIntance.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.payment_failed',
        data: { object: { id: 'pi_fail' } }
      });

      const res = await service.handleStripeWebhook('signature', Buffer.from('{}'));
      expect(res).toEqual({ received: true });
      expect(paymentRepo.updateByTransactionId).toHaveBeenCalledWith('pi_fail', 'FAILED');
    });

    it('văng  BadRequestException khi signaure sai', async () => {
      stripeMockIntance.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('invalid sig');
      });

      await expect(service.handleStripeWebhook('bad-sig', Buffer.from('{}'))).rejects.toThrow(BadRequestException);
    });

    it('bypass các loại event k liên quan, return OK', async () => {
      stripeMockIntance.webhooks.constructEvent.mockReturnValue({
        type: 'some_other_type',
        data: { object: { id: 'evt' } }
      });

      const res = await service.handleStripeWebhook('signature', Buffer.from('{}'));
      expect(res).toEqual({ received: true });
      expect(paymentRepo.updateByTransactionId).not.toHaveBeenCalled();
    });
  });

  describe('getPaymentByOrderId', () => {
    it('gọi findByOrderId của repo', async () => {
      paymentRepo.findByOrderId.mockResolvedValue({ id: 1 } as any);
      const res = await service.getPaymentByOrderId(1);
      expect(res).toEqual({ id: 1 });
      expect(paymentRepo.findByOrderId).toHaveBeenCalledWith(1);
    });
  });
});
