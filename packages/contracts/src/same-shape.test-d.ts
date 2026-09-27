import { expectTypeOf, test } from 'vitest'
import type { SameShape } from './module.ts'

test('SameShape ignores readonly and optional undefined, and nothing else', () => {
  interface View {
    readonly id: string
    readonly tags: readonly string[]
    readonly note?: string
    readonly nested: { readonly at: string | null }
  }
  type Output = {
    id: string
    tags: string[]
    note?: string | undefined
    nested: { at: string | null }
  }
  expectTypeOf<SameShape<Output, View>>().toEqualTypeOf<true>()
  // Missing, extra, and differently typed properties are mismatches.
  expectTypeOf<SameShape<Omit<Output, 'note' | 'id'>, View>>().toEqualTypeOf<false>()
  expectTypeOf<SameShape<Output & { extra: number }, View>>().toEqualTypeOf<false>()
  expectTypeOf<SameShape<Output & { id: number }, View>>().toEqualTypeOf<false>()
  expectTypeOf<
    SameShape<{ id: string; tags: string[]; nested: { at: string } }, View>
  >().toEqualTypeOf<false>()
})
