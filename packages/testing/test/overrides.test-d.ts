import { createServiceToken } from '@blixis/contracts'
import { test } from 'vitest'
import { serviceOverride } from '../src/index.ts'

test('serviceOverride checks the value against the token type', () => {
  const token = createServiceToken<{ greet(name: string): string }>('@t/greet')
  serviceOverride(token, { greet: (n) => n })
  // @ts-expect-error wrong service shape
  serviceOverride(token, { greet: 1 })
})
