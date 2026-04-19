import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { AppController } from '../src/app.controller'
import { AppService } from '../src/app.service'
import { createHttpTestApp } from './helpers/create-http-test-app'

describe('App Smoke (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const testApp = await createHttpTestApp({
      controllers: [AppController],
      providers: [AppService],
    })

    app = testApp.app
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET / returns the health greeting', async () => {
    await request(app.getHttpServer()).get('/').expect(200).expect('Hello World!')
  })
})
