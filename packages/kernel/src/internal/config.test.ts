import type { BlixisModule } from '@blixis/contracts'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createBlixis } from '../create-blixis.ts'
import { defineModule } from '../define-module.ts'
import { ModuleValidationError } from '../errors.ts'
import { noopLogger } from '../logger.ts'
import { validateModuleConfigs } from './config.ts'

z.config({ jitless: true })

const SeoConfig = z.object({
  defaultTitle: z.string().default('Untitled'),
  maxLength: z.number().int().positive(),
})

const seo = defineModule((options: { defaultTitle?: string; maxLength?: number }) => ({
  meta: { name: '@acme/seo', version: '1.0.0' },
  config: options,
  configSchema: SeoConfig,
}))

describe('validateModuleConfigs', () => {
  it('returns schema output with defaults, and raw config for modules without a schema', async () => {
    const raw: BlixisModule = {
      meta: { name: 'raw', version: '1.0.0' },
      config: { anything: true },
    }
    const configs = await validateModuleConfigs([seo({ maxLength: 60 }), raw])
    expect(configs.get('@acme/seo')).toEqual({ defaultTitle: 'Untitled', maxLength: 60 })
    expect(configs.get('raw')).toEqual({ anything: true })
  })

  it('aggregates problems across modules with paths, without leaking values', async () => {
    const other = defineModule((options: { apiKey?: unknown }) => ({
      meta: { name: '@acme/other', version: '1.0.0' },
      config: options,
      configSchema: z.object({ apiKey: z.string().min(10) }),
    }))
    const error = await validateModuleConfigs([
      seo({ maxLength: -1 }),
      other({ apiKey: 'sk_short' }),
    ]).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ModuleValidationError)
    const problems = (error as ModuleValidationError).problems
    expect(problems.map((p) => p.module)).toEqual(['@acme/seo', '@acme/other'])
    expect(problems[0]?.message).toMatch(/^invalid configuration at config\.maxLength: /)
    expect(problems[1]?.message).toMatch(/^invalid configuration at config\.apiKey: /)
    expect((error as Error).message).not.toContain('sk_short')
  })

  it('validates an absent config as {}', async () => {
    const error = await validateModuleConfigs([seo()]).catch((e: unknown) => e)
    expect((error as ModuleValidationError).problems[0]?.message).toContain('config.maxLength')
  })
})

describe('createBlixis config handling', () => {
  it('passes validated config to setup and fails ready() on invalid config', async () => {
    let seen: unknown
    const withSetup = defineModule((options: { maxLength?: number }) => ({
      meta: { name: '@acme/seo', version: '1.0.0' },
      config: options,
      configSchema: SeoConfig,
      setup(ctx) {
        seen = ctx.config
      },
    }))
    await createBlixis({ modules: [withSetup({ maxLength: 70 })], logger: noopLogger }).ready()
    expect(seen).toEqual({ defaultTitle: 'Untitled', maxLength: 70 })
    await expect(
      createBlixis({ modules: [withSetup({})], logger: noopLogger }).ready(),
    ).rejects.toBeInstanceOf(ModuleValidationError)
  })
})
