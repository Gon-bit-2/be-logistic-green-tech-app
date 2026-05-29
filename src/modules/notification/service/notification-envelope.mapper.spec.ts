import { ORDER_STATUS } from 'src/common/constants/order.constant'
import { NotificationType } from 'src/common/constants/notification.constant'
import { RoleRequestStatus } from 'src/common/constants/role-request.constant'
import roleName from 'src/common/constants/role.constant'
import { NotificationEventName } from '../events/notification.event'
import { NotificationEnvelopeMapper } from './notification-envelope.mapper'

describe('NotificationEnvelopeMapper', () => {
  const mapper = new NotificationEnvelopeMapper()

  it('maps role request submitted events', () => {
    expect(
      mapper.buildEnvelope(NotificationEventName.ROLE_REQUEST_SUBMITTED, {
        recipientUserIds: [1, 2],
        requesterName: 'Alice',
        roleRequestId: 9,
        targetRoleName: roleName.DRIVER,
      } as any),
    ).toMatchObject({
      dedupeKey: `${NotificationEventName.ROLE_REQUEST_SUBMITTED}:9`,
      payload: {
        roleRequestId: 9,
        status: RoleRequestStatus.PENDING,
        targetRoleName: roleName.DRIVER,
      },
      recipientUserIds: [1, 2],
      type: NotificationType.ROLE_REQUEST_SUBMITTED,
    })
  })

  it('maps delivered order status events', () => {
    expect(
      mapper.buildEnvelope(NotificationEventName.ORDER_STATUS_UPDATED, {
        orderId: 11,
        status: ORDER_STATUS.DELIVERED,
        trackingCode: 'ORD11',
        userId: 7,
      } as any),
    ).toMatchObject({
      dedupeKey: `${NotificationEventName.ORDER_STATUS_UPDATED}:11:${ORDER_STATUS.DELIVERED}`,
      payload: {
        orderId: 11,
        orderStatus: ORDER_STATUS.DELIVERED,
        trackingCode: 'ORD11',
      },
      recipientUserIds: [7],
      type: NotificationType.ORDER_DELIVERED,
    })
  })
})
