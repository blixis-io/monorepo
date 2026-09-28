import type { ContentType, Field } from '@blixis-io/sdk'
import { describe, expect, it } from 'vitest'
import {
  entryTitle,
  fromLocalInput,
  getValue,
  groupIssues,
  isVisible,
  newBlockId,
  setValue,
  toLocalInput,
} from './values.ts'

const field = (apiId: string, type: string, extra: Partial<Field> = {}): Field => ({
  id: `${apiId}0000000`.slice(0, 8),
  apiId,
  name: apiId,
  type,
  required: false,
  localized: false,
  disabled: false,
  settings: {},
  ...extra,
})

const type: Pick<ContentType, 'fields' | 'displayField'> = {
  displayField: 'title',
  fields: [
    field('title', 'text', { localized: true }),
    field('featured', 'boolean'),
    field('badge', 'text', { showWhen: { field: 'featured', equals: true } }),
  ],
}
const [title, featured, badge] = type.fields as [Field, Field, Field]

describe('entry values', () => {
  it('reads and writes values per locale, dropping empty ones', () => {
    let fields = setValue({}, title, 'en-US', 'Hello')
    fields = setValue(fields, title, 'nl-NL', 'Hallo')
    fields = setValue(fields, featured, 'nl-NL', true)
    expect(fields).toEqual({ title: { 'en-US': 'Hello', 'nl-NL': 'Hallo' }, featured: true })
    expect(getValue(fields, title, 'nl-NL')).toBe('Hallo')
    expect(getValue(fields, featured, 'en-US')).toBe(true)
    fields = setValue(setValue(fields, title, 'en-US', undefined), title, 'nl-NL', undefined)
    expect(fields).toEqual({ featured: true })
  })

  it('follows showWhen conditions', () => {
    expect(isVisible(badge, { featured: true })).toBe(true)
    expect(isVisible(badge, { featured: false })).toBe(false)
    expect(isVisible(title, {})).toBe(true)
  })

  it('titles entries by their display field, falling back to the default locale', () => {
    const entry = { fields: { title: { 'en-US': 'Hello' } } }
    expect(entryTitle(entry, type, 'nl-NL', 'en-US')).toBe('Hello')
    expect(entryTitle({ fields: {} }, type, 'en-US', 'en-US')).toBe('Untitled')
  })

  it('groups validation issues by field and locale', () => {
    const { general, byKey } = groupIssues(type, [
      { path: ['fields', 'title', 'nl-NL'], message: 'Required' },
      { path: ['fields', 'featured'], message: 'Expected boolean' },
      { path: ['fields', 'title', 'en-US', 'x'], message: 'Odd' },
      { path: ['fields', 'gone'], message: 'Unknown field' },
    ])
    expect(byKey.get('title.nl-NL')).toEqual(['Required'])
    expect(byKey.get('title.en-US')).toEqual(['x: Odd'])
    expect(byKey.get('featured')).toEqual(['Expected boolean'])
    expect(general).toEqual(['fields.gone: Unknown field'])
  })

  it('makes 8-character block ids', () => {
    expect(newBlockId()).toMatch(/^[a-zA-Z0-9]{8}$/)
    expect(newBlockId()).not.toBe(newBlockId())
  })

  it('converts date-times between local inputs and ISO with an offset', () => {
    const iso = fromLocalInput('2026-09-25T14:30')
    expect(iso).toMatch(/^2026-09-25T14:30:00[+-]\d\d:\d\d$/)
    expect(toLocalInput(iso)).toBe('2026-09-25T14:30')
    expect(fromLocalInput('')).toBeUndefined()
    expect(toLocalInput('nope')).toBe('')
  })
})
