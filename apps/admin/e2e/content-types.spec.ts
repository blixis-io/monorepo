import { expect, test } from '@playwright/test'
import { signIn } from './helpers.ts'

const BUILT_IN_TYPES = [
  'Text',
  'Long text',
  'Rich text',
  'Number',
  'Boolean',
  'Date',
  'Date and time',
  'Select',
  'Reference',
  'Asset',
  'Link',
  'Blocks',
  'JSON',
]

test('create a content type with every built-in field type', async ({ page }) => {
  const suffix = Date.now().toString(36)
  await page.goto('/sign-in')
  await signIn(page)
  await page.getByRole('button', { name: 'New organization' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill(`Model Org ${suffix}`)
  await page.getByRole('button', { name: 'Create organization' }).click()
  await page
    .getByRole('region', { name: `Model Org ${suffix}` })
    .getByRole('button', { name: 'New space' })
    .click()
  await page.getByRole('dialog').getByLabel('Name').fill(`Model ${suffix}`)
  await page.getByRole('button', { name: 'Create space' }).click()
  await page.getByRole('link', { name: 'Content model' }).click()

  // A component for the blocks field.
  await page.getByRole('button', { name: 'New content type' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill('Hero')
  await page.getByRole('dialog').getByLabel('Kind').selectOption('component')
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('heading', { name: /Hero/, level: 2 })).toBeVisible()
  await page.getByRole('link', { name: 'Back to the content model' }).click()

  await page.getByRole('button', { name: 'New content type' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill('Article')
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('heading', { name: /Article/, level: 2 })).toBeVisible()

  for (const name of BUILT_IN_TYPES) {
    await page.getByRole('button', { name: 'Add field' }).click()
    await page
      .getByRole('dialog', { name: 'Add a field' })
      .getByRole('button', { name, exact: true })
      .click()
  }
  const card = (name: string) =>
    page
      .getByRole('list', { name: 'Fields' })
      .getByRole('listitem')
      .filter({
        has: page.getByRole('button', { name: new RegExp(`^${name}\\b`), expanded: true }),
      })
  // Settings the server requires: select options and blocks components.
  await card('Select').getByRole('button', { name: 'Add' }).click()
  await card('Select').getByLabel('Value 1').fill('news')
  await card('Select').getByLabel('Label 1').fill('News')
  await card('Blocks').getByLabel('Hero').check()
  await card('Text').getByLabel('Format').selectOption('slug')
  await page.getByLabel('Display field').selectOption('text')

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/version 2/)).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('list', { name: 'Fields' }).getByRole('listitem')).toHaveCount(
    BUILT_IN_TYPES.length,
  )
  await expect(page.getByLabel('Display field')).toHaveValue('text')
})
