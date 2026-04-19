import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { TrackingController } from '../src/modules/tracking/controller/tracking.controller'
import { TrackingService } from '../src/modules/tracking/service/tracking.service'
import { createHttpTestApp } from './helpers/create-http-test-app'

describe('Tracking API', () => {
  let app: INestApplication
  const trackingService = {
    createEvent: jest.fn(),
    getTimeline: jest.fn(),
    getPublicTimeline: jest.fn(),
  }

  beforeAll(async () => {
    const testApp = await createHttpTestApp({
      controllers: [TrackingController],
      providers: [{ provide: TrackingService, useValue: trackingService }],
    })

    app = testApp.app
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(async () => {
    await app.close()
  })

  it('POST /tracking-events validates payload and injects active user', async () => {
    trackingService.createEvent.mockResolvedValue({ id: 1 })

    await request(app.getHttpServer())
      .post('/tracking-events')
      .send({
        orderId: 1,
        eventType: 'STATUS_CHANGE',
        status: 'ASSIGNED',
        source: 'DRIVER_APP',
      })
      .expect(201)
      .expect({ id: 1 })

    expect(trackingService.createEvent).toHaveBeenCalledWith(99, {
      orderId: 1,
      eventType: 'STATUS_CHANGE',
      status: 'ASSIGNED',
      source: 'DRIVER_APP',
    })
  })

  it('POST /tracking-events rejects delivered status without POD', async () => {
    await request(app.getHttpServer())
      .post('/tracking-events')
      .send({
        orderId: 1,
        eventType: 'STATUS_CHANGE',
        status: 'DELIVERED',
        source: 'DRIVER_APP',
      })
      .expect(400)
  })

  it('GET /tracking-events/public/:trackingCode returns sanitized public timeline', async () => {
    trackingService.getPublicTimeline.mockResolvedValue({
      trackingCode: 'TRACK123',
      currentStatus: 'DELIVERED',
      events: [],
    })

    await request(app.getHttpServer()).get('/tracking-events/public/TRACK123').expect(200).expect({
      trackingCode: 'TRACK123',
      currentStatus: 'DELIVERED',
      events: [],
    })

    expect(trackingService.getPublicTimeline).toHaveBeenCalledWith('TRACK123')
  })
})
