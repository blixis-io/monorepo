import { describe, expect, it, vi } from 'vitest'
import { idTimestamp, isId, newId } from './ids.ts'

describe('newId', () => {
  it('generates RFC 9562 UUIDv7 strings with the current time', () => {
    const before = Date.now()
    const id = newId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    const time = idTimestamp(id)?.getTime() ?? 0
    expect(time).toBeGreaterThanOrEqual(before)
    expect(time).toBeLessThanOrEqual(Date.now() + 1)
  })

  it('is strictly increasing within one millisecond (frozen clock, as in Workers)', () => {
    vi.useFakeTimers({ now: new Date('2026-09-24T12:00:00Z') })
    try {
      const ids = Array.from({ length: 10_000 }, () => newId())
      expect([...ids].sort()).toEqual(ids)
      expect(new Set(ids).size).toBe(ids.length)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stays increasing when the clock goes backwards', () => {
    vi.useFakeTimers({ now: new Date('2026-09-24T12:00:01Z') })
    try {
      const first = newId()
      vi.setSystemTime(new Date('2026-09-24T11:59:00Z'))
      expect(newId() > first).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('isId / idTimestamp', () => {
  it('validates UUIDs and rejects other strings', () => {
    expect(isId(newId())).toBe(true)
    expect(isId('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true)
    expect(isId('not-a-uuid')).toBe(false)
    expect(isId("1' or '1'='1")).toBe(false)
    expect(isId(42)).toBe(false)
  })

  it('reads the timestamp only from v7 ids', () => {
    expect(idTimestamp('0199a3f2-7c1e-7b3a-9f10-6d2c5e8a41b0')?.toISOString()).toBe(
      new Date(0x0199a3f27c1e).toISOString(),
    )
    expect(idTimestamp('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBeUndefined()
  })
})
