import { NotFoundError, ValidationError } from '@blixis/contracts'
import { createBatchLoader, type GraphQLContext, loader, type SchemaPart } from '@blixis/graphql'
import {
  DELIVERY_SERVICE,
  type DeliveredEntry,
  type DeliveryScope,
} from '../application/delivery.service.ts'
import type { ContentType, FieldDefinition } from '../domain/content-type.ts'
import type { EntryState } from '../domain/entry.ts'
import type { FieldTypeRegistry } from '../field-types/define.ts'
import { localized } from './locales.ts'
import { rootFields, typeName } from './names.ts'

/** Maximum page size of collections (ADR 0011 §5). */
export const MAX_COLLECTION_LIMIT = 100
const MODULE = '@blixis/content'

/** What a resolver's parent is: an entry, or a block inside one, with the locale and state read. */
interface Read {
  readonly locale: string
  readonly state: EntryState
}
interface EntryParent extends Read {
  readonly kind: 'entry'
  readonly delivered: DeliveredEntry
}
interface BlockParent extends Read {
  readonly kind: 'block'
  readonly component: ContentType
  readonly values: Readonly<Record<string, unknown>>
}
type Parent = EntryParent | BlockParent

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

type Context = GraphQLContext & { readonly request?: Request }

/** The space and environment a request asks for (`?space=`, `X-Blixis-Space`; ADR 0011 §2). */
export function requestedTenant(context: Context): { spaceId?: string; environment?: string } {
  const url = context.request === undefined ? undefined : new URL(context.request.url)
  const pick = (param: string, header: string) =>
    url?.searchParams.get(param) ?? context.request?.headers.get(header) ?? undefined
  const spaceId = pick('space', 'x-blixis-space')
  const environment = pick('environment', 'x-blixis-environment')
  return {
    ...(spaceId === undefined ? {} : { spaceId }),
    ...(environment === undefined ? {} : { environment }),
  }
}

/** Per-request delivery access: the verified scope and batching loaders per state. */
function delivery(context: Context) {
  return loader(context, `${MODULE}.delivery`, () => {
    const service = context.services.get(DELIVERY_SERVICE)
    const actor = context.requestContext.actor
    const scope = service.scope(actor, requestedTenant(context))
    const loaders = new Map<
      EntryState,
      ReturnType<typeof createBatchLoader<string, DeliveredEntry>>
    >()
    return {
      service,
      actor,
      scope: () => scope,
      /** Reads `state`, checking preview access once per state. */
      async open(state: EntryState): Promise<DeliveryScope> {
        const resolved = await scope
        await service.requireState(actor, resolved, state)
        // Drafts must never land in a shared cache (plan 013 adds public caching of the rest).
        if (state === 'draft') context.responseHeaders.set('cache-control', 'private, no-store')
        return resolved
      },
      entries(state: EntryState) {
        let entries = loaders.get(state)
        if (entries === undefined) {
          entries = createBatchLoader(async (ids: readonly string[]) =>
            service.entries(await scope, ids, state),
          )
          loaders.set(state, entries)
        }
        return entries
      },
    }
  })
}

const stateOf = (preview: unknown): EntryState => (preview === true ? 'draft' : 'published')

async function localeOf(context: Context, locale: unknown): Promise<string> {
  const scope = await delivery(context).scope()
  if (locale === undefined || locale === null) return scope.locales.defaultCode
  if (typeof locale !== 'string' || !scope.locales.codes.includes(locale))
    throw new ValidationError('Unknown locale', [
      { path: ['locale'], message: `Use one of: ${scope.locales.codes.join(', ')}` },
    ])
  return locale
}

function limitOf(limit: unknown): number {
  const value = limit === undefined || limit === null ? 25 : Number(limit)
  if (!Number.isInteger(value) || value < 1 || value > MAX_COLLECTION_LIMIT)
    throw new ValidationError('Invalid limit', [
      { path: ['limit'], message: `Use 1–${MAX_COLLECTION_LIMIT}` },
    ])
  return value
}

const entryParent = (delivered: DeliveredEntry, read: Read): EntryParent => ({
  kind: 'entry',
  delivered,
  // Only locale and state carry over — never the parent's own entry.
  locale: read.locale,
  state: read.state,
})

