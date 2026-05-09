import { BadRequestException } from '@nestjs/common'
import { MapsService } from '../service/maps.service'

describe('MapsService', () => {
  let service: MapsService

  beforeEach(() => {
    service = new MapsService()
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('maps a valid autocomplete response', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        predictions: [
          {
            description: 'District 1, Ho Chi Minh City',
            place_id: 'place-1',
            structured_formatting: {
              main_text: 'District 1',
              secondary_text: 'Ho Chi Minh City',
            },
          },
        ],
        status: 'OK',
      }),
    })

    await expect(service.autocomplete({ input: 'district 1' })).resolves.toEqual({
      data: [
        {
          description: 'District 1, Ho Chi Minh City',
          mainText: 'District 1',
          placeId: 'place-1',
          secondaryText: 'Ho Chi Minh City',
        },
      ],
    })
  })

  it('rejects Goong status ERROR with a stable BadRequestException', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        error: { message: 'invalid api key' },
        predictions: [],
        status: 'ERROR',
      }),
    })

    await expect(service.autocomplete({ input: 'district 1' })).rejects.toThrow(BadRequestException)
  })

  it('rejects invalid directions payloads before reading nested fields', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        routes: [{ overview_polyline: { points: 'abc' } }],
        status: 'OK',
      }),
    })

    await expect(
      service.directions({
        destination: { lat: 10.8, lng: 106.7 },
        origin: { lat: 10.7, lng: 106.6 },
      }),
    ).rejects.toThrow(BadRequestException)
  })
})
