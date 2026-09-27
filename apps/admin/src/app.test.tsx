import { createMemoryHistory } from '@tanstack/react-router'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from './app.tsx'

const renderAt = async (path: string) => {
  render(<App history={createMemoryHistory({ initialEntries: [path] })} />)
  // Let the router resolve the first match.
  await act(async () => {})
}

afterEach(() => {
  cleanup()
  document.documentElement.classList.remove('dark')
  localStorage.clear()
})

describe('admin shell', () => {
  it('renders the start page inside the layout', async () => {
    await renderAt('/')
    expect(await screen.findByRole('heading', { name: 'Welcome to Blixis' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Blixis' }).getAttribute('href')).toBe('/')
  })

  it('shows a not-found page for unknown paths', async () => {
    await renderAt('/does-not-exist')
    expect((await screen.findByRole('alert')).textContent).toContain('Page not found')
  })

  it('cycles the theme and remembers it', async () => {
    await renderAt('/')
    const toggle = await screen.findByRole('button', { name: /theme/ })
    fireEvent.click(toggle) // system → light
    expect(localStorage.getItem('blixis.theme')).toBe('light')
    fireEvent.click(toggle) // light → dark
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('blixis.theme')).toBe('dark')
    fireEvent.click(toggle) // dark → system
    expect(localStorage.getItem('blixis.theme')).toBeNull()
  })
})
