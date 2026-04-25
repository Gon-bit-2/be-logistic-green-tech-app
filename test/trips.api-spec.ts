import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { TripsController } from '../src/modules/trips/controller/trips.controller'
import { TripsService } from '../src/modules/trips/service/trips.service'
import { createHttpTestApp } from './helpers/create-http-test-app'

describe('Trips API', () => {
  let app: INestApplication
  const tripsService = {
    autoDispatchLocalTask: jest.fn(),
    autoDispatchGlobalTask: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
    cancelOrderFromTrip: jest.fn(),
  }

  beforeAll(async () => {
    const testApp = await createHttpTestApp({
      controllers: [TripsController],
      providers: [{ provide: TripsService, useValue: tripsService }],
    })

    app = testApp.app
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(async () => {
    await app.close()
  })

  it('POST /trips/auto-dispatch uses hubId query when provided', async () => {
    tripsService.autoDispatchLocalTask.mockResolvedValue({ message: 'queued', jobId: 'job-1' })

    await request(app.getHttpServer()).post('/trips/auto-dispatch?hubId=5').expect(201).expect({
      message: 'queued',
      jobId: 'job-1',
    })

    expect(tripsService.autoDispatchLocalTask).toHaveBeenCalledWith(5)
    expect(tripsService.autoDispatchGlobalTask).not.toHaveBeenCalled()
  })

  it('POST /trips/auto-dispatch/all routes to global dispatch', async () => {
    tripsService.autoDispatchGlobalTask.mockResolvedValue({ message: 'queued-all', jobId: 'job-1,job-2' })

    await request(app.getHttpServer()).post('/trips/auto-dispatch/all').expect(201)

    expect(tripsService.autoDispatchGlobalTask).toHaveBeenCalledTimes(1)
  })

  it('PATCH /trips/:id/status parses id and forwards status', async () => {
    tripsService.updateStatus.mockResolvedValue({ id: 9, status: 'IN_PROGRESS' })

    await request(app.getHttpServer())
      .patch('/trips/9/status')
      .send({ status: 'IN_PROGRESS' })
      .expect(200)
      .expect({ id: 9, status: 'IN_PROGRESS' })

    expect(tripsService.updateStatus).toHaveBeenCalledWith(9, 'IN_PROGRESS')
  })
})
