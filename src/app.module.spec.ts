import { MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { AppModule } from './app.module'
import { DatabaseModule } from './database/database.module'
import { SharedServicesModule } from './common/services/shared-services.module'
import { OrdersModule } from 'src/modules/orders/orders.module'
import { TripsModule } from 'src/modules/trips/trips.module'
import { GreenTechModule } from 'src/modules/green-tech/green-tech.module'
import { OrdersController } from 'src/modules/orders/controller/orders.controller'
import { TripsController } from 'src/modules/trips/controller/trips.controller'
import { GreenTechController } from 'src/modules/green-tech/controller/green-tech.controller'

describe('AppModule', () => {
  it('mounts feature modules in the application runtime', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[]

    expect(imports).toContain(OrdersModule)
    expect(imports).toContain(TripsModule)
    expect(imports).toContain(GreenTechModule)
  })

  it('does not rely on global database or shared-services imports at root level', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[]

    expect(imports).not.toContain(DatabaseModule)
    expect(imports).not.toContain(SharedServicesModule)
  })

  it('keeps main feature controller routes published', () => {
    expect(Reflect.getMetadata(PATH_METADATA, OrdersController)).toBe('orders')
    expect(Reflect.getMetadata(PATH_METADATA, TripsController)).toBe('trips')
    expect(Reflect.getMetadata(PATH_METADATA, GreenTechController)).toBe('green-tech')
  })
})
