import { createBrowserSession } from '@blixis-io/sdk'
import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/app.tsx'
import { createFakeApi } from './fake-api.ts'
import fieldTypes from './fixtures/field-types.json' with { type: 'json' }

function renderAt(path: string, api = createFakeApi({ signedIn: true })) {
  const session = createBrowserSession({
    baseUrl: 'https://api.test',
    fetch: api.fetch,
    retries: 0,
  })
  const history = createMemoryHistory({ initialEntries: [path] })
  render(<App session={session} history={history} />)
  return { api, history }
}

const stamp = '2026-01-01T00:00:00.000Z'
function seed(api: ReturnType<typeof createFakeApi>) {
  api.contentTypes.push(
    {
      id: 'ct-hero',
      environmentId: 'env',
      kind: 'component',
      apiId: 'hero',
      name: 'Hero',
      description: '',
      displayField: null,
      groups: [],
      fields: [],
      version: 1,
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: 'ct-page',
      environmentId: 'env',
      kind: 'entry',
      apiId: 'page',
      name: 'Page',
      description: '',
      displayField: null,
      groups: [],
      fields: [],
      version: 1,
      createdAt: stamp,
      updatedAt: stamp,
    },
  )
  return api
}

async function addField(typeName: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Add field' }))
  const dialog = await screen.findByRole('dialog', { name: 'Add a field' })
  fireEvent.click(within(dialog).getByRole('button', { name: typeName }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add a field' })).toBeNull())
}

const fieldCard = (name: string) => {
  const title = screen
    .getAllByRole('button', { expanded: true })
    .find((b) => b.textContent?.startsWith(name))
  const card = title?.closest('li')
  if (card === null || card === undefined) throw new Error(`No open field card "${name}"`)
  return card
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('content model', () => {
  it('lists content types and components, and creates one', async () => {
    const { history } = renderAt(
      '/spaces/s1/content-types',
      seed(createFakeApi({ signedIn: true })),
    )
    const types = await screen.findByRole('region', { name: 'Content types' })
    expect(within(types).getByRole('link', { name: /Page/ })).toBeTruthy()
    expect(
      within(screen.getByRole('region', { name: 'Components' })).getByRole('link', {
        name: /Hero/,
      }),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'New content type' }))
    const dialog = await screen.findByRole('dialog', { name: 'New content type' })
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Blog post' } })
    expect((within(dialog).getByLabelText('API ID') as HTMLInputElement).value).toBe('blogPost')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(await screen.findByRole('heading', { name: /Blog post/, level: 2 })).toBeTruthy()
    expect(history.location.pathname).toBe('/spaces/s1/content-types/ct-3')
  })

  it('creates a content type with every built-in field type', async () => {
    const { api } = renderAt(
      '/spaces/s1/content-types/ct-page',
      seed(createFakeApi({ signedIn: true })),
    )
    await screen.findByRole('heading', { name: /Page/, level: 2 })
    for (const type of fieldTypes.fieldTypes) await addField(type.name)

    // Settings from the generated forms.
    fireEvent.change(within(fieldCard('Text')).getByLabelText('Format'), {
      target: { value: 'slug' },
    })
    fireEvent.change(within(fieldCard('Text')).getByLabelText('Maximum length'), {
      target: { value: '80' },
    })
    fireEvent.click(within(fieldCard('Number')).getByLabelText('Whole numbers only'))
    const select = fieldCard('Select')
    fireEvent.click(within(select).getByRole('button', { name: 'Add' }))
    fireEvent.change(within(select).getByLabelText('Value 1'), { target: { value: 'red' } })
    fireEvent.change(within(select).getByLabelText('Label 1'), { target: { value: 'Red' } })
    fireEvent.click(within(fieldCard('Blocks')).getByLabelText('Hero'))
    fireEvent.click(within(fieldCard('Reference')).getByLabelText('Page'))
    fireEvent.click(within(fieldCard('Rich text')).getByLabelText('Table'))
    fireEvent.change(within(fieldCard('Asset')).getByLabelText('Allowed file types'), {
      target: { value: 'image/*, application/pdf' },
    })
    fireEvent.click(within(fieldCard('Text')).getByLabelText('Required'))

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(/version 2/)
    const body = api.contentTypeBodies.at(-1) as {
      fields: { type: string; settings: Record<string, unknown>; required: boolean }[]
    }
    expect(body.fields.map((f) => f.type)).toEqual(fieldTypes.fieldTypes.map((t) => t.id))
    const byType = Object.fromEntries(body.fields.map((f) => [f.type, f]))
    expect(byType['text']).toMatchObject({
      required: true,
      settings: { format: 'slug', maxLength: 80 },
    })
    expect(byType['number']?.settings).toEqual({ integer: true })
    expect(byType['select']?.settings).toEqual({ options: [{ value: 'red', label: 'Red' }] })
    expect(byType['blocks']?.settings).toEqual({ componentIds: ['ct-hero'] })
    expect(byType['reference']?.settings).toEqual({ contentTypeIds: ['ct-page'] })
    expect(byType['richText']?.settings['nodes']).not.toContain('table')
    expect(byType['asset']?.settings).toEqual({ mimeTypes: ['image/*', 'application/pdf'] })
    expect(screen.queryByText('Unsaved changes')).toBeNull()
  })

  it('shows validation errors on the field they belong to', async () => {
    renderAt('/spaces/s1/content-types/ct-page', seed(createFakeApi({ signedIn: true })))
    await screen.findByRole('heading', { name: /Page/, level: 2 })
    await addField('Blocks')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const card = await waitFor(() => fieldCard('Blocks'))
    expect((await within(card).findByRole('alert')).textContent).toContain(
      'settings.componentIds: Required',
    )
    expect(screen.getAllByRole('alert')[0]?.textContent).toContain('req-400')
  })

  it('explains unsafe changes and stale versions', async () => {
    const api = seed(createFakeApi({ signedIn: true }))
    renderAt('/spaces/s1/content-types/ct-page', api)
    await screen.findByRole('heading', { name: /Page/, level: 2 })
    await addField('Boolean')

    api.setUnsafeChange('field "title" cannot change type while entries exist')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const unsafe = await screen.findByText('This change would break existing entries')
    expect(unsafe.closest('[role=alert]')?.textContent).toContain(
      'cannot change type while entries exist',
    )
    expect(unsafe.closest('[role=alert]')?.textContent).toContain('mark it Disabled')

    api.setUnsafeChange(undefined)
    api.bumpVersion('ct-page')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Someone else changed this content type')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Load the latest version' }))
    await screen.findByText(/version 2/)
    expect(screen.queryByText('Unsaved changes')).toBeNull()
  })

  it('reorders and removes fields', async () => {
    const { api } = renderAt(
      '/spaces/s1/content-types/ct-page',
      seed(createFakeApi({ signedIn: true })),
    )
    await screen.findByRole('heading', { name: /Page/, level: 2 })
    await addField('Text')
    await addField('Number')
    await addField('Date')
    fireEvent.click(screen.getByRole('button', { name: 'Move Date up' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Text' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(/version 2/)
    const body = api.contentTypeBodies.at(-1) as { fields: { apiId: string }[] }
    expect(body.fields.map((f) => f.apiId)).toEqual(['date', 'number'])
  })

  it('asks before leaving with unsaved changes', async () => {
    const { history } = renderAt(
      '/spaces/s1/content-types/ct-page',
      seed(createFakeApi({ signedIn: true })),
    )
    await screen.findByRole('heading', { name: /Page/, level: 2 })
    await addField('Text')
    fireEvent.click(screen.getByRole('link', { name: 'Back to the content model' }))
    const dialog = await screen.findByRole('dialog', { name: 'Leave without saving?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stay' }))
    expect(history.location.pathname).toBe('/spaces/s1/content-types/ct-page')
    fireEvent.click(await screen.findByRole('link', { name: 'Back to the content model' }))
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: 'Leave without saving?' })).getByRole(
        'button',
        { name: 'Leave' },
      ),
    )
    await waitFor(() => expect(history.location.pathname).toBe('/spaces/s1/content-types'))
  })

  it('deletes a content type after confirmation', async () => {
    const { api, history } = renderAt(
      '/spaces/s1/content-types/ct-page',
      seed(createFakeApi({ signedIn: true })),
    )
    await screen.findByRole('heading', { name: /Page/, level: 2 })
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete Page?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(history.location.pathname).toBe('/spaces/s1/content-types'))
    expect(api.contentTypes.map((t) => t.id)).toEqual(['ct-hero'])
  })
})
