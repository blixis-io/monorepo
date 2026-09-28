import type { ContentType } from '@blixis-io/sdk'
import { describe, expect, it } from 'vitest'
import {
  draftFromApi,
  issuesByField,
  moveField,
  newField,
  removeField,
  renameApiId,
  toApiId,
  toUpdateBody,
  uniqueApiId,
} from './draft.ts'

const type: ContentType = {
  id: 'ct-1',
  environmentId: 'env',
  kind: 'entry',
  apiId: 'page',
  name: 'Page',
  description: '',
  displayField: 'title',
  groups: [],
  fields: [
    {
      id: 'aaaaaaaa',
      apiId: 'title',
      name: 'Title',
      type: 'text',
      required: true,
      localized: false,
      disabled: false,
      settings: {},
    },
    {
      id: 'bbbbbbbb',
      apiId: 'showCta',
      name: 'Show CTA',
      type: 'boolean',
      required: false,
      localized: false,
      disabled: false,
      settings: {},
    },
    {
      id: 'cccccccc',
      apiId: 'cta',
      name: 'CTA',
      type: 'link',
      required: false,
      localized: false,
      disabled: false,
      settings: {},
      showWhen: { field: 'showCta', equals: true },
    },
  ],
  version: 3,
  createdAt: '',
  updatedAt: '',
}

describe('content type draft', () => {
  it('derives camelCase API ids and keeps them unique and unreserved', () => {
    expect(toApiId('Hero image')).toBe('heroImage')
    expect(toApiId('Café Menu 2')).toBe('cafeMenu2')
    expect(toApiId('2nd title')).toBe('ndTitle')
    expect(uniqueApiId('title', ['title', 'title2'])).toBe('title3')
    expect(uniqueApiId('type', [])).toBe('type2')
    expect(uniqueApiId('', [])).toBe('field')
  })

  it('sends new fields without id and existing ones with it, in order', () => {
    const draft = draftFromApi(type)
    const added = newField({ id: 'number', name: 'Number' }, draft.fields)
    const body = toUpdateBody({ ...draft, fields: [added, ...draft.fields] }, type.version)
    expect(body.version).toBe(3)
    expect(body.fields?.[0]).toEqual({
      apiId: 'number',
      name: 'Number',
      type: 'number',
      required: false,
      localized: false,
      disabled: false,
      settings: {},
    })
    expect(body.fields?.[1]).toMatchObject({ id: 'aaaaaaaa', apiId: 'title' })
    expect(body.fields?.[3]).toMatchObject({ showWhen: { field: 'showCta', equals: true } })
  })

  it('moves fields and ignores moves past the ends', () => {
    const fields = draftFromApi(type).fields
    expect(moveField(fields, 'bbbbbbbb', -1).map((f) => f.apiId)).toEqual([
      'showCta',
      'title',
      'cta',
    ])
    expect(moveField(fields, 'aaaaaaaa', -1).map((f) => f.apiId)).toEqual([
      'title',
      'showCta',
      'cta',
    ])
  })

  it('removes a field with the references to it', () => {
    let draft = removeField(draftFromApi(type), 'aaaaaaaa')
    expect(draft.displayField).toBeNull()
    draft = removeField(draft, 'bbbbbbbb')
    expect(draft.fields[0]?.showWhen).toBeUndefined()
  })

  it('renames references with an API id', () => {
    const draft = renameApiId(
      renameApiId(draftFromApi(type), 'aaaaaaaa', 'heading'),
      'bbbbbbbb',
      'withCta',
    )
    expect(draft.displayField).toBe('heading')
    expect(draft.fields[2]?.showWhen?.field).toBe('withCta')
  })

  it('groups server issues per field', () => {
    const draft = draftFromApi(type)
    const { general, byField } = issuesByField(draft, [
      { path: ['fields', 1, 'settings', 'max'], message: 'Too big' },
      { path: ['fields', 1], message: 'Odd' },
      { path: ['displayField'], message: 'Must name a text field of this type' },
    ])
    expect(byField.get('bbbbbbbb')).toEqual(['settings.max: Too big', 'Odd'])
    expect(general).toEqual(['displayField: Must name a text field of this type'])
  })
})
