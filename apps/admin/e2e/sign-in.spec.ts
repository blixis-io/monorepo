import { expect, type Page, test } from '@playwright/test'

const email = () => process.env['E2E_EMAIL'] ?? ''
const password = () => process.env['E2E_PASSWORD'] ?? ''

async function signIn(page: Page) {
  await page.getByLabel('Email').fill(email())
  await page.getByLabel('Password').fill(password())
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('sign in, create and switch spaces, survive a reload, sign out', async ({ page }) => {
  const suffix = Date.now().toString(36)

  await page.goto('/')
  await expect(page).toHaveURL(/\/sign-in/)
  await page.getByLabel('Email').fill(email())
  await page.getByLabel('Password').fill('wrong password, surely')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toContainText('incorrect')
  await expect(page.getByRole('alert')).toContainText('Request ID')

  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Welcome, E2E Editor' })).toBeVisible()

  // A new user has no organization yet.
  await page.getByRole('button', { name: 'New organization' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill(`E2E Org ${suffix}`)
  await page.getByRole('button', { name: 'Create organization' }).click()
  await expect(page.getByRole('heading', { name: `E2E Org ${suffix}` })).toBeVisible()

  for (const name of ['Alpha', 'Beta']) {
    await page.getByRole('button', { name: 'New space' }).click()
    await page.getByRole('dialog').getByLabel('Name').fill(`${name} ${suffix}`)
    await page.getByRole('button', { name: 'Create space' }).click()
    await expect(page.getByRole('heading', { name: `${name} ${suffix}`, level: 1 })).toBeVisible()
    await page.getByRole('link', { name: 'Blixis' }).click()
  }

  await page.getByRole('button', { name: 'Switch space' }).click()
  await page.getByRole('menuitem', { name: `Alpha ${suffix}` }).click()
  await expect(page.getByRole('heading', { name: `Alpha ${suffix}`, level: 1 })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(
    `E2E Org ${suffix}`,
  )
  await expect(page.getByText('en-US (default)')).toBeVisible()

  // The access token lives in memory only: a reload resumes from the HttpOnly refresh cookie.
  const spaceUrl = page.url()
  await page.reload()
  await expect(page.getByRole('heading', { name: `Alpha ${suffix}`, level: 1 })).toBeVisible()
  const cookies = await page.context().cookies('http://localhost:8787/api/v1/auth/refresh')
  expect(cookies.find((c) => c.name === 'blixis_refresh')).toMatchObject({
    httpOnly: true,
    sameSite: 'Strict',
  })
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('ey')

  await page.getByRole('button', { name: 'Account: E2E Editor' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in to Blixis' })).toBeVisible()

  // Signed out for real: the cookie is gone, so a deep link asks to sign in and comes back.
  await page.goto(spaceUrl)
  await expect(page).toHaveURL(/\/sign-in\?redirect=/)
  await signIn(page)
  await expect(page.getByRole('heading', { name: `Alpha ${suffix}`, level: 1 })).toBeVisible()
})

test('a chosen theme is saved to the account and survives a new device', async ({
  page,
  browser,
}) => {
  await page.goto('/sign-in')
  await signIn(page)
  await page.getByRole('button', { name: 'Account: E2E Editor' }).click()
  await page.getByRole('menuitem', { name: 'Appearance' }).click()
  await page
    .getByRole('list', { name: 'Themes' })
    .getByRole('button', { name: /Violet Bloom/ })
    .click()
  await page.getByRole('button', { name: 'Dark', exact: true }).click()
  const primary = () =>
    page.evaluate(() => document.documentElement.style.getPropertyValue('--primary'))
  await expect.poll(primary).not.toBe('')
  const saved = await primary()

  // Another browser: nothing cached locally, so the theme comes from the API after sign-in.
  const other = await browser.newContext()
  const fresh = await other.newPage()
  await fresh.goto('/sign-in')
  await signIn(fresh)
  await expect(fresh.getByRole('heading', { name: 'Welcome, E2E Editor' })).toBeVisible()
  await expect
    .poll(() => fresh.evaluate(() => document.documentElement.style.getPropertyValue('--primary')))
    .toBe(saved)
  expect(await fresh.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true)
  await other.close()

  // Back to the default for the next run.
  await page
    .getByRole('list', { name: 'Themes' })
    .getByRole('button', { name: /Default/ })
    .click()
  await page.getByRole('button', { name: 'System', exact: true }).click()
})
