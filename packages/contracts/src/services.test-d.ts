import { expectTypeOf, test } from 'vitest'
import type { BlixisCapabilityId, CapabilityId } from './capabilities.ts'
import {
  createServiceToken,
  type ServiceOf,
  type ServiceRegistry,
  type ServiceToken,
} from './services.ts'

declare const registry: ServiceRegistry

test('get() returns the token type', () => {
  expectTypeOf(registry.get(createServiceToken<number>('n'))).toEqualTypeOf<number>()
  expectTypeOf(registry.getOptional(createServiceToken<string>('s'))).toEqualTypeOf<
    string | undefined
  >()
})

test('tokens of different service types are not assignable to each other', () => {
  expectTypeOf<ServiceToken<string>>().not.toExtend<ServiceToken<number>>()
  // @ts-expect-error a string token is not a number token
  const wrong: ServiceToken<number> = createServiceToken<string>('s')
  expectTypeOf(wrong).toBeObject()
})

test('has() accepts tokens of any service type', () => {
  registry.has(createServiceToken<string>('s'))
  registry.has(createServiceToken<{ ping(): void }>('p'))
})

test('ServiceOf extracts the service type', () => {
  const token = createServiceToken<{ ping(): string }>('p')
  expectTypeOf<ServiceOf<typeof token>>().toEqualTypeOf<{ ping(): string }>()
})

test('capability ids are dotted strings', () => {
  expectTypeOf<'blixis.assets'>().toExtend<CapabilityId>()
  expectTypeOf<'assets'>().not.toExtend<CapabilityId>()
  expectTypeOf<BlixisCapabilityId>().toExtend<CapabilityId>()
})
