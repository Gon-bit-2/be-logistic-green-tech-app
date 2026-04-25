export const VehicleType = {
  VAN: 'VAN',
  TRUCK: 'TRUCK',
  ELECTRIC_VAN: 'ELECTRIC_VAN',
  MOTORCYCLE: 'MOTORCYCLE',
} as const
export type VehicleTypeType = (typeof VehicleType)[keyof typeof VehicleType]

export const FuelType = {
  DIESEL: 'DIESEL',
  ELECTRIC: 'ELECTRIC',
  GASOLINE: 'GASOLINE',
} as const
export type FuelTypeType = (typeof FuelType)[keyof typeof FuelType]
