import { describe, expect, it } from 'vitest'
import type { ContentType, FieldDefinition } from '../src/domain/content-type.ts'
import { collectLinks } from '../src/domain/links.ts'

const A = '01a0d8f9-0000-7000-8000-00000000000a'
const B = '01a0d8f9-0000-7000-8000-00000000000b'
const C = '01a0d8f9-0000-7000-8000-00000000000c'
const HERO = '01a0d8f9-0000-7000-8000-0000000000f1'
const f = (id: string, type: string, localized = false): FieldDefinition => ({
  id,
  apiId: id,
  name: id,
  type,
  required: false,
  localized,
  disabled: false,
  settings: {},
})
const type = (id: string, kind: ContentType['kind'], fields: FieldDefinition[]): ContentType => ({
  id,
  organizationId: 'o',
  spaceId: 's',
  environmentId: 'e',
  kind,
  apiId: id,
  name: id,
  description: '',
  displayFieldId: null,
  groups: [],
  fields,
  version: 1,
  createdAt: '',
  updatedAt: '',
})

describe('collectLinks', () => {
  it('finds links in references, assets, links, rich text, and nested blocks', () => {
    const hero = type(HERO, 'component', [f('button', 'link'), f('image', 'asset')])
    const page = type('page', 'entry', [
      f('author', 'reference'),
      f('related', 'reference', true),
      f('cta', 'link'),
      f('body', 'richText', true),
      f('blocks', 'blocks', true),
      f('title', 'text'),
    ])
    const links = collectLinks(page, [page, hero], {
      author: { type: 'entry', id: A },
      related: { 'en-US': [{ type: 'entry', id: B }], 'nl-NL': [{ type: 'entry', id: A }] },
      cta: { kind: 'url', url: 'https://x.nl' },
      body: {
        'en-US': {
          type: 'doc',
          content: [
            { type: 'embeddedAsset', attrs: { id: C } },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'x',
                  marks: [{ type: 'link', attrs: { href: '/b', entryId: B } }],
                },
              ],
            },
          ],
        },
      },
      blocks: {
        'en-US': [
          {
            _id: 'x',
            _type: HERO,
            button: { kind: 'entry', id: C },
            image: { type: 'asset', id: A },
          },
        ],
      },
      title: A,
    })
    expect(links).toEqual([
      { type: 'entry', id: A },
      { type: 'entry', id: B },
      { type: 'entry', id: A },
      { type: 'asset', id: C },
      { type: 'entry', id: B },
      { type: 'entry', id: C },
      { type: 'asset', id: A },
    ])
  })
})
