// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing'
import { NotificationEventListener } from './notification.event.listener'
import roleName from 'src/common/constants/role.constant'
import { RoleRequestStatus } from 'src/common/constants/role-request.constant'
import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { getQueueToken } from '@nestjs/bullmq'
import { NOTIFICATION_QUEUE_NAME } from 'src/common/constants/queue.constant'
import { NotificationEventName } from '../events/notification.event'

describe('NotificationEventListener', () => {
  let listener: NotificationEventListener
  let queue: { add: jest.Mock }

  beforeEach(async () => {
    const queueMock = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationEventListener,
        { provide: getQueueToken(NOTIFICATION_QUEUE_NAME), useValue: queueMock },
      ],
    }).compile()

    listener = module.get(NotificationEventListener)
    queue = module.get(getQueueToken(NOTIFICATION_QUEUE_NAME))
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

    expect(queue.add).toHaveBeenCalledWith(
      'deliver-notification',
      { eventName: NotificationEventName.ROLE_REQUEST_SUBMITTED, payload: event },
      expect.objectContaining({ jobId: 'role-request-submitted-11' }),
    )
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

    expect(queue.add).toHaveBeenCalledWith(
      'deliver-notification',
      { eventName: NotificationEventName.ROLE_REQUEST_REVIEWED, payload: event },
      expect.objectContaining({ jobId: 'role-request-reviewed-12-APPROVED' }),
    )
  })

  it('delegates order-created event to notification service', async () => {
    const event = {
      userId: 7,
      orderId: 100,
      trackingCode: 'ORD100',
    }

    await listener.handleOrderCreated(event)

    expect(queue.add).toHaveBeenCalledWith(
      'deliver-notification',
      { eventName: NotificationEventName.ORDER_CREATED, payload: event },
      expect.objectContaining({ jobId: 'order-created-100' }),
    )
  })

  it('delegates order-status-updated event to notification service', async () => {
    const event = {
      userId: 7,
      orderId: 100,
      trackingCode: 'ORD100',
      status: ORDER_STATUS.DELIVERED,
    }

    await listener.handleOrderStatusUpdated(event as any)

    expect(queue.add).toHaveBeenCalledWith(
      'deliver-notification',
      { eventName: NotificationEventName.ORDER_STATUS_UPDATED, payload: event },
      expect.objectContaining({ jobId: 'order-status-100-DELIVERED' }),
    )
  })
})
