import { convertDecimalsToNumbers, DecimalNumberSchema } from './decimal.util'

class FakeDecimal {
  constructor(private readonly value: number) {}

  toNumber() {
    return this.value
  }

  toString() {
    return String(this.value)
  }
}

describe('decimal util', () => {
  it('converts decimal-like values recursively', () => {
    const input = {
      amount: new FakeDecimal(123.45),
      nested: [{ co2Saved: new FakeDecimal(0.125) }],
      createdAt: new Date('2026-05-08T00:00:00.000Z'),
    }

    expect(convertDecimalsToNumbers(input)).toEqual({
      amount: 123.45,
      nested: [{ co2Saved: 0.125 }],
      createdAt: input.createdAt,
    })
  })

  it('lets zod response schemas parse decimal-like values as numbers', () => {
    expect(DecimalNumberSchema.parse(new FakeDecimal(26089.8))).toBe(26089.8)
  })
})
