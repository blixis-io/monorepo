/**
 * Renders a Blixis rich-text document (ProseMirror/TipTap JSON) to HTML. Text is escaped; link
 * hrefs are limited to http(s), mailto:, tel:, and relative URLs — the same rule Blixis validates.
 */

interface Node {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  content?: Node[]
}

export interface EmbeddedAsset {
  id: string
  url: string
  title: string | null
  width: number | null
  height: number | null
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )
const SAFE_HREF = /^(https?:|mailto:|tel:|\/|#)/i

function marks(text: string, list: Node['marks'] = []): string {
  return list.reduce((html, mark) => {
    switch (mark.type) {
      case 'bold':
        return `<strong>${html}</strong>`
      case 'italic':
        return `<em>${html}</em>`
      case 'underline':
        return `<u>${html}</u>`
      case 'strike':
        return `<s>${html}</s>`
      case 'code':
        return `<code>${html}</code>`
      case 'link': {
        const href = String(mark.attrs?.['href'] ?? '')
        return SAFE_HREF.test(href) ? `<a href="${escapeHtml(href)}">${html}</a>` : html
      }
      default:
        return html
    }
  }, escapeHtml(text))
}

export function renderRichText(doc: unknown, assets: readonly EmbeddedAsset[] = []): string {
  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  const render = (node: Node): string => {
    const inner = () => (node.content ?? []).map(render).join('')
    switch (node.type) {
      case 'doc':
        return inner()
      case 'paragraph':
        return `<p>${inner()}</p>`
      case 'heading': {
        const level = Math.min(Math.max(Number(node.attrs?.['level'] ?? 2), 2), 6)
        return `<h${level}>${inner()}</h${level}>`
      }
      case 'bulletList':
        return `<ul>${inner()}</ul>`
      case 'orderedList':
        return `<ol>${inner()}</ol>`
      case 'listItem':
        return `<li>${inner()}</li>`
      case 'blockquote':
        return `<blockquote>${inner()}</blockquote>`
      case 'codeBlock':
        return `<pre><code>${inner()}</code></pre>`
      case 'horizontalRule':
        return '<hr>'
      case 'hardBreak':
        return '<br>'
      case 'text':
        return marks(node.text ?? '', node.marks)
      case 'embeddedAsset': {
        const asset = byId.get(String(node.attrs?.['id'] ?? ''))
        if (asset === undefined) return '' // unpublished or deleted
        const size =
          asset.width !== null && asset.height !== null
            ? ` width="${asset.width}" height="${asset.height}"`
            : ''
        return `<figure><img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.title ?? '')}"${size} loading="lazy"></figure>`
      }
      default:
        return inner() // unknown nodes: keep their text
    }
  }
  return typeof doc === 'object' && doc !== null ? render(doc as Node) : ''
}
