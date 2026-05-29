import { NextFunction, Response } from 'express'
import { RequestWithId } from './request-id.middleware'

describe('LoggingMiddleware', () => {
  afterEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    jest.restoreAllMocks()
  })

  it('persists slow requests using threshold from validated config', () => {
    jest.doMock('src/config/config', () => ({
      __esModule: true,
      default: { SLOW_REQUEST_MS: 50 },
    }))

    jest.isolateModules(() => {
      const { LoggingMiddleware } = jest.requireActual<typeof import('./logging.middleware')>('./logging.middleware')
      const prisma = {
        slowRequestLog: {
          create: jest.fn().mockResolvedValue({ id: 1 }),
        },
      }
      const middleware = new LoggingMiddleware(prisma as any)
      const finishHandlers: Array<() => void> = []
      const req = {
        get: jest.fn().mockReturnValue('Jest'),
        id: 'req-1',
        method: 'GET',
        originalUrl: '/health',
        url: '/health',
      } as unknown as RequestWithId
      const res = {
        get: jest.fn().mockReturnValue('12'),
        on: jest.fn((event: string, handler: () => void) => {
          if (event === 'finish') finishHandlers.push(handler)
          return res
        }),
        statusCode: 200,
      } as unknown as Response
      const next: NextFunction = jest.fn()
      jest.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_060)

      middleware.use(req, res, next)
      finishHandlers[0]()

      expect(next).toHaveBeenCalled()
      expect(prisma.slowRequestLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          durationMs: 60,
          requestId: 'req-1',
        }),
      })
    })
  })
})