/** Loads linked entries of the same state and locale; unresolved links are dropped. */
async function linked(
  context: Context,
  parent: Read,
  ids: readonly string[],
): Promise<EntryParent[]> {
  const found = await delivery(context).entries(parent.state).loadMany(ids)
  return found.flatMap((d) => (d === undefined ? [] : [entryParent(d, parent)]))
}

/** Resolves one field of an entry or block to its GraphQL value. */
async function fieldValue(
  field: FieldDefinition,
  parent: Parent,
  context: Context,
): Promise<unknown> {
  const scope = await delivery(context).scope()
  const raw =
    parent.kind === 'entry'
      ? localized(field, parent.delivered.version.fields[field.id], parent.locale, scope.locales)
      : parent.values[field.id]
  if (raw === undefined || raw === null) return null
  switch (field.type) {
    case 'reference': {
      const links = (Array.isArray(raw) ? raw : [raw]).filter(isObject).map((l) => String(l['id']))
      const entries = await linked(context, parent, links)
      return field.settings['multiple'] === true ? entries : (entries[0] ?? null)
    }
    case 'asset': {
      const assets = (Array.isArray(raw) ? raw : [raw])
        .filter(isObject)
        .map((a) => ({ id: a['id'] }))
      return field.settings['multiple'] === true ? assets : (assets[0] ?? null)
    }
    case 'link':
      return isObject(raw) ? { ...raw, __read: parent } : null
    case 'richText':
      return { json: raw, __read: parent }
    case 'blocks':
      if (!Array.isArray(raw)) return []
      return raw.flatMap((item) => {
        if (!isObject(item)) return []
        const component = scope.types.find((t) => t.id === item['_type'] && t.kind === 'component')
        return component === undefined
          ? []
          : [
              {
                kind: 'block',
                component,
                values: item,
                locale: parent.locale,
                state: parent.state,
              } satisfies BlockParent,
            ]
      })
    default:
      return raw
  }
}

/** Entry ids linked from a rich-text document (embeds and entry links). */
function richTextEntryIds(node: unknown, ids: string[] = []): string[] {
  if (!isObject(node)) return ids
  const attrs = isObject(node['attrs']) ? node['attrs'] : {}
  if (node['type'] === 'embeddedEntry' && typeof attrs['id'] === 'string') ids.push(attrs['id'])
  if (Array.isArray(node['marks']))
    for (const mark of node['marks'])
      if (isObject(mark) && isObject(mark['attrs']) && typeof mark['attrs']['entryId'] === 'string')
        ids.push(mark['attrs']['entryId'])
  if (Array.isArray(node['content']))
    for (const child of node['content']) richTextEntryIds(child, ids)
  return ids
}

/** Static base of the delivery schema (ADR 0011 §1). */
export const DELIVERY_BASE_TYPE_DEFS = /* GraphQL */ `
  "An entry of any content type. Query a concrete type with fragments: ... on BlogPost."
  interface Entry {
    sys: Sys!
  }

  "A component inside a blocks field. Query concrete components with fragments: ... on Hero."
  interface Block {
    _id: ID!
    _type: String!
  }

  "System properties of an entry."
  type Sys {
    id: ID!
    contentType: String!
    "The version delivered."
    version: Int!
    locale: Locale!
    publishedAt: DateTime
    firstPublishedAt: DateTime
    updatedAt: DateTime!
  }

  enum LinkKind {
    entry
    url
    email
    phone
  }

  "A link for buttons and navigation."
  type Link {
    kind: LinkKind!
    url: String
    email: String
    phone: String
    entry: Entry
    text: String
    title: String
    newTab: Boolean
  }

  "Rich text: the document (ProseMirror/TipTap JSON) and the entries it links or embeds."
  type RichText {
    json: JSON!
    entries: [Entry!]!
  }

  "An asset link (asset details arrive with the assets module)."
  type Asset {
    id: ID!
  }

  type EntryCollection {
    items: [Entry!]!
    nextCursor: String
  }

  extend type Query {
    "Any entry by id. preview: true reads drafts (needs content.preview.read)."
    entry(id: ID!, locale: Locale, preview: Boolean = false): Entry
    "Entries of a content type by apiId, newest updates first."
    entries(contentType: String!, limit: Int = 25, cursor: String, locale: Locale, preview: Boolean = false): EntryCollection!
  }
`

