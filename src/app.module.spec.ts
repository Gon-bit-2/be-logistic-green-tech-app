import { MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { AppModule } from './app.module'
import { OrdersModule } from 'src/modules/orders/orders.module'
import { TripsModule } from 'src/modules/trips/trips.module'
import { OrdersController } from 'src/modules/orders/controller/orders.controller'
import { TripsController } from 'src/modules/trips/controller/trips.controller'

describe('AppModule', () => {
  it('mounts orders and trips modules in the application runtime', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[]

    expect(imports).toContain(OrdersModule)
    expect(imports).toContain(TripsModule)
  })

  it('keeps orders and trips controller routes published', () => {
    expect(Reflect.getMetadata(PATH_METADATA, OrdersController)).toBe('orders')
    expect(Reflect.getMetadata(PATH_METADATA, TripsController)).toBe('trips')
  })
})
