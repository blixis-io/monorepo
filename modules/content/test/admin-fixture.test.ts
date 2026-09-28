// biome-ignore lint/correctness/noNodejsModules: reads the admin's fixture it keeps honest (Node test)
import { readFileSync, writeFileSync } from 'node:fs'
// biome-ignore lint/correctness/noNodejsModules: reads the admin's fixture it keeps honest (Node test)
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BUILT_IN_FIELD_TYPES } from '../src/field-types/built-in/index.ts'
import { createFieldTypeRegistry } from '../src/field-types/define.ts'

// The admin's component tests use this response of GET /api/v1/field-types (the admin may not
// import server packages). Regenerate: UPDATE_FIXTURES=1 npx vitest run modules/content/test/admin-fixture.test.ts
const fixture = fileURLToPath(
  new URL('../../../apps/admin/test/fixtures/field-types.json', import.meta.url),
)

describe('admin field-types fixture', () => {
  it('matches the built-in field types', () => {
    const actual = `${JSON.stringify({ fieldTypes: createFieldTypeRegistry(BUILT_IN_FIELD_TYPES, []).describe() }, null, 2)}\n`
    if (process.env['UPDATE_FIXTURES'] === '1') writeFileSync(fixture, actual)
    expect(readFileSync(fixture, 'utf8')).toBe(actual)
  })
})