export const deliveryBaseResolvers = {
  Entry: {
    __resolveType: (parent: EntryParent) => typeName(parent.delivered.contentType),
  },
  Block: {
    __resolveType: (parent: BlockParent) => typeName(parent.component),
  },
  Sys: {},
  Link: {
    entry: async (
      parent: { kind?: string; id?: string; __read: Read },
      _args: unknown,
      context: Context,
    ) =>
      parent.kind === 'entry' && typeof parent.id === 'string'
        ? ((await linked(context, parent.__read, [parent.id]))[0] ?? null)
        : null,
  },
  RichText: {
    entries: (parent: { json: unknown; __read: Read }, _args: unknown, context: Context) =>
      linked(context, parent.__read, [...new Set(richTextEntryIds(parent.json))]),
  },
  Query: {
    entry: async (
      _p: unknown,
      args: { id: string; locale?: string; preview?: boolean },
      context: Context,
    ) => {
      const state = stateOf(args.preview)
      await delivery(context).open(state)
      const read = { locale: await localeOf(context, args.locale), state }
      return (await linked(context, read, [args.id]))[0] ?? null
    },
    entries: async (
      _p: unknown,
      args: {
        contentType: string
        limit?: number
        cursor?: string
        locale?: string
        preview?: boolean
      },
      context: Context,
    ) => {
      const state = stateOf(args.preview)
      const scope = await delivery(context).open(state)
      const type = scope.types.find((t) => t.apiId === args.contentType && t.kind === 'entry')
      if (type === undefined) throw new NotFoundError('Content type not found')
      return collection(context, scope, type, { ...args, state }, {})
    },
  },
}

async function collection(
  context: Context,
  scope: DeliveryScope,
  type: ContentType,
  args: { limit?: number; cursor?: string; locale?: string; state: EntryState },
  filters: Record<string, unknown>,
) {
  const read = { locale: await localeOf(context, args.locale), state: args.state }
  const page = await delivery(context).service.collection(scope, type, {
    state: args.state,
    filters,
    limit: limitOf(args.limit),
    cursor: args.cursor ?? undefined,
  })
  return { items: page.items.map((d) => entryParent(d, read)), nextCursor: page.nextCursor }
}

const FILTERABLE = new Set(['text', 'select', 'number', 'boolean', 'date'])

/** GraphQL output type of a field (ADR 0011 §4). */
function outputType(
  field: FieldDefinition,
  types: readonly ContentType[],
  registry: FieldTypeRegistry,
): string {
  const many = field.settings['multiple'] === true
  const list = (t: string) => (many ? `[${t}!]` : t)
  switch (field.type) {
    case 'text':
    case 'longText':
      return 'String'
    case 'number':
      return field.settings['integer'] === true ? 'Int' : 'Float'
    case 'boolean':
      return 'Boolean'
    case 'date':
      return 'Date'
    case 'dateTime':
      return 'DateTime'
    case 'select':
      return list('String')
    case 'json':
      return 'JSON'
    case 'richText':
      return 'RichText'
    case 'link':
      return 'Link'
    case 'asset':
      return list('Asset')
    case 'blocks':
      return '[Block!]'
    case 'reference': {
      const ids = field.settings['contentTypeIds']
      const only =
        Array.isArray(ids) && ids.length === 1 ? types.find((t) => t.id === ids[0]) : undefined
      return list(only === undefined ? 'Entry' : typeName(only))
    }
    default: {
      const type = registry.get(field.type)
      const hint = type?.graphql?.(type.settings.parse(field.settings) as never)?.type
      return hint !== undefined &&
        ['String', 'Int', 'Float', 'Boolean', 'JSON', 'Date', 'DateTime'].includes(hint)
        ? hint
        : 'JSON'
    }
  }
}

const filterType = (field: FieldDefinition) =>
  field.type === 'number'
    ? field.settings['integer'] === true
      ? 'Int'
      : 'Float'
    : field.type === 'boolean'
      ? 'Boolean'
      : field.type === 'date'
        ? 'Date'
        : 'String'

