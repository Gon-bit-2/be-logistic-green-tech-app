// @ts-nocheck
import request from 'supertest'
import { NotificationController } from './notification.controller'
import { NotificationService } from '../service/notification.service'
import { createHttpTestApp } from '../../../../test/helpers/create-http-test-app'

describe('NotificationController', () => {
  let app
  let notificationService

  beforeEach(async () => {
    const notificationServiceMock = {
      findAll: jest.fn().mockResolvedValue({ data: [], totalItems: 0 }),
      getUnreadCount: jest.fn().mockResolvedValue({ totalUnread: 0 }),
      markAsRead: jest.fn().mockResolvedValue({ message: 'Đánh dấu thông báo đã đọc thành công' }),
      markAllAsRead: jest.fn().mockResolvedValue({ message: 'Đánh dấu tất cả thông báo đã đọc thành công' }),
    }

    const testApp = await createHttpTestApp({
      controllers: [NotificationController],
      providers: [
        {
          provide: NotificationService,
          useValue: notificationServiceMock,
        },
      ],
    })

    app = testApp.app
    notificationService = notificationServiceMock
  })

  afterEach(async () => {
    await app.close()
  })

  it('GET /notifications trả danh sách inbox', async () => {
    await request(app.getHttpServer()).get('/notifications').expect(200)
    expect(notificationService.findAll).toHaveBeenCalled()
  })

  it('GET /notifications/unread-count trả số lượng chưa đọc', async () => {
    await request(app.getHttpServer()).get('/notifications/unread-count').expect(200, { totalUnread: 0 })
  })

  it('PATCH /notifications/:id/read validate id kiểu số', async () => {
    await request(app.getHttpServer()).patch('/notifications/not-a-number/read').expect(400)
  })

  it('PATCH /notifications/read-all gọi đúng service', async () => {
    await request(app.getHttpServer()).patch('/notifications/read-all').expect(200)
    expect(notificationService.markAllAsRead).toHaveBeenCalled()
  })
})
