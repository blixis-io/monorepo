import { describe, expect, expectTypeOf, it } from 'vitest'
import { assertNever, InvariantError, invariant } from './index.ts'

describe('invariant', () => {
  it('does nothing when the condition is truthy', () => {
    expect(() => invariant(1, 'never thrown')).not.toThrow()
  })

  it('throws InvariantError with the message when the condition is falsy', () => {
    expect(() => invariant(0, 'value must be set')).toThrowError(
      new InvariantError('value must be set'),
    )
    expect(() => invariant(null, 'x')).toThrowError(InvariantError)
  })

  it('narrows the checked value', () => {
    const value: string | undefined = 'a'
    invariant(value, 'value must be set')
    expectTypeOf(value).toEqualTypeOf<string>()
  })
})

describe('assertNever', () => {
  type Shape = { kind: 'circle' } | { kind: 'square' }

  const area = (shape: Shape): string => {
    switch (shape.kind) {
      case 'circle':
        return 'round'
      case 'square':
        return 'square'
      default:
        return assertNever(shape)
    }
  }

  it('is unreachable for exhaustive switches', () => {
    expect(area({ kind: 'circle' })).toBe('square')
  })

  it('throws InvariantError with the unexpected value when reached at runtime', () => {
    const invalid = { kind: 'triangle' } as unknown as never
    expect(() => assertNever(invalid)).toThrowError(/Unexpected value: {"kind":"triangle"}/)
  })

  it('uses a custom message', () => {
    expect(() => assertNever('x' as never, 'Unknown shape')).toThrowError('Unknown shape: "x"')
  })
})
