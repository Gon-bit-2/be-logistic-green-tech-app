// @ts-nocheck
import request from 'supertest'
import { RoleController } from './role.controller'
import { RoleService } from './role.service'
import { createHttpTestApp } from '../../../../test/helpers/create-http-test-app'
import roleName from 'src/common/constants/role.constant'

describe('RoleController', () => {
  let app
  let roleService

  beforeEach(async () => {
    const roleRequestItem = {
      id: 1,
      requesterId: 99,
      currentRoleId: 2,
      targetRoleId: 3,
      reason: 'Muon lam tai xe',
      status: 'PENDING',
      reviewNote: null,
      reviewedById: null,
      reviewedAt: null,
      assignedHubId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      requester: {
        id: 99,
        fullName: 'Test User',
        email: 'test@example.com',
        phone: '0900000000',
        hubId: null,
      },
      currentRole: {
        id: 2,
        name: roleName.CUSTOMER,
      },
      targetRole: {
        id: 3,
        name: roleName.DRIVER,
      },
      assignedHub: null,
    }

    const roleServiceMock = {
      create: jest.fn().mockResolvedValue(roleRequestItem),
      findMine: jest.fn().mockResolvedValue({ data: [], totalItems: 0 }),
      findAll: jest.fn().mockResolvedValue({ data: [], totalItems: 0 }),
      approve: jest.fn().mockResolvedValue(roleRequestItem),
      reject: jest.fn().mockResolvedValue({ ...roleRequestItem, status: 'REJECTED', reviewNote: 'Rejected' }),
    }

    const testApp = await createHttpTestApp({
      controllers: [RoleController],
      providers: [
        {
          provide: RoleService,
          useValue: roleServiceMock,
        },
      ],
    })

    app = testApp.app
    roleService = roleServiceMock
  })

  afterEach(async () => {
    await app.close()
  })

  it('POST /role-requests validate target role', async () => {
    await request(app.getHttpServer())
      .post('/role-requests')
      .send({ targetRoleName: 'ADMIN', reason: 'invalid' })
      .expect(400)
  })

  it('POST /role-requests gọi service khi payload hợp lệ', async () => {
    await request(app.getHttpServer())
      .post('/role-requests')
      .send({ targetRoleName: roleName.DRIVER, reason: 'Muon lam tai xe' })
      .expect(201)

    expect(roleService.create).toHaveBeenCalled()
  })

  it('GET /role-requests/me trả lịch sử của user hiện tại', async () => {
    await request(app.getHttpServer()).get('/role-requests/me').expect(200)
    expect(roleService.findMine).toHaveBeenCalled()
  })

  it('PATCH /role-requests/:id/reject yêu cầu reviewNote bắt buộc', async () => {
    await request(app.getHttpServer()).patch('/role-requests/1/reject').send({}).expect(400)
  })
})
