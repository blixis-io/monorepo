import { expect, type Page, test } from '@playwright/test'
import { signIn } from './helpers.ts'

/** A 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/zCXcNwAAAABJRU5ErkJggg==',
  'base64',
)

const fieldCard = (page: Page, name: string) =>
  page
    .getByRole('list', { name: 'Fields' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: new RegExp(`^${name}\\b`), expanded: true }) })

async function addField(page: Page, type: string, name: string) {
  await page.getByRole('button', { name: 'Add field' }).click()
  await page
    .getByRole('dialog', { name: 'Add a field' })
    .getByRole('button', { name: type, exact: true })
    .click()
  const card = fieldCard(page, type)
  await card.getByLabel('Name', { exact: true }).fill(name)
  return fieldCard(page, name)
}

test('editorial flow: model, draft, validation, publish, versions, unpublish', async ({ page }) => {
  test.setTimeout(90_000)
  const suffix = Date.now().toString(36)
  await page.goto('/sign-in')
  await signIn(page)

  // A space with a small model.
  await page.getByRole('button', { name: 'New organization' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill(`Flow Org ${suffix}`)
  await page.getByRole('button', { name: 'Create organization' }).click()
  await page
    .getByRole('region', { name: `Flow Org ${suffix}` })
    .getByRole('button', { name: 'New space' })
    .click()
  await page.getByRole('dialog').getByLabel('Name').fill(`Flow ${suffix}`)
  await page.getByRole('button', { name: 'Create space' }).click()
  await page.getByRole('link', { name: 'Content model' }).click()

  await page.getByRole('button', { name: 'New content type' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill('Hero')
  await page.getByRole('dialog').getByLabel('Kind').selectOption('component')
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('heading', { name: /Hero/, level: 2 })).toBeVisible()
  await addField(page, 'Text', 'Heading')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/version 2/)).toBeVisible()
  await page.getByRole('link', { name: 'Back to the content model' }).click()

  await page.getByRole('button', { name: 'New content type' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill('Article')
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('heading', { name: /Article/, level: 2 })).toBeVisible()
  const title = await addField(page, 'Text', 'Title')
  await title.getByLabel('Required').check()
  await addField(page, 'Rich text', 'Body')
  const cover = await addField(page, 'Asset', 'Cover')
  await cover.getByLabel('Allowed file types').fill('image/*')
  const sections = await addField(page, 'Blocks', 'Sections')
  await sections.getByLabel('Hero').check()
  await page.getByLabel('Display field').selectOption('title')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/version 2/)).toBeVisible()

  // A new entry: publishing without the required title fails next to the field.
  await page.getByRole('link', { name: 'Entries' }).click()
  await page.getByRole('button', { name: 'New entry' }).click()
  await page.getByRole('menuitem', { name: 'Article' }).click()
  await expect(page.getByRole('heading', { name: 'New Article' })).toBeVisible()
  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(page.locator('[data-field="title"]').getByRole('alert')).toHaveText('Required')

  // Fill it in: text, rich text, a block (menu right after a dialog), and an uploaded image.
  await page.getByLabel('Title').fill('Hello Blixis')
  const body = page.getByRole('textbox', { name: 'Body' })
  await body.click()
  await page.getByRole('button', { name: 'Bold' }).click()
  await body.pressSequentially('Bold words')
  await page.locator('[data-field="cover"]').getByRole('button', { name: 'Add an asset' }).click()
  await page
    .getByRole('dialog', { name: 'Choose an asset' })
    .getByLabel(/Upload a file/)
    .setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.locator('[data-field="cover"]').getByText('pixel.png')).toBeVisible()
  await page.locator('[data-field="sections"]').getByRole('button', { name: 'Add block' }).click()
  await page.getByRole('menuitem', { name: 'Hero' }).click()
  await page.locator('[data-field="sections"]').getByLabel('Heading').fill('Welcome')

  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page).toHaveURL(/\/entries\/[0-9a-f-]{36}$/)
  await expect(page.getByText('version 1', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByRole('button', { name: 'Unpublish' })).toBeVisible()
  await expect(page.getByText('Published', { exact: true }).first()).toBeVisible()

  // Edit and publish the change; the versions list grows.
  await page.getByLabel('Title').fill('Hello again')
  await page.getByRole('button', { name: 'Publish changes' }).click()
  await expect(page.getByText('version 2', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Restore version 1' })).toBeVisible()

  // Restore the first version (a new draft version), then unpublish.
  await page.getByRole('button', { name: 'Restore version 1' }).click()
  await expect(page.getByText('version 3', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Title')).toHaveValue('Hello Blixis')
  await expect(page.getByText('Changed', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Unpublish' }).click()
  await expect(page.getByRole('button', { name: 'Unpublish' })).toHaveCount(0)

  // Everything survives a reload: rich text, block, asset.
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Body' }).locator('strong')).toHaveText(
    'Bold words',
  )
  await expect(page.locator('[data-field="sections"]').getByLabel('Heading')).toHaveValue('Welcome')
  await expect(page.locator('[data-field="cover"]').getByText('pixel.png')).toBeVisible()

  // The list shows it.
  await page.getByRole('link', { name: 'Back to entries' }).click()
  await expect(page.getByRole('table').getByRole('link', { name: 'Hello Blixis' })).toBeVisible()
})
