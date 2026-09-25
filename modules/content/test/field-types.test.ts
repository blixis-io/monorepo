import { ModuleError } from '@blixis/contracts'
import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { permissionsModule } from '@blixis/permissions'
import { spacesModule } from '@blixis/spaces'
import { asAnonymous, asUser, createTestBlixis } from '@blixis/testing'
import { usersModule } from '@blixis/users'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  assetField,
  BUILT_IN_FIELD_TYPES,
  blocksField,
  booleanField,
  contentModule,
  createFieldTypeRegistry,
  dateField,
  dateTimeField,
  defineFieldType,
  type FieldTypeDefinition,
  type FieldValueContext,
  jsonField,
  linkField,
  longTextField,
  numberField,
  referenceField,
  richTextField,
  selectField,
  textField,
} from '../src/index.ts'

const ID = '01a0d8f9-1f10-708c-9da9-8397f35d1c3e'
const OTHER = '01a0d8f9-1f10-708c-9da9-8397f35d1c3f'

const context = (overrides: Partial<FieldValueContext> = {}): FieldValueContext => ({
  mode: 'publish',
  depth: 0,
  component: () => undefined,
  ...overrides,
})

// biome-ignore lint/suspicious/noExplicitAny: tests exercise every type generically
function check(type: FieldTypeDefinition<any>, settings: unknown, value: unknown, ctx = context()) {
  const parsed = type.settings.parse(settings)
  const result = type.value(parsed, ctx).safeParse(value)
  return result.success ? 'ok' : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}
// biome-ignore lint/suspicious/noExplicitAny: see above
const settingsOk = (type: FieldTypeDefinition<any>, settings: unknown) =>
  type.settings.safeParse(settings).success

