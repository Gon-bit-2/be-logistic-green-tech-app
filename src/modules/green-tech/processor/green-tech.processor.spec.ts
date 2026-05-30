import { CALCULATE_EMISSION_JOB_NAME } from 'src/common/constants/queue.constant'
import { GamificationService } from '../service/gamification.service'
import { GreenTechService } from '../service/green-tech.service'
import { GreenTechProcessor } from './green-tech.processor'

describe('GreenTechProcessor', () => {
  let greenTechService: jest.Mocked<GreenTechService>
  let gamificationService: jest.Mocked<GamificationService>
  let calculateTripEmission: jest.Mock
  let processTripEmission: jest.Mock
  let processor: GreenTechProcessor

  beforeEach(() => {
    calculateTripEmission = jest.fn()
    processTripEmission = jest.fn()
    greenTechService = {
      calculateTripEmission,
    } as unknown as jest.Mocked<GreenTechService>
    gamificationService = {
      processTripEmission,
    } as unknown as jest.Mocked<GamificationService>
    processor = new GreenTechProcessor(greenTechService, gamificationService)
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
    expect(processTripEmission).toHaveBeenCalledWith(5)
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
    expect(processTripEmission).not.toHaveBeenCalled()
  })

  it('does not fail emission job when gamification fails', async () => {
    calculateTripEmission.mockResolvedValue({ id: 10 })
    processTripEmission.mockRejectedValue(new Error('award failed'))

    await expect(
      processor.process({
        data: { tripId: 5 },
        id: 'job-3',
        name: CALCULATE_EMISSION_JOB_NAME,
      } as never),
    ).resolves.toEqual({ id: 10 })
  })
})
