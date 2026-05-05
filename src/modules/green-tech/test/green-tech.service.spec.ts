import { Test, TestingModule } from '@nestjs/testing'
import { GreenTechService } from '../service/green-tech.service'
import { EmissionRepository } from '../repository/emission.repo'
import { BadRequestException, NotFoundException } from '@nestjs/common'

describe('GreenTechService', () => {
  let service: GreenTechService
  let repo: jest.Mocked<EmissionRepository>

  beforeEach(async () => {
    const repoMock = {
      getTripSourceData: jest.fn(),
      getTripLogs: jest.fn(),
      saveEmissionData: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GreenTechService,
        {
          provide: EmissionRepository,
          useValue: repoMock,
        },
      ],
    }).compile()

    service = module.get<GreenTechService>(GreenTechService)
    repo = module.get(EmissionRepository)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('calculateTripEmission', () => {
    it('Tính tổng CO2, tiết kiệm (so vs xe diesel baseline), phân bổ CO2 tỷ lệ trọng lượng', async () => {
      // Giả lập dữ liệu chuyến đi
      const mockTrip = {
        totalDistance: 100, // 100 km
        vehicle: {
          emissionRatePerKm: 50, // Xe điện, thải 50g / km
          type: 'TRUCK',
          fuelType: 'EV',
        },
        ordersOnBoard: [
          { id: 1, totalWeight: 10 }, // 10kg
          { id: 2, totalWeight: 40 }, // 40kg -> Tổng 50kg
        ],
      }
      repo.getTripSourceData.mockResolvedValue(mockTrip as any)

      // Giả sử có log version hiện hành là 2 -> version mới sẽ là 3
      repo.getTripLogs.mockResolvedValue([{ version: 2 }] as any)
      repo.saveEmissionData.mockResolvedValue({ id: 100 } as any)

      const res = await service.calculateTripEmission(1)

      // --- Kiểm tra logic ---
      // Total Payload = 10 + 40 = 50 kg
      // Emit = 100km * 50g/km = 5000g = 5kg
      // Baseline Rate = 250g/km -> Baseline emit = 100km * 250g/km = 25000g = 25kg
      // Co2 saved = 25kg - 5kg = 20kg

      // Allocations:
      // Order 1 (10kg / 50kg = 20%): co2 emitted = 1kg, saved = 4kg
      // Order 2 (40kg / 50kg = 80%): co2 emitted = 4kg, saved = 16kg

      expect(repo.saveEmissionData).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          // Log params
          version: 3,
          actualDistance: 100,
          calculationMethod: 'TRIP_TOTAL_DISTANCE',
          payloadWeight: 50,
          co2Emitted: 5,
          co2Saved: 20,
        }),
        expect.arrayContaining([
          // Allocation array params
          expect.objectContaining({ orderId: 1, allocatedCo2: 1, weightRatio: 0.2 }),
          expect.objectContaining({ orderId: 2, allocatedCo2: 4, weightRatio: 0.8 }),
        ]),
      )

      expect(res).toEqual({ id: 100 })
    })

    it('văng NotFoundException khi trip k tồn tại', async () => {
      repo.getTripSourceData.mockResolvedValue(null)
      await expect(service.calculateTripEmission(1)).rejects.toThrow(NotFoundException)
    })

    it('văng NotFoundException khi trip chưa có vehicle', async () => {
      repo.getTripSourceData.mockResolvedValue({ vehicle: null } as any)
      await expect(service.calculateTripEmission(1)).rejects.toThrow(NotFoundException)
    })

    it('văng BadRequestException khi trip chưa có totalDistance hợp lệ', async () => {
      repo.getTripSourceData.mockResolvedValue({
        ordersOnBoard: [{ id: 1, totalWeight: 10 }],
        totalDistance: 0,
        vehicle: {
          emissionRatePerKm: 50,
          fuelType: 'ELECTRIC',
          type: 'ELECTRIC_VAN',
        },
      } as any)

      await expect(service.calculateTripEmission(1)).rejects.toThrow(BadRequestException)
      expect(repo.saveEmissionData).not.toHaveBeenCalled()
    })
  })

  describe('getTripEmissionHistory', () => {
    it('gọi repo để lấy history', async () => {
      repo.getTripLogs.mockResolvedValue([{ version: 1 }] as any)
      const res = await service.getTripEmissionHistory(1)
      expect(res).toEqual([{ version: 1 }])
      expect(repo.getTripLogs).toHaveBeenCalledWith(1)
    })
  })
})
