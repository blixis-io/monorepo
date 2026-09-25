import { describe, expect, it } from 'vitest'
import {
  compileEntrySchema,
  createEntrySchemaCache,
  type EntrySchemaOptions,
} from '../src/application/entry-schema.ts'
import type { ContentType, FieldDefinition } from '../src/domain/content-type.ts'
import { BUILT_IN_FIELD_TYPES } from '../src/field-types/built-in/index.ts'
import { createFieldTypeRegistry } from '../src/field-types/define.ts'

const registry = createFieldTypeRegistry(BUILT_IN_FIELD_TYPES, [])
const HERO = '01a0d8f9-0000-7000-8000-000000000001'
const SECTION = '01a0d8f9-0000-7000-8000-000000000002'

let n = 0
const field = (
  apiId: string,
  type: string,
  extra: Partial<FieldDefinition> = {},
): FieldDefinition => ({
  id: `f${String(++n).padStart(7, '0')}`,
  apiId,
  name: apiId,
  type,
  required: false,
  localized: false,
  disabled: false,
  settings: {},
  ...extra,
})
const type = (
  id: string,
  apiId: string,
  kind: ContentType['kind'],
  fields: FieldDefinition[],
): ContentType => ({
  id,
  organizationId: 'o',
  spaceId: 's',
  environmentId: 'e',
  kind,
  apiId,
  name: apiId,
  description: '',
  displayFieldId: null,
  groups: [],
  fields,
  version: 1,
  createdAt: '',
  updatedAt: '',
})

const hero = type(HERO, 'hero', 'component', [
  field('heading', 'text', { required: true }),
  field('image', 'asset'),
])
const section = type(SECTION, 'section', 'component', [
  field('title', 'text'),
  field('children', 'blocks', { settings: { componentIds: [HERO, SECTION] } }),
])
const hasCta = field('hasCta', 'boolean')
const page = type('01a0d8f9-0000-7000-8000-00000000000a', 'page', 'entry', [
  field('title', 'text', { required: true, localized: true }),
  field('slug', 'text', { required: true, settings: { format: 'slug' } }),
  field('body', 'blocks', { localized: true, settings: { componentIds: [HERO, SECTION] } }),
  hasCta,
  field('cta', 'link', { required: true, showWhen: { field: hasCta.id, equals: true } }),
  field('legacy', 'text', { disabled: true }),
])

const options = (overrides: Partial<EntrySchemaOptions> = {}): EntrySchemaOptions => ({
  contentType: page,
  types: [page, hero, section],
  locales: ['en-US', 'nl-NL'],
  defaultLocale: 'en-US',
  mode: 'publish',
  registry,
  ...overrides,
})
const issues = (fields: unknown, o: Partial<EntrySchemaOptions> = {}) => {
  const result = compileEntrySchema(options(o)).validate(fields)
  return result.ok ? [] : result.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}

const valid = {
  title: { 'en-US': 'Home', 'nl-NL': 'Thuis' },
  slug: 'home',
  body: {
    'en-US': [
      { _id: 'hEro0001', _type: 'hero', heading: 'Welcome' },
      {
        _id: 'sEct0001',
        _type: 'section',
        title: 'About',
        children: [{ _id: 'hEro0002', _type: 'hero', heading: 'Nested' }],
      },
    ],
  },
  hasCta: false,
}

