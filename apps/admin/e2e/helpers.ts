import type { Page } from '@playwright/test'

/** The run's user, created by `global-setup.ts`. */
export const email = () => process.env['E2E_EMAIL'] ?? ''
export const password = () => process.env['E2E_PASSWORD'] ?? ''

/** Fills in and submits the sign-in form. */
export async function signIn(page: Page) {
  await page.getByLabel('Email').fill(email())
  await page.getByLabel('Password').fill(password())
  await page.getByRole('button', { name: 'Sign in' }).click()
}
