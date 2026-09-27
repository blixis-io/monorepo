import { createBrowserSession } from '@blixis/sdk'
import { createMemoryHistory } from '@tanstack/react-router'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../src/app.tsx'
import { safeRedirect } from '../src/lib/session.tsx'
import { createFakeApi, PASSWORD, USER } from './fake-api.ts'

function renderApp(path: string, api = createFakeApi()) {
  const session = createBrowserSession({
    baseUrl: 'https://api.test',
    fetch: api.fetch,
    retries: 0,
  })
  const history = createMemoryHistory({ initialEntries: [path] })
  render(<App session={session} history={history} />)
  return { api, session, history }
}

async function signIn(email: string, password: string) {
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

/**
 * Opens a Radix dropdown menu from its trigger with ArrowDown (jsdom has no pointer events; Enter
 * toggles, which proved order-dependent across tests).
 */
async function openMenu(name: string | RegExp) {
  const trigger = await screen.findByRole('button', { name })
  trigger.focus()
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  return screen.findByRole('menu')
}

afterEach(() => {
  cleanup()
  document.documentElement.classList.remove('dark')
  localStorage.clear()
})

describe('sign-in', () => {
  it('redirects to sign-in, rejects wrong passwords, and returns to the page asked for', async () => {
    const { history } = renderApp('/spaces/s2')
    expect(await screen.findByRole('heading', { name: 'Sign in to Blixis' })).toBeTruthy()
    expect(history.location.pathname).toBe('/sign-in')

    await signIn(USER.email, 'wrong password')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('The email address or password is incorrect.')
    expect(alert.textContent).toContain('req-test-1')

    await signIn(USER.email, PASSWORD)
    expect(await screen.findByRole('heading', { name: 'Docs', level: 1 })).toBeTruthy()
    expect(history.location.pathname).toBe('/spaces/s2')
  })

  it('validates the form before calling the API', async () => {
    const { api } = renderApp('/sign-in')
    await signIn('not-an-email', '')
    expect(await screen.findByText('Enter a valid email address')).toBeTruthy()
    expect(screen.getByText('Enter your password')).toBeTruthy()
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true')
    expect(api.calls.filter((c) => c.includes('sign-in'))).toEqual([])
  })

  it('never redirects to another origin after sign-in', () => {
    expect(safeRedirect('/spaces/s1?tab=x')).toBe('/spaces/s1?tab=x')
    expect(safeRedirect('//evil.example')).toBe('/')
    expect(safeRedirect('/\\evil.example')).toBe('/')
    expect(safeRedirect('https://evil.example')).toBe('/')
    expect(safeRedirect(undefined)).toBe('/')
  })
})

describe('shell', () => {
  it('resumes the session from the refresh cookie and lists organizations and spaces', async () => {
    renderApp('/', createFakeApi({ signedIn: true }))
    expect(
      await screen.findByRole('heading', { name: `Welcome, ${USER.displayName}` }),
    ).toBeTruthy()
    const acme = await screen.findByRole('heading', { name: 'Acme' })
    expect(acme).toBeTruthy()
    expect(await screen.findByRole('link', { name: /Marketing site/ })).toBeTruthy()
  })

  it('switches spaces and shows breadcrumbs', async () => {
    const { history } = renderApp('/spaces/s1', createFakeApi({ signedIn: true }))
    expect(await screen.findByRole('heading', { name: 'Marketing site', level: 1 })).toBeTruthy()
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' })
    await waitFor(() => expect(within(breadcrumb).getByRole('link').textContent).toBe('Acme'))

    const menu = await openMenu('Switch space')
    fireEvent.click(await within(menu).findByRole('menuitem', { name: 'Docs' }))
    expect(await screen.findByRole('heading', { name: 'Docs', level: 1 })).toBeTruthy()
    expect(history.location.pathname).toBe('/spaces/s2')
  })

  it('creates an organization, validating and reporting conflicts', async () => {
    const api = createFakeApi({ signedIn: true })
    renderApp('/', api)
    fireEvent.click(await screen.findByRole('button', { name: 'New organization' }))
    const dialog = await screen.findByRole('dialog', { name: 'New organization' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create organization' }))
    expect(await within(dialog).findByText('Enter a name')).toBeTruthy()

    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Acme' } })
    expect((within(dialog).getByLabelText('Slug') as HTMLInputElement).value).toBe('acme')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create organization' }))
    const conflict = await within(dialog).findByRole('alert')
    expect(conflict.textContent).toContain('The slug is taken')
    expect(conflict.textContent).toContain('req-conflict')

    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Globex Café' } })
    expect((within(dialog).getByLabelText('Slug') as HTMLInputElement).value).toBe('globex-cafe')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create organization' }))
    expect(await screen.findByRole('heading', { name: 'Globex Café' })).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.organizations).toHaveLength(2)
  })

  it('creates a space and opens it', async () => {
    const { history } = renderApp('/', createFakeApi({ signedIn: true }))
    fireEvent.click(await screen.findByRole('button', { name: 'New space' }))
    const dialog = await screen.findByRole('dialog', { name: 'New space' })
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Blog' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create space' }))
    expect(await screen.findByRole('heading', { name: 'Blog', level: 1 })).toBeTruthy()
    expect(history.location.pathname).toBe('/spaces/s3')
  })

  it('shows API errors with their request id, and retries', async () => {
    const api = createFakeApi({ signedIn: true })
    renderApp('/spaces/missing', api)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Not found')
    expect(alert.textContent).toContain('req-404')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('signs out and returns to sign-in', async () => {
    const { api, history } = renderApp('/', createFakeApi({ signedIn: true }))
    const menu = await openMenu(`Account: ${USER.displayName}`)
    expect(within(menu).getByText(USER.email)).toBeTruthy()
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in to Blixis' })).toBeTruthy()
    expect(history.location.pathname).toBe('/sign-in')
    expect(api.calls).toContain('POST /auth/sign-out')
  })

  it('sends the user to sign-in when the session ends on the server', async () => {
    const api = createFakeApi({ signedIn: true })
    const { history } = renderApp('/', api)
    expect(await screen.findByRole('heading', { name: 'Acme' })).toBeTruthy()
    api.revoke()
    // The next call answers 401, the refresh fails, and the guard redirects.
    fireEvent.click(await screen.findByRole('link', { name: /Docs/ }))
    await waitFor(() => expect(history.location.pathname).toBe('/sign-in'))
  })
})

describe('theme', () => {
  it('cycles the theme and remembers it', async () => {
    renderApp('/sign-in')
    const toggle = await screen.findByRole('button', { name: /theme/ })
    await act(async () => {
      fireEvent.click(toggle) // system → light
    })
    expect(localStorage.getItem('blixis.theme')).toBe('light')
    fireEvent.click(toggle) // light → dark
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('blixis.theme')).toBe('dark')
    fireEvent.click(toggle) // dark → system
    expect(localStorage.getItem('blixis.theme')).toBeNull()
  })
})
