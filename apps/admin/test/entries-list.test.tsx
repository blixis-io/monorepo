// Its own file: in jsdom, Radix dropdown menus opened by one test keep the next test's menus from
// opening (module state; browsers are fine, see e2e/editorial-flow.spec.ts). Files are isolated.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { article, renderAt, setup } from './entry-fixtures.tsx'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('entry list', () => {
  it('lists entries with titles and status, filters by type, and starts new ones', async () => {
    const api = setup()
    api.content.seedEntry(article, { title: { 'en-US': 'Hello world' } }, 'published')
    const history = renderAt('/spaces/s1/entries', api)
    const table = await screen.findByRole('table')
    expect(within(table).getByRole('link', { name: 'Hello world' })).toBeTruthy()
    expect(within(table).getByText('Published')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Content type'), { target: { value: 'article' } })
    await waitFor(() => expect(history.location.search).toContain('contentType=article'))

    fireEvent.keyDown(screen.getByRole('button', { name: 'New entry' }), { key: 'ArrowDown' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Article' }))
    expect(await screen.findByRole('heading', { name: 'New Article' })).toBeTruthy()
    expect(history.location.pathname).toBe('/spaces/s1/entries/new/ct-article')
  })
})
