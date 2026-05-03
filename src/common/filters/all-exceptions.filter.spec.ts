import { ArgumentsHost, ForbiddenException } from '@nestjs/common'
import { AllExceptionsFilter } from './all-exceptions.filter'

function createHttpHost() {
  const request = {
    id: 'req-1',
    method: 'GET',
    url: '/trips',
  }
  const response = {}

  return {
    host: {
      getType: jest.fn().mockReturnValue('http'),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(request),
        getResponse: jest.fn().mockReturnValue(response),
      }),
    } as unknown as ArgumentsHost,
    httpAdapterHost: {
      httpAdapter: {
        getRequestUrl: jest.fn().mockReturnValue('/trips'),
        reply: jest.fn(),
      },
    },
    request,
    response,
  }
}

describe('AllExceptionsFilter', () => {
  it('adds errorCode for machine-readable Error.* messages', () => {
    const { host, httpAdapterHost } = createHttpHost()
    const filter = new AllExceptionsFilter(httpAdapterHost as any)

    filter.catch(new ForbiddenException('Error.PermissionDenied.NotYourHub'), host)

    expect(httpAdapterHost.httpAdapter.reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        errorCode: 'Error.PermissionDenied.NotYourHub',
        message: 'Error.PermissionDenied.NotYourHub',
        requestId: 'req-1',
        statusCode: 403,
      }),
      403,
    )
  })

  it('keeps the existing error envelope for generic server errors', () => {
    const { host, httpAdapterHost } = createHttpHost()
    const filter = new AllExceptionsFilter(httpAdapterHost as any)

    filter.catch(new Error('database down'), host)

    expect(httpAdapterHost.httpAdapter.reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        message: 'database down',
        path: '/trips',
        requestId: 'req-1',
        statusCode: 500,
      }),
      500,
    )
  })
})
