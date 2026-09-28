import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { article, fieldRow, lastBody, NodeFile, renderAt, setup } from './entry-fixtures.tsx'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('entries', () => {
  it('creates an entry with values per locale and shared fields', async () => {
    const api = setup()
    const history = renderAt('/spaces/s1/entries/new/ct-article', api)
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByLabelText('Featured: yes'))
    fireEvent.change(screen.getByLabelText('Views'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'tips' } })
    fireEvent.click(screen.getByRole('tab', { name: /nl-NL/ }))
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Views') as HTMLInputElement).value).toBe('3')
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Hallo' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(history.location.pathname).toMatch(/^\/spaces\/s1\/entries\/0000/))
    expect(lastBody(api).fields).toEqual({
      title: { 'en-US': 'Hello', 'nl-NL': 'Hallo' },
      featured: true,
      views: 3,
      category: 'tips',
    })
    expect(await screen.findByText('version 1')).toBeTruthy()
  })

  it('shows publish errors on the field and locale, then publishes', async () => {
    const api = setup()
    const entry = api.content.seedEntry(article, { title: { 'nl-NL': 'Alleen Nederlands' } })
    renderAt(`/spaces/s1/entries/${entry.sys.id}`, api)
    fireEvent.click(await screen.findByRole('tab', { name: /nl-NL/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    // The editor switches to the locale with the problem.
    const errors = await within(fieldRow('title')).findByRole('alert')
    expect(errors.textContent).toBe('Required')
    expect(screen.getByRole('tab', { name: /en-US/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getAllByRole('alert')[0]?.textContent).toContain('req-publish')

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'English too' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish changes' }))
    await waitFor(() => expect(api.content.entries[0]?.sys.status).toBe('published'))
    expect(await screen.findByRole('button', { name: 'Unpublish' })).toBeTruthy()
  })

  it('offers to load the latest version after a conflicting save', async () => {
    const api = setup(['en-US'])
    const entry = api.content.seedEntry(article, { title: { 'en-US': 'Mine' } })
    renderAt(`/spaces/s1/entries/${entry.sys.id}`, api)
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Mine, edited' } })
    api.content.bumpEntry(entry.sys.id)
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText('Someone else saved this entry meanwhile')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Load the latest version' }))
    expect(await screen.findByText('version 2')).toBeTruthy()
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Mine')
  })

  it('restores an earlier version as a new one', async () => {
    const api = setup(['en-US'])
    const entry = api.content.seedEntry(article, { title: { 'en-US': 'First' } })
    renderAt(`/spaces/s1/entries/${entry.sys.id}`, api)
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Second' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText('version 2')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Restore version 1' }))
    expect(await screen.findByText('version 3')).toBeTruthy()
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('First')
  })

  it('links entries and assets, uploads a file, and builds blocks', async () => {
    const api = setup(['en-US'])
    const other = api.content.seedEntry(
      article,
      { title: { 'en-US': 'Other article' } },
      'published',
    )
    api.content.seedAsset('photo.jpg', 'image/jpeg')
    api.content.seedAsset('manual.pdf', 'application/pdf')
    const entry = api.content.seedEntry(article, { title: { 'en-US': 'Main' } })
    renderAt(`/spaces/s1/entries/${entry.sys.id}`, api)

    await screen.findByLabelText('Title')
    // Blocks first: in jsdom, Radix menus don't open right after a dialog closed (the Playwright
    // test covers that order in a real browser).
    fireEvent.keyDown(within(fieldRow('sections')).getByRole('button', { name: 'Add block' }), {
      key: 'ArrowDown',
    })
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Hero' }))
    fireEvent.change(await within(fieldRow('sections')).findByLabelText('Heading'), {
      target: { value: 'Welcome' },
    })

    fireEvent.click(within(fieldRow('related')).getByRole('button', { name: 'Link an entry' }))
    const entryDialog = await screen.findByRole('dialog', { name: 'Choose an entry' })
    fireEvent.click(await within(entryDialog).findByRole('button', { name: /Other article/ }))
    expect(await within(fieldRow('related')).findByText('Other article')).toBeTruthy()

    fireEvent.click(within(fieldRow('cover')).getByRole('button', { name: 'Add an asset' }))
    const assetDialog = await screen.findByRole('dialog', { name: 'Choose an asset' })
    await within(assetDialog).findByText('photo.jpg')
    expect(within(assetDialog).queryByText('manual.pdf')).toBeNull() // image/* only
    // Node's File: fetch in the test runtime doesn't accept jsdom's.
    const file = new NodeFile(['png'], 'new.png', { type: 'image/png' })
    fireEvent.change(within(assetDialog).getByLabelText(/Upload a file/), {
      target: { files: [file] },
    })
    expect(await within(fieldRow('cover')).findByText('new.png')).toBeTruthy()
    expect(api.content.assets[0]?.sys.status).toBe('published')

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await screen.findByText('version 2')
    const fields = lastBody(api).fields
    expect(fields['related']).toEqual([{ type: 'entry', id: other.sys.id }])
    expect(fields['cover']).toEqual({ type: 'asset', id: api.content.assets[0]?.sys.id })
    expect(fields['sections']).toEqual([
      { _id: expect.stringMatching(/^[a-zA-Z0-9]{8}$/), _type: 'hero', heading: 'Welcome' },
    ])
  })

  it('unpublishes, with force when published entries link to it', async () => {
    const api = setup(['en-US'])
    const entry = api.content.seedEntry(article, { title: { 'en-US': 'Linked' } }, 'published')
    api.content.setReferrersBlockUnpublish(true)
    renderAt(`/spaces/s1/entries/${entry.sys.id}`, api)
    fireEvent.click(await screen.findByRole('button', { name: 'Unpublish' }))
    expect(await screen.findByText('Other published entries link to this one')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish anyway' }))
    await waitFor(() => expect(api.content.entries[0]?.sys.status).toBe('draft'))
  })

  it('offers only the rich-text formatting the field allows', async () => {
    const api = setup(['en-US'])
    const entry = api.content.seedEntry(article, { title: { 'en-US': 'Rich' } })
    renderAt(`/spaces/s1/entries/${entry.sys.id}`, api)
    const toolbar = await screen.findByRole(
      'toolbar',
      { name: 'Body formatting' },
      { timeout: 5000 },
    )
    expect(within(toolbar).getByRole('button', { name: 'Bold' })).toBeTruthy()
    expect(within(toolbar).getByRole('button', { name: 'Bulleted list' })).toBeTruthy()
    expect(within(toolbar).queryByRole('button', { name: 'Italic' })).toBeNull()
    expect(within(toolbar).queryByRole('button', { name: 'Table' })).toBeNull()
    const levels = within(within(toolbar).getByLabelText('Text style'))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(levels).toEqual(['Paragraph', 'Heading 2', 'Heading 3'])
  })
})