describe('compileEntrySchema', () => {
  it('accepts a valid page with localized blocks and nested components', () => {
    expect(issues(valid)).toEqual([])
  })

  it('reports unknown fields, unknown locales, and wrong shapes with precise paths', () => {
    expect(
      issues({
        ...valid,
        subtitle: 'x',
        title: { 'en-US': 'Home', 'de-DE': 'Heim' },
        slug: { 'en-US': 'home' },
      }),
    ).toEqual([
      'fields.subtitle: Unknown field',
      'fields.title.de-DE: Unknown locale',
      'fields.slug: Invalid input: expected string, received object',
    ])
    expect(issues({ ...valid, title: 'Home' })).toEqual([
      'fields.title: Expected values per locale, e.g. { "en-US": … }',
    ])
    expect(issues('nope')).toEqual(['fields: Expected an object of fields'])
  })

  it('enforces required on publish (default locale for localized fields), not in drafts', () => {
    const draft = { title: { 'nl-NL': 'Thuis' } }
    expect(issues(draft)).toEqual(['fields.title.en-US: Required', 'fields.slug: Required'])
    expect(issues(draft, { mode: 'draft' })).toEqual([])
    expect(issues({ ...valid, title: { 'en-US': '  ' } })).toEqual(['fields.title.en-US: Required'])
  })

  it('requires a showWhen field only while its condition holds', () => {
    expect(issues({ ...valid, hasCta: true })).toEqual(['fields.cta: Required'])
    expect(
      issues({
        ...valid,
        hasCta: true,
        cta: { kind: 'url', url: 'https://blixis.dev', text: 'Go' },
      }),
    ).toEqual([])
    // A hidden field is still type-checked when it has a value.
    expect(issues({ ...valid, cta: { kind: 'url', url: 'ftp://x' } })).toHaveLength(1)
  })

  it('validates component fields inside blocks with paths through locale and index', () => {
    const body = {
      'en-US': [
        { _id: 'hEro0001', _type: 'hero' },
        {
          _id: 'sEct0001',
          _type: 'section',
          children: [{ _id: 'hEro0002', _type: 'hero', heading: 7 }],
        },
        { _id: 'hEro0003', _type: 'hero', heading: 'x', extra: true },
      ],
    }
    expect(issues({ ...valid, body })).toEqual([
      'fields.body.en-US.0.heading: Required',
      'fields.body.en-US.1.children.0.heading: Invalid input: expected string, received number',
      'fields.body.en-US.2.extra: Unknown field',
    ])
  })

  it('stops block nesting at the depth limit', () => {
    let nested: unknown[] = [{ _id: 'hEro0009', _type: 'hero', heading: 'deep' }]
    for (let i = 0; i < 6; i++)
      nested = [{ _id: `sEct000${i}`, _type: 'section', children: nested }]
    const result = issues({ ...valid, body: { 'en-US': nested } })
    expect(result.some((i) => i.endsWith('Blocks nest at most 5 levels deep'))).toBe(true)
  })

  it('ignores disabled fields for validation and rejects them in input', () => {
    expect(issues({ ...valid, legacy: 'old' })).toEqual(['fields.legacy: Unknown field'])
  })

  it('maps apiIds to stable ids and back, including component types in blocks', () => {
    const schema = compileEntrySchema(options())
    const stored = schema.toStorage(valid)
    const title = page.fields.find((f) => f.apiId === 'title')
    const body = page.fields.find((f) => f.apiId === 'body')
    expect(stored[title?.id ?? '']).toEqual(valid.title)
    const blocks = (stored[body?.id ?? ''] as Record<string, unknown[]>)['en-US'] ?? []
    expect(blocks[0]).toMatchObject({ _id: 'hEro0001', _type: HERO })
    expect(JSON.stringify(stored)).not.toContain('"heading"')
    expect(schema.fromStorage(stored)).toEqual(valid)
    // Renaming an apiId keeps stored data readable under the new name.
    const renamed = compileEntrySchema(
      options({
        contentType: {
          ...page,
          version: 2,
          fields: page.fields.map((f) => (f.apiId === 'slug' ? { ...f, apiId: 'path' } : f)),
        },
      }),
    )
    expect(renamed.fromStorage(stored)['path']).toBe('home')
  })
})

describe('entry schema cache', () => {
  it('reuses compiled schemas and misses when a version or locale changes', () => {
    const cache = createEntrySchemaCache(2)
    const a = cache.get(options())
    expect(cache.get(options())).toBe(a)
    expect(cache.get(options({ contentType: { ...page, version: 2 } }))).not.toBe(a)
    expect(cache.get(options({ types: [page, { ...hero, version: 2 }, section] }))).not.toBe(a)
    expect(cache.size).toBe(2)
  })
})
