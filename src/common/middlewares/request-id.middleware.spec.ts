import { RequestIdMiddleware, REQUEST_ID_HEADER, RequestWithId } from './request-id.middleware'

describe('RequestIdMiddleware', () => {
  it('reuses incoming request id and exposes it on response header', () => {
    const middleware = new RequestIdMiddleware()
    const req = {
      header: jest.fn().mockReturnValue(' req-123 '),
    } as unknown as RequestWithId
    const res = {
      setHeader: jest.fn(),
    }
    const next = jest.fn()

    middleware.use(req, res as any, next)

    expect(req.id).toBe('req-123')
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'req-123')
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('generates a request id when the client does not send one', () => {
    const middleware = new RequestIdMiddleware()
    const req = {
      header: jest.fn().mockReturnValue(undefined),
    } as unknown as RequestWithId
    const res = {
      setHeader: jest.fn(),
    }
    const next = jest.fn()

    middleware.use(req, res as any, next)

    expect(req.id).toEqual(expect.any(String))
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.id)
    expect(next).toHaveBeenCalledTimes(1)
  })
})
