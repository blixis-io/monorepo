import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  BUILT_IN_FIELD_TYPES,
  type ContentType,
  compileEntrySchema,
  createFieldTypeRegistry,
  defineFieldType,
  type FieldDefinition,
} from '../src/index.ts'

/** Keeps the manual honest: the tutorial model and examples must behave as documented. */

const CARD = '01a0d8f9-0000-7000-8000-0000000000c1'
const SECTION = '01a0d8f9-0000-7000-8000-0000000000c2'
const HERO = '01a0d8f9-0000-7000-8000-0000000000c3'

let n = 0
const f = (apiId: string, type: string, extra: Partial<FieldDefinition> = {}): FieldDefinition => ({
  id: `d${String(++n).padStart(7, '0')}`,
  apiId,
  name: apiId,
  type,
  required: false,
  localized: false,
  disabled: false,
  settings: {},
  ...extra,
})
const ct = (
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
  groups: [{ id: 'style', name: 'Style' }],
  fields,
  version: 1,
  createdAt: '',
  updatedAt: '',
})

// Tutorial 5: card, section, hero, page.
const card = ct(CARD, 'card', 'component', [
  f('title', 'text', { required: true }),
  f('text', 'longText', { settings: { maxLength: 300 } }),
  f('image', 'asset', { settings: { mimeTypes: ['image/*'] } }),
  f('link', 'link'),
])
const section = ct(SECTION, 'section', 'component', [
  f('title', 'text'),
  f('text', 'richText', {
    settings: { nodes: ['heading', 'bulletList', 'orderedList'], headingLevels: [3, 4] },
  }),
  f('cards', 'blocks', { settings: { componentIds: [CARD], max: 12 } }),
  f('background', 'select', {
    group: 'style',
    settings: {
      options: [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
    },
  }),
])
const hasButton = f('hasButton', 'boolean')
const hero = ct(HERO, 'hero', 'component', [
  f('heading', 'text', { required: true }),
  f('intro', 'longText'),
  hasButton,
  f('button', 'link', {
    required: true,
    settings: { text: 'required' },
    showWhen: { field: hasButton.id, equals: true },
  }),
])
const page = ct('01a0d8f9-0000-7000-8000-0000000000c4', 'page', 'entry', [
  f('title', 'text', { required: true, localized: true }),
  f('slug', 'text', { required: true, settings: { format: 'slug' } }),
  f('body', 'blocks', { localized: true, settings: { componentIds: [HERO, SECTION], min: 1 } }),
  f('metaDescription', 'longText', { localized: true, settings: { maxLength: 160 } }),
])

const tutorialPage = {
  title: { 'en-US': 'Courses' },
  slug: 'courses',
  metaDescription: { 'en-US': 'All our courses for autumn 2026.' },
  body: {
    'en-US': [
      {
        _id: 'hEro0001',
        _type: 'hero',
        heading: 'Learn something new',
        hasButton: true,
        button: { kind: 'url', url: 'https://example.com/enrol', text: 'Enrol now' },
      },
      {
        _id: 'sEct0001',
        _type: 'section',
        title: 'Popular courses',
        background: 'light',
        cards: [
          { _id: 'cArd0001', _type: 'card', title: 'Yoga', text: 'Mondays at 10:00' },
          { _id: 'cArd0002', _type: 'card', title: 'Bridge for beginners' },
        ],
      },
    ],
  },
}

describe('manual examples', () => {
  const registry = createFieldTypeRegistry(BUILT_IN_FIELD_TYPES, [])
  const schema = compileEntrySchema({
    contentType: page,
    types: [page, hero, section, card],
    locales: ['en-US', 'nl-NL'],
    defaultLocale: 'en-US',
    mode: 'publish',
    registry,
  })

  it('tutorial 5: the example page is valid', () => {
    expect(schema.validate(tutorialPage)).toEqual({ ok: true, fields: tutorialPage })
  })

  it('tutorial 5: an enabled but empty button is reported at the documented path', () => {
    const [heroBlock, ...rest] = tutorialPage.body['en-US']
    const { button: _, ...withoutButton } = heroBlock as Record<string, unknown>
    const result = schema.validate({ ...tutorialPage, body: { 'en-US': [withoutButton, ...rest] } })
    expect(result).toEqual({
      ok: false,
      issues: [{ path: ['fields', 'body', 'en-US', 0, 'button'], message: 'Required' }],
    })
  })

  it('custom field types: the documented color field works', () => {
    const colorField = defineFieldType({
      id: 'acme.color',
      name: 'Color',
      description: 'A hex color',
      settings: z
        .object({
          allowAlpha: z.boolean().default(false),
          palette: z
            .array(z.string().regex(/^#[0-9a-f]{6}$/i))
            .max(50)
            .default([]),
        })
        .strict(),
      value: (settings) => {
        const hex = settings.allowAlpha ? /^#[0-9a-f]{6}([0-9a-f]{2})?$/i : /^#[0-9a-f]{6}$/i
        return z
          .string()
          .regex(hex, 'Use a hex color such as #ff6600')
          .refine(
            (v) =>
              settings.palette.length === 0 ||
              settings.palette.includes(v.slice(0, 7).toLowerCase()),
            {
              message: 'Pick a color from the palette',
            },
          )
      },
      isEmpty: (value) => value === undefined || value === null || value === '',
      graphql: () => ({ type: 'String', list: false }),
    })
    const check = (settings: unknown, value: unknown) =>
      colorField
        .value(colorField.settings.parse(settings), {
          mode: 'publish',
          depth: 0,
          component: () => undefined,
        })
        .safeParse(value).success
    expect(check({}, '#ff6600')).toBe(true)
    expect(check({}, 'orange')).toBe(false)
    expect(check({ allowAlpha: true }, '#ff6600cc')).toBe(true)
    expect(check({ palette: ['#000000'] }, '#ff6600')).toBe(false)
    expect(colorField.settings.safeParse({ unknown: 1 }).success).toBe(false)

    const brand = ct('01a0d8f9-0000-7000-8000-0000000000c5', 'brand', 'entry', [
      f('brandColor', 'acme.color'),
    ])
    const entry = compileEntrySchema({
      contentType: brand,
      types: [brand],
      locales: ['en-US'],
      defaultLocale: 'en-US',
      mode: 'publish',
      registry: createFieldTypeRegistry(BUILT_IN_FIELD_TYPES, [colorField as never]),
    })
    expect(entry.validate({ brandColor: '#ff6600' })).toEqual({
      ok: true,
      fields: { brandColor: '#ff6600' },
    })
  })
})
