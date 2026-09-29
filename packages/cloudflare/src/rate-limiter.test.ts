import { describe, expect, it } from 'vitest'
import { workersRateLimiters } from './rate-limiter.ts'

describe('workersRateLimiters', () => {
  it('wraps the bindings present in the environment and leaves missing ones unset', async () => {
    const keys: string[] = []
    const env = {
      RATE_LIMIT_MANAGEMENT: {
        limit: async ({ key }: { key: string }) => {
          keys.push(key)
          return { success: key !== 'blocked' }
        },
      },
    }
    const limiters = workersRateLimiters({
      management: { binding: 'RATE_LIMIT_MANAGEMENT', periodSeconds: 60 },
      delivery: { binding: 'RATE_LIMIT_DELIVERY', periodSeconds: 10 },
    })(env)
    expect(limiters['delivery']).toBeUndefined()
    expect(limiters['management']?.periodSeconds).toBe(60)
    expect(await limiters['management']?.limit('user:u1')).toBe(true)
    expect(await limiters['management']?.limit('blocked')).toBe(false)
    expect(keys).toEqual(['user:u1', 'blocked'])
  })

  it('builds the limiters once per environment object', () => {
    const build = workersRateLimiters({ a: { binding: 'A', periodSeconds: 60 } })
    const env = { A: { limit: async () => ({ success: true }) } }
    expect(build(env)).toBe(build(env))
  })
})
