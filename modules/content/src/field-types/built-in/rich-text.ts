import { z } from 'zod'
import { CONTENT_LIMITS } from '../../domain/content-type.ts'
import { defineFieldType } from '../define.ts'

/** Block nodes a rich-text field may allow (`paragraph` is always allowed). */
export const RICH_TEXT_NODES = [
  'heading',
  'bulletList',
  'orderedList',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'hardBreak',
  'table',
  'embeddedEntry',
  'embeddedAsset',
] as const
export const RICH_TEXT_MARKS = ['bold', 'italic', 'underline', 'strike', 'code', 'link'] as const

type Content = 'block' | 'inline' | 'listItem' | 'tableRow' | 'tableCell' | 'text' | 'none'
/** What each node may contain (ProseMirror/TipTap-compatible structure, ADR 0010 §5). */
const NODES: Record<string, { content: Content; inline?: boolean; gate?: string }> = {
  paragraph: { content: 'inline' },
  heading: { content: 'inline', gate: 'heading' },
  bulletList: { content: 'listItem', gate: 'bulletList' },
  orderedList: { content: 'listItem', gate: 'orderedList' },
  listItem: { content: 'block' },
  blockquote: { content: 'block', gate: 'blockquote' },
  codeBlock: { content: 'text', gate: 'codeBlock' },
  horizontalRule: { content: 'none', gate: 'horizontalRule' },
  table: { content: 'tableRow', gate: 'table' },
  tableRow: { content: 'tableCell' },
  tableHeader: { content: 'block' },
  tableCell: { content: 'block' },
  embeddedEntry: { content: 'none', gate: 'embeddedEntry' },
  embeddedAsset: { content: 'none', gate: 'embeddedAsset' },
  text: { content: 'none', inline: true },
  hardBreak: { content: 'none', inline: true, gate: 'hardBreak' },
}
const ACCEPTS: Record<Exclude<Content, 'none'>, (type: string) => boolean> = {
  block: (t) =>
    NODES[t] !== undefined &&
    NODES[t]?.inline !== true &&
    !['listItem', 'tableRow', 'tableHeader', 'tableCell'].includes(t),
  inline: (t) => NODES[t]?.inline === true,
  listItem: (t) => t === 'listItem',
  tableRow: (t) => t === 'tableRow',
  tableCell: (t) => t === 'tableCell' || t === 'tableHeader',
  text: (t) => t === 'text',
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HREF = /^(https?:\/\/|mailto:|tel:|\/|#)/i

type Issue = { path: (string | number)[]; message: string }
type Settings = {
  nodes: readonly string[]
  marks: readonly string[]
  headingLevels: readonly number[]
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Walks a document and reports every structural problem with its path. */
function check(doc: unknown, settings: Settings): Issue[] {
  const issues: Issue[] = []
  /** Records an issue; returning it ends the current check. */
  const report = (issue: Issue): undefined => {
    issues.push(issue)
  }
  const allowed = new Set(settings.nodes)
  const marks = new Set(settings.marks)

  function node(
    value: unknown,
    path: (string | number)[],
    parent: Content,
    depth: number,
  ): undefined {
    if (depth > CONTENT_LIMITS.richTextDepth) {
      issues.push({ path, message: `Nested more than ${CONTENT_LIMITS.richTextDepth} levels` })
      return
    }
    if (!isObject(value) || typeof value['type'] !== 'string') {
      issues.push({ path, message: 'Expected a node with a type' })
      return
    }
    const type = value['type']
    const spec = NODES[type]
    if (spec === undefined)
      return report({ path: [...path, 'type'], message: `Unknown node "${type}"` })
    if (spec.gate !== undefined && !allowed.has(spec.gate))
      return report({
        path: [...path, 'type'],
        message: `"${type}" is not allowed in this field`,
      })
    if (parent !== 'none' && !ACCEPTS[parent as Exclude<Content, 'none'>](type))
      return report({ path: [...path, 'type'], message: `"${type}" cannot appear here` })

    const attrs = isObject(value['attrs']) ? value['attrs'] : {}
    if (type === 'text') {
      if (typeof value['text'] !== 'string' || value['text'] === '')
        issues.push({ path: [...path, 'text'], message: 'Text nodes need non-empty text' })
      const list = value['marks']
      if (list !== undefined) {
        if (!Array.isArray(list))
          issues.push({ path: [...path, 'marks'], message: 'Expected a list of marks' })
        else for (const [i, mark] of list.entries()) checkMark(mark, [...path, 'marks', i])
      }
    }
    if (type === 'heading' && !settings.headingLevels.includes(attrs['level'] as number))
      issues.push({
        path: [...path, 'attrs', 'level'],
        message: `Heading level must be one of ${settings.headingLevels.join(', ')}`,
      })
    if (
      (type === 'embeddedEntry' || type === 'embeddedAsset') &&
      !(typeof attrs['id'] === 'string' && UUID.test(attrs['id']))
    )
      issues.push({ path: [...path, 'attrs', 'id'], message: 'Embeds need attrs.id (a UUID)' })

    const content = value['content']
    if (spec.content === 'none') {
      if (content !== undefined)
        issues.push({ path: [...path, 'content'], message: `"${type}" has no content` })
      return
    }
    if (content === undefined) return
    if (!Array.isArray(content))
      return report({ path: [...path, 'content'], message: 'Expected a list of nodes' })
    for (const [i, child] of content.entries())
      node(child, [...path, 'content', i], spec.content, depth + 1)
  }

  function checkMark(mark: unknown, path: (string | number)[]): undefined {
    if (!isObject(mark) || typeof mark['type'] !== 'string')
      return report({ path, message: 'Expected a mark with a type' })
    if (!(RICH_TEXT_MARKS as readonly string[]).includes(mark['type']))
      return report({
        path: [...path, 'type'],
        message: `Unknown mark "${mark['type']}"`,
      })
    if (!marks.has(mark['type']))
      return report({
        path: [...path, 'type'],
        message: `"${mark['type']}" is not allowed in this field`,
      })
    if (mark['type'] === 'link') {
      const attrs = isObject(mark['attrs']) ? mark['attrs'] : {}
      if (!(typeof attrs['href'] === 'string' && HREF.test(attrs['href'])))
        issues.push({
          path: [...path, 'attrs', 'href'],
          message: 'Links need an http(s), mailto:, tel:, or relative href',
        })
    }
  }

  if (!isObject(doc) || doc['type'] !== 'doc')
    return [{ path: [], message: 'Expected { "type": "doc", "content": [...] }' }]
  const content = doc['content']
  if (!Array.isArray(content)) return [{ path: ['content'], message: 'Expected a list of nodes' }]
  for (const [i, child] of content.entries()) node(child, ['content', i], 'block', 1)
  return issues
}

function hasContent(value: unknown): boolean {
  if (!isObject(value)) return false
  if (value['type'] === 'text')
    return typeof value['text'] === 'string' && value['text'].trim() !== ''
  if (
    value['type'] === 'embeddedEntry' ||
    value['type'] === 'embeddedAsset' ||
    value['type'] === 'horizontalRule'
  )
    return true
  return Array.isArray(value['content']) && value['content'].some(hasContent)
}

/** Formatted text as a ProseMirror/TipTap-compatible JSON document. */
export const richTextField = defineFieldType({
  id: 'richText',
  name: 'Rich text',
  description:
    'Formatted text as a JSON document (ProseMirror/TipTap-compatible): paragraphs, headings, lists, quotes, code, tables, embedded entries and assets, and marks such as bold and links.',
  settings: z
    .object({
      nodes: z.array(z.enum(RICH_TEXT_NODES)).default([...RICH_TEXT_NODES]),
      marks: z.array(z.enum(RICH_TEXT_MARKS)).default([...RICH_TEXT_MARKS]),
      headingLevels: z.array(z.number().int().min(1).max(6)).min(1).default([1, 2, 3, 4, 5, 6]),
    })
    .strict(),
  value: (settings) =>
    z.unknown().superRefine((doc, ctx) => {
      for (const issue of check(doc, settings)) ctx.addIssue({ code: 'custom', ...issue })
    }),
  isEmpty: (value) => value === undefined || value === null || !hasContent(value),
  graphql: () => ({ type: 'RichText', list: false }),
})