describe('built-in field types', () => {
  it('registers 13 types with unique plain ids', () => {
    const ids = BUILT_IN_FIELD_TYPES.map((t) => t.id)
    expect(ids).toEqual([
      'text',
      'longText',
      'richText',
      'number',
      'boolean',
      'date',
      'dateTime',
      'select',
      'reference',
      'asset',
      'link',
      'blocks',
      'json',
    ])
  })

  it('text: length, formats, and safe patterns', () => {
    expect(check(textField, {}, 'Hello')).toBe('ok')
    expect(check(textField, {}, 'x'.repeat(257))).not.toBe('ok')
    expect(check(textField, { minLength: 3, maxLength: 5 }, 'ab')).not.toBe('ok')
    expect(check(textField, { format: 'slug' }, 'hello-world')).toBe('ok')
    expect(check(textField, { format: 'slug' }, 'Hello World')).not.toBe('ok')
    expect(check(textField, { format: 'email' }, 'a@example.com')).toBe('ok')
    expect(check(textField, { format: 'url' }, 'javascript:alert(1)')).not.toBe('ok')
    expect(
      check(textField, { pattern: '^[A-Z]{3}$', patternMessage: 'Three capitals' }, 'abc'),
    ).toEqual([': Three capitals'])
    expect(settingsOk(textField, { pattern: '(a+)+$' })).toBe(false)
    expect(settingsOk(textField, { pattern: '([' })).toBe(false)
    expect(settingsOk(textField, { maxLength: 1000 })).toBe(false)
    expect(settingsOk(textField, { minLength: 10, maxLength: 5 })).toBe(false)
    expect(settingsOk(textField, { unknown: true })).toBe(false)
  })

  it('longText, number, boolean', () => {
    expect(check(longTextField, {}, 'a\nb')).toBe('ok')
    expect(check(longTextField, { maxLength: 3 }, 'abcd')).not.toBe('ok')
    expect(check(numberField, {}, 1.5)).toBe('ok')
    expect(check(numberField, { integer: true }, 1.5)).not.toBe('ok')
    expect(check(numberField, { min: 0, max: 10 }, 11)).not.toBe('ok')
    expect(check(numberField, {}, '1')).not.toBe('ok')
    expect(settingsOk(numberField, { min: 5, max: 1 })).toBe(false)
    expect(numberField.graphql?.(numberField.settings.parse({ integer: true }))).toEqual({
      type: 'Int',
      list: false,
    })
    expect(check(booleanField, {}, false)).toBe('ok')
    expect(check(booleanField, {}, 'true')).not.toBe('ok')
  })

  it('date and dateTime', () => {
    expect(check(dateField, {}, '2026-09-25')).toBe('ok')
    expect(check(dateField, {}, '2026-02-30')).not.toBe('ok')
    expect(check(dateField, { min: '2026-01-01' }, '2025-12-31')).not.toBe('ok')
    expect(check(dateTimeField, {}, '2026-09-25T14:30:00+02:00')).toBe('ok')
    expect(check(dateTimeField, {}, '2026-09-25T14:30:00Z')).toBe('ok')
    expect(check(dateTimeField, {}, '2026-09-25 14:30')).not.toBe('ok')
  })

  it('select: options, multiple, unique values, min only on publish', () => {
    const options = [
      { value: 'red', label: 'Red' },
      { value: 'blue', label: 'Blue' },
    ]
    expect(check(selectField, { options }, 'red')).toBe('ok')
    expect(check(selectField, { options }, 'green')).not.toBe('ok')
    expect(check(selectField, { options, multiple: true }, ['red', 'blue'])).toBe('ok')
    expect(check(selectField, { options, multiple: true }, ['red', 'red'])).not.toBe('ok')
    expect(check(selectField, { options, multiple: true, min: 2 }, ['red'])).not.toBe('ok')
    expect(
      check(selectField, { options, multiple: true, min: 2 }, ['red'], context({ mode: 'draft' })),
    ).toBe('ok')
    expect(settingsOk(selectField, { options: [] })).toBe(false)
    expect(settingsOk(selectField, { options: [...options, options[0]] })).toBe(false)
  })

  it('reference and asset: typed links, one or many', () => {
    expect(check(referenceField, {}, { type: 'entry', id: ID })).toBe('ok')
    expect(check(referenceField, {}, { type: 'asset', id: ID })).not.toBe('ok')
    expect(check(referenceField, {}, { type: 'entry', id: 'nope' })).not.toBe('ok')
    expect(
      check(referenceField, { multiple: true, max: 1 }, [
        { type: 'entry', id: ID },
        { type: 'entry', id: OTHER },
      ]),
    ).not.toBe('ok')
    expect(check(assetField, { multiple: true }, [{ type: 'asset', id: ID }])).toBe('ok')
    expect(settingsOk(assetField, { mimeTypes: ['image/*', 'application/pdf'] })).toBe(true)
    expect(settingsOk(assetField, { mimeTypes: ['images'] })).toBe(false)
  })

  it('link: allowed kinds, text rules, and safe URLs', () => {
    expect(check(linkField, {}, { kind: 'url', url: 'https://blixis.dev', text: 'Docs' })).toBe(
      'ok',
    )
    expect(check(linkField, {}, { kind: 'entry', id: ID, newTab: true })).toBe('ok')
    expect(check(linkField, {}, { kind: 'email', email: 'a@example.com' })).not.toBe('ok')
    expect(
      check(linkField, { kinds: ['email', 'phone'] }, { kind: 'phone', phone: '+31 6 1234 5678' }),
    ).toBe('ok')
    expect(check(linkField, {}, { kind: 'url', url: 'javascript:alert(1)' })).not.toBe('ok')
    expect(check(linkField, { text: 'required' }, { kind: 'url', url: 'https://a.nl' })).toEqual([
      'text: Link text is required',
    ])
    expect(
      check(linkField, { allowNewTab: false }, { kind: 'url', url: 'https://a.nl', newTab: true }),
    ).toEqual(['newTab: Opening in a new tab is not allowed'])
  })

  it('richText: structure, allowed nodes and marks, safe links, emptiness', () => {
    const doc = (...content: unknown[]) => ({ type: 'doc', content })
    const p = (...content: unknown[]) => ({ type: 'paragraph', content })
    const text = (value: string, marks?: unknown[]) => ({
      type: 'text',
      text: value,
      ...(marks ? { marks } : {}),
    })
    expect(
      check(
        richTextField,
        {},
        doc(
          { type: 'heading', attrs: { level: 2 }, content: [text('Title')] },
          p(
            text('Hi '),
            text('there', [{ type: 'bold' }, { type: 'link', attrs: { href: '/about' } }]),
          ),
          { type: 'bulletList', content: [{ type: 'listItem', content: [p(text('One'))] }] },
          {
            type: 'table',
            content: [
              { type: 'tableRow', content: [{ type: 'tableCell', content: [p(text('A1'))] }] },
            ],
          },
          { type: 'embeddedEntry', attrs: { id: ID } },
        ),
      ),
    ).toBe('ok')
    expect(check(richTextField, {}, '<p>Hi</p>')).not.toBe('ok')
    expect(check(richTextField, {}, doc({ type: 'script' }))).toEqual([
      'content.0.type: Unknown node "script"',
    ])
    expect(check(richTextField, {}, doc(text('loose')))).toEqual([
      'content.0.type: "text" cannot appear here',
    ])
    expect(
      check(
        richTextField,
        { nodes: [] },
        doc({ type: 'heading', attrs: { level: 2 }, content: [] }),
      ),
    ).toEqual(['content.0.type: "heading" is not allowed in this field'])
    expect(
      check(
        richTextField,
        { headingLevels: [2, 3] },
        doc({ type: 'heading', attrs: { level: 1 } }),
      ),
    ).toEqual(['content.0.attrs.level: Heading level must be one of 2, 3'])
    expect(
      check(
        richTextField,
        {},
        doc(p(text('x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]))),
      ),
    ).toEqual([
      'content.0.content.0.marks.0.attrs.href: Links need an http(s), mailto:, tel:, or relative href',
    ])
    expect(
      check(richTextField, { marks: ['bold'] }, doc(p(text('x', [{ type: 'italic' }])))),
    ).toEqual(['content.0.content.0.marks.0.type: "italic" is not allowed in this field'])
    let deep: unknown = p(text('deep'))
    for (let i = 0; i < 25; i++) deep = { type: 'blockquote', content: [deep] }
    expect(check(richTextField, {}, doc(deep))).not.toBe('ok')
    const settings = richTextField.settings.parse({})
    expect(richTextField.isEmpty?.(doc(p()), settings)).toBe(true)
    expect(richTextField.isEmpty?.(doc(p(text('x'))), settings)).toBe(false)
  })

  it('json: any JSON up to 64 KiB', () => {
    expect(check(jsonField, {}, { a: [1, 'b', null, { c: true }] })).toBe('ok')
    expect(check(jsonField, {}, { big: 'x'.repeat(70_000) })).not.toBe('ok')
    expect(check(jsonField, {}, { fn: undefined })).not.toBe('ok')
  })

  it('blocks: known and allowed components, unique ids, nested errors, depth', () => {
    const hero = { id: ID, apiId: 'hero', schema: z.object({ heading: z.string() }).strict() }
    const banner = { id: OTHER, apiId: 'banner', schema: z.object({}).strict() }
    const ctx = context({ component: (apiId) => [hero, banner].find((c) => c.apiId === apiId) })
    const settings = { componentIds: [ID] }
    expect(
      check(blocksField, settings, [{ _id: 'aB3dE5gH', _type: 'hero', heading: 'Hi' }], ctx),
    ).toBe('ok')
    expect(
      check(blocksField, settings, [{ _id: 'aB3dE5gH', _type: 'hero', heading: 1 }], ctx),
    ).toEqual(['0.heading: Invalid input: expected string, received number'])
    expect(check(blocksField, settings, [{ _id: 'aB3dE5gH', _type: 'banner' }], ctx)).toEqual([
      '0._type: "banner" is not allowed here',
    ])
    expect(check(blocksField, settings, [{ _id: 'aB3dE5gH', _type: 'ghost' }], ctx)).toEqual([
      '0._type: Unknown component "ghost"',
    ])
    expect(
      check(
        blocksField,
        settings,
        [
          { _id: 'aB3dE5gH', _type: 'hero', heading: 'a' },
          { _id: 'aB3dE5gH', _type: 'hero', heading: 'b' },
        ],
        ctx,
      ),
    ).toEqual(['1._id: Block ids must be unique'])
    expect(check(blocksField, settings, [], { ...ctx, depth: 5 })).toEqual([
      ': Blocks nest at most 5 levels deep',
    ])
    expect(settingsOk(blocksField, { componentIds: [] })).toBe(false)
  })
})

describe('field type registry', () => {
  const color = defineFieldType({
    id: 'acme.color',
    name: 'Color',
    description: 'A hex color',
    settings: z.object({ allowAlpha: z.boolean().default(false) }).strict(),
    value: (s) => z.string().regex(s.allowAlpha ? /^#[0-9a-f]{8}$/i : /^#[0-9a-f]{6}$/i),
  })

  it('adds namespaced custom types and rejects clashes', () => {
    const registry = createFieldTypeRegistry(BUILT_IN_FIELD_TYPES, [color as never])
    expect(registry.require('acme.color').name).toBe('Color')
    expect(() => registry.require('acme.size')).toThrowError(ModuleError)
    expect(() =>
      createFieldTypeRegistry(BUILT_IN_FIELD_TYPES, [{ ...color, id: 'color' } as never]),
    ).toThrowError(/vendor\.name/)
    expect(() =>
      createFieldTypeRegistry(BUILT_IN_FIELD_TYPES, [color as never, color as never]),
    ).toThrowError(/registered twice/)
  })

  it('GET /api/v1/field-types lists types with settings as JSON Schema', async () => {
    const t = await createTestBlixis({
      modules: [
        databaseModule(),
        eventsModule(),
        usersModule(),
        spacesModule(),
        permissionsModule(),
        contentModule({ fieldTypes: [color] }),
      ],
    })
    const response = await t.request('/api/v1/field-types', { actor: asUser('u1') })
    const { fieldTypes } = (await response.json()) as {
      fieldTypes: { id: string; builtIn: boolean; settingsSchema: { properties?: object } }[]
    }
    expect(fieldTypes.map((t) => t.id)).toContain('acme.color')
    expect(fieldTypes.find((t) => t.id === 'acme.color')).toMatchObject({
      builtIn: false,
      settingsSchema: { properties: { allowAlpha: { type: 'boolean', default: false } } },
    })
    expect(fieldTypes.find((t) => t.id === 'text')?.builtIn).toBe(true)
    expect((await t.request('/api/v1/field-types', { actor: asAnonymous() })).status).toBe(401)
  })
})
