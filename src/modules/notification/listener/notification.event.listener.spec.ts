// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing'
import { NotificationEventListener } from './notification.event.listener'
import { NotificationService } from '../service/notification.service'
import roleName from 'src/common/constants/role.constant'
import { RoleRequestStatus } from 'src/common/constants/role-request.constant'
import { ORDER_STATUS } from 'src/common/constants/order.constant'

describe('NotificationEventListener', () => {
  let listener: NotificationEventListener
  let notificationService: jest.Mocked<NotificationService>

  beforeEach(async () => {
    const notificationServiceMock = {
      createRoleRequestSubmittedNotifications: jest.fn(),
      createRoleRequestReviewedNotification: jest.fn(),
      createOrderCreatedNotification: jest.fn(),
      createOrderStatusNotification: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationEventListener, { provide: NotificationService, useValue: notificationServiceMock }],
    }).compile()

    listener = module.get(NotificationEventListener)
    notificationService = module.get(NotificationService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('delegates submitted role request event to notification service', async () => {
    const event = {
      recipientUserIds: [1, 2],
      requesterName: 'Alice',
      targetRoleName: roleName.DRIVER,
      roleRequestId: 11,
    }

    await listener.handleRoleRequestSubmitted(event)

    expect(notificationService.createRoleRequestSubmittedNotifications).toHaveBeenCalledWith(event)
  })

  it('delegates reviewed role request event to notification service', async () => {
    const event = {
      userId: 7,
      targetRoleName: roleName.WAREHOUSE_STAFF,
      roleRequestId: 12,
      status: RoleRequestStatus.APPROVED,
      reviewedById: 1,
    }

    await listener.handleRoleRequestReviewed(event)

    expect(notificationService.createRoleRequestReviewedNotification).toHaveBeenCalledWith(event)
  })

  it('delegates order-created event to notification service', async () => {
    const event = {
      userId: 7,
      orderId: 100,
      trackingCode: 'ORD100',
    }

    await listener.handleOrderCreated(event)

    expect(notificationService.createOrderCreatedNotification).toHaveBeenCalledWith(event)
  })

  it('delegates order-status-updated event to notification service', async () => {
    const event = {
      userId: 7,
      orderId: 100,
      trackingCode: 'ORD100',
      status: ORDER_STATUS.DELIVERED,
    }

    await listener.handleOrderStatusUpdated(event as any)

    expect(notificationService.createOrderStatusNotification).toHaveBeenCalledWith(event)
  })
})
