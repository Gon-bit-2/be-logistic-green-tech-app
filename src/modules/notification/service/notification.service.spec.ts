// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing'
import { NotificationService } from './notification.service'
import { NotificationRepository } from '../repository/notification.repo'
import { NotFoundException } from '@nestjs/common'
import { RoleRequestStatus } from 'src/common/constants/role-request.constant'
import roleName from 'src/common/constants/role.constant'

describe('NotificationService', () => {
  let service: NotificationService
  let notificationRepo: jest.Mocked<NotificationRepository>

  beforeEach(async () => {
    const notificationRepoMock = {
      findManyByUser: jest.fn(),
      countUnreadByUser: jest.fn(),
      findByIdForUser: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
      createManyForUsers: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: NotificationRepository,
          useValue: notificationRepoMock,
        },
      ],
    }).compile()

    service = module.get<NotificationService>(NotificationService)
    notificationRepo = module.get(NotificationRepository)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('list inbox theo owner', async () => {
    notificationRepo.findManyByUser.mockResolvedValue({ data: [], totalItems: 0 })

    const result = await service.findAll(7, { page: 1, limit: 10 })

    expect(result).toEqual({ data: [], totalItems: 0 })
    expect(notificationRepo.findManyByUser).toHaveBeenCalledWith(7, { page: 1, limit: 10 })
  })

  it('trả unread count đúng', async () => {
    notificationRepo.countUnreadByUser.mockResolvedValue(3)

    const result = await service.getUnreadCount(7)

    expect(result).toEqual({ totalUnread: 3 })
  })

  it('mark-read chỉ thành công khi notification thuộc owner', async () => {
    notificationRepo.findByIdForUser.mockResolvedValue({ id: 10, userId: 7 } as any)

    const result = await service.markAsRead(7, 10)

    expect(result).toEqual({ message: 'Đánh dấu thông báo đã đọc thành công' })
    expect(notificationRepo.markAsRead).toHaveBeenCalledWith(7, 10)
  })

  it('văng NotFoundException khi mark-read notification không thuộc owner', async () => {
    notificationRepo.findByIdForUser.mockResolvedValue(null)

    await expect(service.markAsRead(7, 10)).rejects.toThrow(NotFoundException)
  })

  it('mark-read-all chỉ tác động inbox user hiện tại', async () => {
    notificationRepo.markAllAsRead.mockResolvedValue({ count: 2 } as any)

    const result = await service.markAllAsRead(7)

    expect(result).toEqual({ message: 'Đánh dấu tất cả thông báo đã đọc thành công' })
    expect(notificationRepo.markAllAsRead).toHaveBeenCalledWith(7)
  })

  it('tạo notification cho admin khi user submit role request', async () => {
    await service.createRoleRequestSubmittedNotifications({
      recipientUserIds: [1, 2],
      requesterName: 'Alice',
      targetRoleName: roleName.DRIVER,
      roleRequestId: 99,
    })

    expect(notificationRepo.createManyForUsers).toHaveBeenCalledWith(
      [1, 2],
      expect.objectContaining({
        message: 'Alice đã gửi yêu cầu đăng ký vai trò DRIVER.',
        payload: {
          roleRequestId: 99,
          targetRoleName: roleName.DRIVER,
          status: RoleRequestStatus.PENDING,
        },
      }),
    )
  })

  it('tạo notification cho requester khi request được duyệt hoặc từ chối', async () => {
    await service.createRoleRequestReviewedNotification({
      userId: 7,
      targetRoleName: roleName.WAREHOUSE_STAFF,
      roleRequestId: 100,
      status: RoleRequestStatus.APPROVED,
      reviewedById: 1,
    })

    expect(notificationRepo.createManyForUsers).toHaveBeenCalledWith(
      [7],
      expect.objectContaining({
        payload: {
          roleRequestId: 100,
          targetRoleName: roleName.WAREHOUSE_STAFF,
          status: RoleRequestStatus.APPROVED,
          reviewedById: 1,
        },
      }),
    )
  })

  it('tạo notification khi đơn hàng được tạo thành công', async () => {
    await service.createOrderCreatedNotification({
      userId: 7,
      orderId: 100,
      trackingCode: 'ORD100',
    })

    expect(notificationRepo.createManyForUsers).toHaveBeenCalledWith(
      [7],
      expect.objectContaining({
        type: 'ORDER_CREATED',
        payload: {
          orderId: 100,
          trackingCode: 'ORD100',
          orderStatus: 'PENDING',
        },
      }),
    )
  })

  it('tạo notification khi đơn chuyển sang DELIVERED', async () => {
    await service.createOrderStatusNotification({
      userId: 7,
      orderId: 100,
      trackingCode: 'ORD100',
      status: 'DELIVERED',
    })

    expect(notificationRepo.createManyForUsers).toHaveBeenCalledWith(
      [7],
      expect.objectContaining({
        type: 'ORDER_DELIVERED',
        payload: {
          orderId: 100,
          trackingCode: 'ORD100',
          orderStatus: 'DELIVERED',
        },
      }),
    )
  })
})
