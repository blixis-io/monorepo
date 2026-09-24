import { expectTypeOf, test } from 'vitest'
import * as contracts from './index.ts'

// Type-test harness: `*.test-d.ts` files are type-checked by `pnpm typecheck`
// (packages/contracts/tsconfig.test.json) and are never emitted.
test('the package entry is a module namespace', () => {
  expectTypeOf(contracts).toBeObject()
})
