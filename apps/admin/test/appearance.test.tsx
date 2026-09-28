import { createBrowserSession } from '@blixis-io/sdk'
import { createMemoryHistory } from '@tanstack/react-router'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/app.tsx'
import { applyTokens } from '../src/lib/themes/tokens.ts'
import { createFakeApi } from './fake-api.ts'

function renderAt(path: string, api = createFakeApi({ signedIn: true })) {
  const session = createBrowserSession({
    baseUrl: 'https://api.test',
    fetch: api.fetch,
    retries: 0,
  })
  render(<App session={session} history={createMemoryHistory({ initialEntries: [path] })} />)
  return api
}

const root = () => document.documentElement
const cssVar = (name: string) => root().style.getPropertyValue(`--${name}`)

afterEach(() => {
  cleanup()
  applyTokens(null)
  root().classList.remove('dark')
  localStorage.clear()
})

describe('appearance', () => {
  it('applies a tweakcn preset at once and saves it to the user’s preferences', async () => {
    const api = renderAt('/settings/appearance')
    const themes = await screen.findByRole('list', { name: 'Themes' })
    fireEvent.click(await within(themes).findByRole('button', { name: /Violet Bloom/ }))

    expect(cssVar('primary')).toBe('#7033ff')
    expect(cssVar('font-sans')).toContain('Plus Jakarta Sans')
    expect(
      within(themes)
        .getByRole('button', { name: /Violet Bloom/ })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    await waitFor(() => expect(api.preferences().theme?.preset).toBe('violet-bloom'))
    expect(api.preferences().theme?.dark['primary']).toBeDefined()
    expect(JSON.parse(localStorage.getItem('blixis.appearance') ?? '{}').theme.name).toBe(
      'Violet Bloom',
    )

    fireEvent.click(within(themes).getByRole('button', { name: /Default/ }))
    expect(cssVar('primary')).toBe('')
    await waitFor(() => expect(api.preferences().theme).toBeNull())
  })

  it('switches the color scheme and uses the theme’s dark tokens', async () => {
    const api = renderAt('/settings/appearance')
    const themes = await screen.findByRole('list', { name: 'Themes' })
    fireEvent.click(await within(themes).findByRole('button', { name: /Violet Bloom/ }))
    const light = cssVar('background')
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expect(root().classList.contains('dark')).toBe(true)
    expect(cssVar('background')).not.toBe(light)
    await waitFor(() => expect(api.preferences().colorScheme).toBe('dark'))
  })

  it('imports a theme pasted from the tweakcn editor', async () => {
    const api = renderAt('/settings/appearance')
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Brand' } })
    fireEvent.change(screen.getByLabelText('Theme CSS'), {
      target: {
        value:
          ':root { --primary: oklch(0.6 0.2 30); --accent: url(https://evil.example/x); }\n.dark { --primary: oklch(0.7 0.2 30); }',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Use this theme' }))
    expect(cssVar('primary')).toBe('oklch(0.6 0.2 30)')
    expect((await screen.findByRole('alert')).textContent).toContain(
      '--accent is not a plain CSS value',
    )
    await waitFor(() => expect(api.preferences().theme?.name).toBe('Brand'))
    expect(api.preferences().theme?.dark['primary']).toBe('oklch(0.7 0.2 30)')
  })

  it('loads the saved theme after sign-in, from another device', async () => {
    const api = createFakeApi({ signedIn: true })
    api.setPreferences({
      colorScheme: 'dark',
      theme: {
        name: 'Saved',
        preset: null,
        light: { primary: '#111111' },
        dark: { primary: '#eeeeee' },
      },
    })
    renderAt('/', api)
    await waitFor(() => expect(cssVar('primary')).toBe('#eeeeee'))
    expect(root().classList.contains('dark')).toBe(true)
  })
})
