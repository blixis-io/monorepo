// biome-ignore lint/correctness/noNodejsModules: re-exported for upload tests (fetch needs Node's File)
export { File as NodeFile } from 'node:buffer'

import { type ContentType, createBrowserSession, type Field } from '@blixis/sdk'
import { createMemoryHistory } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import { App } from '../src/app.tsx'
import { createFakeApi } from './fake-api.ts'

/** Content types and helpers shared by the entry tests. */
const stamp = '2026-01-01T00:00:00.000Z'
export const field = (
  apiId: string,
  name: string,
  type: string,
  extra: Partial<Field> = {},
): Field => ({
  id: `${apiId}xxxxxxxx`.slice(0, 8),
  apiId,
  name,
  type,
  required: false,
  localized: false,
  disabled: false,
  settings: {},
  ...extra,
})
export const contentType = (
  id: string,
  apiId: string,
  name: string,
  kind: ContentType['kind'],
  fields: Field[],
  displayField: string | null = null,
): ContentType => ({
  id,
  environmentId: 'env',
  kind,
  apiId,
  name,
  description: '',
  displayField,
  groups: [],
  fields,
  version: 1,
  createdAt: stamp,
  updatedAt: stamp,
})

export const hero = contentType('ct-hero', 'hero', 'Hero', 'component', [
  field('heading', 'Heading', 'text'),
])
export const article = contentType(
  'ct-article',
  'article',
  'Article',
  'entry',
  [
    field('title', 'Title', 'text', { localized: true, required: true }),
    field('featured', 'Featured', 'boolean'),
    field('views', 'Views', 'number', { settings: { integer: true } }),
    field('category', 'Category', 'select', {
      settings: {
        options: [
          { value: 'news', label: 'News' },
          { value: 'tips', label: 'Tips' },
        ],
      },
    }),
    field('related', 'Related', 'reference', { settings: { multiple: true } }),
    field('cover', 'Cover', 'asset', { settings: { mimeTypes: ['image/*'] } }),
    field('sections', 'Sections', 'blocks', { settings: { componentIds: ['ct-hero'] } }),
    field('body', 'Body', 'richText', {
      settings: {
        nodes: ['heading', 'bulletList'],
        marks: ['bold', 'link'],
        headingLevels: [2, 3],
      },
    }),
  ],
  'title',
)

export function setup(locales = ['en-US', 'nl-NL']) {
  const api = createFakeApi({ signedIn: true, locales })
  api.contentTypes.push(hero, article)
  return api
}

export function renderAt(path: string, api: ReturnType<typeof createFakeApi>) {
  const session = createBrowserSession({
    baseUrl: 'https://api.test',
    fetch: api.fetch,
    retries: 0,
  })
  const history = createMemoryHistory({ initialEntries: [path] })
  render(<App session={session} history={history} />)
  return history
}

export const fieldRow = (apiId: string) => {
  const row = document.querySelector(`[data-field="${apiId}"]`)
  if (!(row instanceof HTMLElement)) throw new Error(`No field ${apiId}`)
  return row
}
export const lastBody = (api: ReturnType<typeof createFakeApi>) =>
  api.content.bodies.at(-1)?.body as { fields: Record<string, unknown> }
