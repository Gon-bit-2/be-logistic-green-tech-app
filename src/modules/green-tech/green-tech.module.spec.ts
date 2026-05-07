import { MODULE_METADATA } from '@nestjs/common/constants'
import { BullModule } from '@nestjs/bullmq'
import { GreenTechModule } from './green-tech.module'
import { DatabaseModule } from 'src/database/database.module'
import { GREEN_TECH_QUEUE_NAME } from 'src/common/constants/queue.constant'
import { GamificationController } from './controller/gamification.controller'
import { GreenTechController } from './controller/green-tech.controller'
import { GreenTechProcessor } from './processor/green-tech.processor'
import { EmissionRepository } from './repository/emission.repo'
import { GamificationService } from './service/gamification.service'
import { GreenTechService } from './service/green-tech.service'

describe('GreenTechModule', () => {
  it('publishes gamification and emission controllers/providers', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, GreenTechModule) as unknown[]
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, GreenTechModule) as unknown[]
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, GreenTechModule) as unknown[]

    expect(controllers).toEqual(expect.arrayContaining([GamificationController, GreenTechController]))
    expect(providers).toEqual(
      expect.arrayContaining([GamificationService, GreenTechService, EmissionRepository, GreenTechProcessor]),
    )
    expect(exports).toEqual(expect.arrayContaining([GamificationService, GreenTechService]))
  })

  it('imports database and the green-tech queue registration', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, GreenTechModule) as unknown[]

    expect(imports).toContain(DatabaseModule)
    expect(imports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: BullModule,
          providers: expect.arrayContaining([
            expect.objectContaining({
              provide: `BullQueue_${GREEN_TECH_QUEUE_NAME}`,
            }),
          ]),
        }),
      ]),
    )
  })
})