/**
 * The typed delivery schema of one content model (ADR 0011): an object type per content type
 * (`implements Entry`) and component (`implements Block`), and `<apiId>` / `<apiId>Collection`
 * root fields with typed filters.
 */
export function generateDeliverySchema(
  types: readonly ContentType[],
  registry: FieldTypeRegistry,
): SchemaPart {
  const sdl: string[] = []
  const resolvers: Record<string, Record<string, unknown>> = { Query: {} }
  const query: string[] = []

  for (const type of types) {
    const name = typeName(type)
    const fields = type.fields.filter((f) => !f.disabled)
    const fieldResolvers: Record<string, unknown> = {}
    const lines = fields.map((field) => {
      fieldResolvers[field.apiId] = (parent: Parent, _args: unknown, context: Context) =>
        fieldValue(field, parent, context)
      const doc = field.description === undefined ? '' : `${JSON.stringify(field.description)} `
      return `  ${doc}${field.apiId}: ${outputType(field, types, registry)}`
    })

    if (type.kind === 'component') {
      sdl.push(
        `type ${name} implements Block {\n  _id: ID!\n  _type: String!\n${lines.join('\n')}\n}`,
      )
      resolvers[name] = {
        ...fieldResolvers,
        _id: (p: BlockParent) => p.values['_id'],
        _type: (p: BlockParent) => p.component.apiId,
      }
      continue
    }

    sdl.push(`type ${name} implements Entry {\n  sys: Sys!\n${lines.join('\n')}\n}`)
    sdl.push(`type ${name}Collection {\n  items: [${name}!]!\n  nextCursor: String\n}`)
    resolvers[name] = {
      ...fieldResolvers,
      sys: (p: EntryParent) => ({
        id: p.delivered.entry.id,
        contentType: p.delivered.contentType.apiId,
        version: p.delivered.version.number,
        locale: p.locale,
        publishedAt: p.delivered.entry.publishedAt,
        firstPublishedAt: p.delivered.entry.firstPublishedAt,
        updatedAt: p.delivered.entry.updatedAt,
      }),
    }

    const filterable = fields.filter((f) => FILTERABLE.has(f.type) && !f.localized)
    if (filterable.length > 0)
      sdl.push(
        `input ${name}Filter {\n${filterable.map((f) => `  ${f.apiId}: ${filterType(f)}`).join('\n')}\n}`,
      )
    const { single, collection: many } = rootFields(type)
    const common = 'locale: Locale, preview: Boolean = false'
    query.push(`  ${single}(id: ID!, ${common}): ${name}`)
    query.push(
      `  ${many}(${filterable.length > 0 ? `where: ${name}Filter, ` : ''}limit: Int = 25, cursor: String, ${common}): ${name}Collection!`,
    )
    const Query = resolvers['Query'] as Record<string, unknown>
    Query[single] = async (
      _p: unknown,
      args: { id: string; locale?: string; preview?: boolean },
      context: Context,
    ) => {
      const state = stateOf(args.preview)
      await delivery(context).open(state)
      const read = { locale: await localeOf(context, args.locale), state }
      const [found] = await linked(context, read, [args.id])
      return found?.delivered.contentType.id === type.id ? found : null
    }
    Query[many] = async (
      _p: unknown,
      args: {
        where?: Record<string, unknown>
        limit?: number
        cursor?: string
        locale?: string
        preview?: boolean
      },
      context: Context,
    ) => {
      const state = stateOf(args.preview)
      const scope = await delivery(context).open(state)
      const filters: Record<string, unknown> = {}
      for (const [apiId, value] of Object.entries(args.where ?? {})) {
        const field = filterable.find((f) => f.apiId === apiId)
        if (field === undefined || value === null || value === undefined) continue
        filters[field.id] =
          field.type === 'select' && field.settings['multiple'] === true ? [value] : value
      }
      return collection(context, scope, type, { ...args, state }, filters)
    }
  }

  if (query.length > 0) sdl.push(`extend type Query {\n${query.join('\n')}\n}`)
  return { module: MODULE, typeDefs: sdl.join('\n\n'), resolvers: resolvers as never }
}
