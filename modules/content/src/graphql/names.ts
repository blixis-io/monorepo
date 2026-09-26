import type { ContentType } from '../domain/content-type.ts'

/** Platform type names generated types must not take (ADR 0011 §3). */
const RESERVED_TYPES = new Set([
  'Query',
  'Mutation',
  'Subscription',
  'Entry',
  'EntryCollection',
  'Block',
  'Sys',
  'Link',
  'LinkKind',
  'RichText',
  'Asset',
  'Platform',
  'PlatformModule',
  'String',
  'Int',
  'Float',
  'Boolean',
  'ID',
  'JSON',
  'Date',
  'DateTime',
  'Locale',
])
/** Static root fields generated root fields must not take. */
const RESERVED_ROOT = new Set(['entry', 'entries', '_platform'])

const pascal = (apiId: string) => apiId.charAt(0).toUpperCase() + apiId.slice(1)

/** GraphQL type name of a content type or component: `blogPost` → `BlogPost`. */
export function typeName(type: Pick<ContentType, 'apiId'>): string {
  const name = pascal(type.apiId)
  return RESERVED_TYPES.has(name) || RESERVED_TYPES.has(name.replace(/(Collection|Filter)$/, ''))
    ? `${name}Content`
    : name
}

/** Root field names of an entry type: `blogPost` and `blogPostCollection`. */
export function rootFields(type: Pick<ContentType, 'apiId'>): {
  single: string
  collection: string
} {
  const single = RESERVED_ROOT.has(type.apiId) ? `content${pascal(type.apiId)}` : type.apiId
  return { single, collection: `${single}Collection` }
}
