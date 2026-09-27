import { createBlixisGraphQLClient, type TypedDocument } from '@blixis/sdk'

// Build-time only (static output): the keys never reach the browser, only the rendered HTML does.
declare const process: { env: Record<string, string | undefined> }

function required(name: string): string {
  const value = process.env[name]
  if (value === undefined || value === '')
    throw new Error(`Set ${name} (see apps/example-site/README.md)`)
  return value
}

/** `BLIXIS_PREVIEW=1` builds the preview site: drafts, with the preview key. */
export const PREVIEW = process.env['BLIXIS_PREVIEW'] === '1'

export const delivery = createBlixisGraphQLClient({
  baseUrl: required('BLIXIS_API_URL'),
  token: PREVIEW ? required('BLIXIS_PREVIEW_KEY') : required('BLIXIS_DELIVERY_KEY'),
})

export interface SiteLocale {
  readonly code: string
  /** URL prefix; empty for the default locale. */
  readonly prefix: string
  readonly label: string
}

export const LOCALES: readonly SiteLocale[] = [
  { code: 'en-US', prefix: '', label: 'English' },
  { code: 'nl-NL', prefix: 'nl', label: 'Nederlands' },
]

export const localePath = (locale: SiteLocale, path = '') =>
  `/${[locale.prefix, path].filter((part) => part !== '').join('/')}`

export interface Image {
  url: string
  width: number | null
  height: number | null
  title: string | null
}

export interface PostSummary {
  sys: { id: string; publishedAt: string | null }
  title: string | null
  slug: string | null
  excerpt: string | null
  cover: Image | null
  author: { name: string | null } | null
}

export interface Post extends PostSummary {
  body: { json: unknown; assets: (Image & { id: string })[] } | null
  author: { name: string | null; avatar: Image | null } | null
}

const IMAGE = 'url width height title'

export const POSTS = /* GraphQL */ `query Posts($locale: Locale, $preview: Boolean) {
  postCollection(locale: $locale, preview: $preview, limit: 100) {
    items { sys { id publishedAt } title slug excerpt cover { ${IMAGE} } author { name } }
  }
}` as TypedDocument<
  { postCollection: { items: PostSummary[] } },
  { locale?: string; preview?: boolean }
>

export const POST = /* GraphQL */ `query Post($slug: String, $locale: Locale, $preview: Boolean) {
  postCollection(where: { slug: $slug }, limit: 1, locale: $locale, preview: $preview) {
    items {
      sys { id publishedAt } title slug excerpt
      cover { ${IMAGE} }
      author { name avatar { ${IMAGE} } }
      body { json assets { id ${IMAGE} } }
    }
  }
}` as TypedDocument<
  { postCollection: { items: Post[] } },
  { slug: string; locale?: string; preview?: boolean }
>

/** Every post in a locale (published, or drafts too in the preview build). */
export async function posts(locale: SiteLocale): Promise<PostSummary[]> {
  const data = await delivery.query(POSTS, {}, { locale: locale.code, preview: PREVIEW })
  return data.postCollection.items.filter((post) => post.slug !== null)
}

export async function post(locale: SiteLocale, slug: string): Promise<Post | undefined> {
  const data = await delivery.query(POST, { slug }, { locale: locale.code, preview: PREVIEW })
  return data.postCollection.items[0]
}
