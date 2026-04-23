import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { PaymentController } from '../src/modules/payment/controller/payment.controller'
import { PaymentService } from '../src/modules/payment/service/payment.service'
import { createHttpTestApp } from './helpers/create-http-test-app'
describe('Payment API', () => {
  let app: INestApplication
  const paymentService = {
    createPaymentIntent: jest.fn(),
    confirmCOD: jest.fn(),
    getPaymentByOrderId: jest.fn(),
    handleStripeWebhook: jest.fn(),
  }

  beforeAll(async () => {
    const testApp = await createHttpTestApp({
      controllers: [PaymentController],
      providers: [{ provide: PaymentService, useValue: paymentService }],
      attachRawBody: true,
    })

    app = testApp.app
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(async () => {
    await app.close()
  })

  it('POST /payments/webhook rejects requests without stripe-signature', async () => {
    await request(app.getHttpServer()).post('/payments/webhook').send({ type: 'payment_intent.succeeded' }).expect(400)
  })

  it('POST /payments/webhook forwards signature and raw payload buffer', async () => {
    paymentService.handleStripeWebhook.mockResolvedValue({ received: true })

    await request(app.getHttpServer())
      .post('/payments/webhook')
      .set('stripe-signature', 'sig_test')
      .send({ type: 'payment_intent.succeeded' })
      .expect(201)
      .expect({ received: true })

    expect(paymentService.handleStripeWebhook).toHaveBeenCalledWith('sig_test', expect.any(Buffer))
    expect(paymentService.handleStripeWebhook.mock.calls[0][1].toString()).toContain('payment_intent.succeeded')
  })

  it('POST /payments/create-intent/:orderId injects active user', async () => {
    paymentService.createPaymentIntent.mockResolvedValue({
      clientSecret: 'cs',
      transactionId: 'pi_1',
      amount: 45000,
    })

    await request(app.getHttpServer()).post('/payments/create-intent/7').expect(201)

    expect(paymentService.createPaymentIntent).toHaveBeenCalledWith(7, 99)
  })

  it('GET /payments/order/:orderId forwards active user context', async () => {
    paymentService.getPaymentByOrderId.mockResolvedValue(null)

    await request(app.getHttpServer()).get('/payments/order/7').expect(200)

    expect(paymentService.getPaymentByOrderId).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        userId: 99,
        roleName: 'ADMIN',
      }),
    )
  })
})
