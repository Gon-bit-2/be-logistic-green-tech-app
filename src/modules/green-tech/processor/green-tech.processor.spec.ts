import { CALCULATE_EMISSION_JOB_NAME } from 'src/common/constants/queue.constant'
import { GreenTechService } from '../service/green-tech.service'
import { GreenTechProcessor } from './green-tech.processor'

describe('GreenTechProcessor', () => {
  let greenTechService: jest.Mocked<GreenTechService>
  let calculateTripEmission: jest.Mock
  let processor: GreenTechProcessor

  beforeEach(() => {
    calculateTripEmission = jest.fn()
    greenTechService = {
      calculateTripEmission,
    } as unknown as jest.Mocked<GreenTechService>
    processor = new GreenTechProcessor(greenTechService)
  })

  it('processes calculate-emission jobs', async () => {
    calculateTripEmission.mockResolvedValue({ id: 10 })

    await expect(
      processor.process({
        data: { tripId: 5 },
        id: 'job-1',
        name: CALCULATE_EMISSION_JOB_NAME,
      } as never),
    ).resolves.toEqual({ id: 10 })
    expect(calculateTripEmission).toHaveBeenCalledWith(5)
  })

  it('throws when calculate-emission job data does not include tripId', async () => {
    await expect(
      processor.process({
        data: {},
        id: 'job-2',
        name: CALCULATE_EMISSION_JOB_NAME,
      } as never),
    ).rejects.toThrow('job.data.tripId bị thiếu')
    expect(calculateTripEmission).not.toHaveBeenCalled()
  })
})
