import { z } from 'zod'

type DecimalLike = {
  toNumber?: () => number
  toString: () => string
}

export function isDecimalLike(value: unknown): value is DecimalLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toString?: unknown }).toString === 'function' &&
    (typeof (value as { toNumber?: unknown }).toNumber === 'function' ||
      (value as { constructor?: { name?: string } }).constructor?.name === 'Decimal')
  )
}

export function decimalToNumber(value: unknown): unknown {
  if (isDecimalLike(value)) {
    const numberValue = typeof value.toNumber === 'function' ? value.toNumber() : Number.parseFloat(value.toString())
    return Number.isFinite(numberValue) ? numberValue : value
  }

  return value
}

export function convertDecimalsToNumbers<T>(value: T): T {
  const converted = decimalToNumber(value)
  if (converted !== value) {
    return converted as T
  }

  if (Array.isArray(value)) {
    return value.map((item) => convertDecimalsToNumbers(item)) as T
  }

  if (value instanceof Date || value === null || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key, convertDecimalsToNumbers(entryValue)]),
  ) as T
}

export const DecimalNumberSchema = z.preprocess(decimalToNumber, z.number())
