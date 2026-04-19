import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { OrdersController } from '../src/modules/orders/controller/orders.controller'
import { OrdersService } from '../src/modules/orders/service/orders.service'
import { createHttpTestApp } from './helpers/create-http-test-app'

describe('Orders API', () => {
  let app: INestApplication
  const ordersService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  }

  beforeAll(async () => {
    const testApp = await createHttpTestApp({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: ordersService }],
    })

    app = testApp.app
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(async () => {
    await app.close()
  })

  it('POST /orders injects active user and forwards a valid payload', async () => {
    ordersService.create.mockResolvedValue({ order: { id: 1 } })

    await request(app.getHttpServer())
      .post('/orders')
      .send({
        senderName: 'Sender',
        senderPhone: '0900000000',
        senderAddress: '123 Nguyen Trai',
        senderLat: 10.1,
        senderLng: 106.1,
        receiverName: 'Receiver',
        receiverPhone: '0911111111',
        receiverAddress: '456 Le Loi',
        receiverLat: 10.2,
        receiverLng: 106.2,
        items: [{ name: 'Box', quantity: 1, weight: 2 }],
      })
      .expect(201)
      .expect({ order: { id: 1 } })

    expect(ordersService.create).toHaveBeenCalledWith(
      99,
      99,
      expect.objectContaining({
        senderName: 'Sender',
        receiverName: 'Receiver',
      }),
    )
  })

  it('GET /orders applies query defaults through ZodValidationPipe', async () => {
    ordersService.findAll.mockResolvedValue({ data: [], totalItems: 0, page: 1, limit: 10, totalPages: 0 })

    await request(app.getHttpServer()).get('/orders').expect(200)

    expect(ordersService.findAll).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
    })
  })

  it('PUT /orders/:id/status parses id and validates status body', async () => {
    ordersService.update.mockResolvedValue({ id: 5, status: 'DELIVERED' })

    await request(app.getHttpServer())
      .put('/orders/5/status')
      .send({ status: 'DELIVERED' })
      .expect(200)
      .expect({ id: 5, status: 'DELIVERED' })

    expect(ordersService.update).toHaveBeenCalledWith(5, { status: 'DELIVERED' })
  })

  it('GET /orders/:id rejects a non-numeric id', async () => {
    await request(app.getHttpServer()).get('/orders/not-a-number').expect(400)
  })
})
