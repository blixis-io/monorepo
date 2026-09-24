import { InfrastructureError, type Logger } from '@blixis/contracts'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineEnvSchema, parseEnv } from './env.ts'
import { waitUntilSafe } from './execution-context.ts'

z.config({ jitless: true })

const EnvSchema = defineEnvSchema(
  z.object({
    BLIXIS_ENV: z.enum(['local', 'preview', 'staging', 'production']),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    API_SECRET: z.string().min(32),
  }),
)

describe('parseEnv', () => {
  it('returns typed, defaulted values', () => {
    const env = parseEnv({ BLIXIS_ENV: 'staging', API_SECRET: 'x'.repeat(32), EXTRA: 1 }, EnvSchema)
    expect(env).toEqual({ BLIXIS_ENV: 'staging', LOG_LEVEL: 'info', API_SECRET: 'x'.repeat(32) })
  })

  it('names missing and invalid keys without leaking values', () => {
    const secret = 'short-but-secret-value'
    const error = (() => {
      try {
        parseEnv({ BLIXIS_ENV: 'prod', API_SECRET: secret }, EnvSchema)
      } catch (e) {
        return e
      }
      return undefined
    })()
    expect(error).toBeInstanceOf(InfrastructureError)
    const message = (error as Error).message
    expect(message).toMatch(/^Invalid Worker environment: BLIXIS_ENV: .+; API_SECRET: .+$/)
    expect(message).not.toContain(secret)
    expect(message).not.toContain('prod"')
    expect((error as InfrastructureError).expose).toBe(false)
  })

  it('reports a missing variable', () => {
    expect(() => parseEnv({ API_SECRET: 'x'.repeat(32) }, EnvSchema)).toThrowError(/BLIXIS_ENV/)
  })
})

describe('waitUntilSafe', () => {
  it('registers the promise and logs failures instead of rejecting', async () => {
    const registered: Promise<unknown>[] = []
    const errors: unknown[] = []
    const logger = { error: (...args: unknown[]) => void errors.push(args) } as unknown as Logger
    waitUntilSafe(
      { waitUntil: (p) => void registered.push(p) },
      Promise.reject(new Error('boom')),
      logger,
      'scope disposal',
    )
    await expect(registered[0]).resolves.toBeUndefined()
    expect(errors).toEqual([['scope disposal failed', { error: 'Error: boom' }]])
  })
})
