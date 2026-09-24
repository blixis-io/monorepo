import type { BlixisModule } from '@blixis/contracts'
import { expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { defineModule } from './define-module.ts'

test('object form yields () => BlixisModule', () => {
  const content = defineModule({ meta: { name: '@blixis/content', version: '1.0.0' } })
  expectTypeOf(content).parameters.toEqualTypeOf<[]>()
  expectTypeOf(content()).toEqualTypeOf<BlixisModule<unknown>>()
})

test('factory form infers options and rejects unknown keys', () => {
  const Config = z.object({ defaultTitle: z.string().default('Untitled') })
  const seo = defineModule((options: { defaultTitle?: string }) => ({
    meta: { name: '@acme/blixis-seo', version: '1.0.0' },
    config: options,
    configSchema: Config,
    setup(ctx) {
      expectTypeOf(ctx.config).toEqualTypeOf<{ defaultTitle: string }>()
    },
  }))
  seo({ defaultTitle: 'x' })
  seo()
  // @ts-expect-error unknown option
  seo({ title: 'x' })
  expectTypeOf(seo()).toEqualTypeOf<BlixisModule<{ defaultTitle: string }>>()
})
