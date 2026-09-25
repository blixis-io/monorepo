import {
  type Actor,
  type AuthorizationService,
  actorId,
  ConflictError,
  createServiceToken,
  type EventBus,
  NotFoundError,
  type PermissionId,
  type ServiceToken,
  ValidationError,
} from '@blixis/contracts'
import { type Database, isId, toTransactionScope, withTransaction } from '@blixis/database'
import type { LocaleService } from '@blixis/spaces'
import type { ContentType } from '../domain/content-type.ts'
import {
  type Entry,
  type EntryState,
  type EntryStatus,
  type EntryVersion,
  entryStatus,
} from '../domain/entry.ts'
import { collectLinks } from '../domain/links.ts'
import { entryCreated, entryDeleted, entryUpdated } from '../events.ts'
import type { FieldTypeRegistry } from '../field-types/define.ts'
import {
  contentTypeRepository,
  type EnvironmentTenant,
} from '../infrastructure/content-type.repository.ts'
import { type EntryCursor, entryRepository } from '../infrastructure/entry.repository.ts'
import { CONTENT_PERMISSIONS } from '../permissions.ts'
import type { ApiFields, EntrySchemaCache } from './entry-schema.ts'

/** System properties of an entry as the API returns them. */
export interface EntrySys {
  readonly id: string
  readonly type: 'entry'
  readonly contentType: { readonly id: string; readonly apiId: string }
  readonly environmentId: string
  /** Number of the current (latest) version — send it back as `expectedVersion`. */
  readonly version: number
  /** Number of the version these fields come from. */
  readonly fieldsVersion: number
  readonly status: EntryStatus
  readonly publishedVersionId: string | null
  readonly publishedAt: string | null
  readonly firstPublishedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly createdBy: string
  readonly updatedBy: string
}

/** An entry with the fields of one version, keyed by `apiId` (ADR 0010 §3). */
export interface EntryView {
  readonly sys: EntrySys
  readonly fields: ApiFields
}

/** Options for {@link ContentService.list}. */
export interface EntryListQuery {
  /** Content type `apiId` (or id). Required for field filters. */
  readonly contentType?: string | undefined
  /** `draft` (default): latest versions; `published`: only published entries, their live version. */
  readonly state?: EntryState | undefined
  readonly updatedSince?: string | undefined
  /** 1–100, default 25. */
  readonly limit?: number | undefined
  /** `nextCursor` of the previous page. */
  readonly cursor?: string | undefined
  /** Equality filters on non-localized fields by `apiId`, e.g. `{ slug: 'home' }`. */
  readonly fields?: Readonly<Record<string, string>> | undefined
}

/**
 * Entries of one environment on behalf of an actor (§22, plan 011) — the only path for REST,
 * GraphQL, imports, and background jobs. Every save appends an immutable version; nothing is
 * overwritten. Request-scoped: `services.get(CONTENT_SERVICE)`.
 */
export interface ContentService {
  /**
   * The tenant of an entry, for entry-id routes: verifies the actor may read it first (§31).
   * @throws NotFoundError for unknown entries and entries the actor cannot access
   */
  resolveTenant(actor: Actor, entryId: string): Promise<EnvironmentTenant>
  /** Creates an entry (version 1); fields are validated as a draft. */
  create(
    actor: Actor,
    tenant: EnvironmentTenant,
    input: { contentType: string; fields: unknown },
  ): Promise<EntryView>
  /** @throws NotFoundError (unknown, or not published for `state: 'published'`) */
  get(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    options?: { state?: EntryState },
  ): Promise<EntryView>
  list(
    actor: Actor,
    tenant: EnvironmentTenant,
    query?: EntryListQuery,
  ): Promise<{ entries: EntryView[]; nextCursor: string | null }>
  /**
   * Saves a new draft version with the complete fields.
   * @throws ConflictError when `expectedVersion` is not the current version
   */
  update(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    input: { fields: unknown; expectedVersion: number },
  ): Promise<EntryView>
  /** Deletes an unpublished entry with all versions. @throws ConflictError while published */
  delete(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    options?: { expectedVersion?: number },
  ): Promise<void>
}

/** Request-scoped {@link ContentService}, provided by `contentModule()`. */
export const CONTENT_SERVICE: ServiceToken<ContentService> =
  createServiceToken<ContentService>('@blixis/content.entries')

/** Everything the content service needs (plus its later capabilities). */
export interface ContentServiceDeps {
  readonly db: Database
  readonly authz: AuthorizationService
  readonly events: EventBus
  readonly registry: FieldTypeRegistry
  readonly schemas: EntrySchemaCache
  readonly locales: Pick<LocaleService, 'codes'>
}

const P = CONTENT_PERMISSIONS
const encodeCursor = (c: EntryCursor) =>
  btoa(JSON.stringify([c.updatedAt, c.id])).replace(/=+$/, '')
function decodeCursor(value: string): EntryCursor {
  try {
    const [updatedAt, id] = JSON.parse(atob(value)) as [unknown, unknown]
    if (
      typeof updatedAt === 'string' &&
      typeof id === 'string' &&
      isId(id) &&
      !Number.isNaN(Date.parse(updatedAt))
    )
      return { updatedAt, id }
  } catch {}
  throw new ValidationError('Invalid cursor', [
    { path: ['cursor'], message: 'Use nextCursor from the previous page' },
  ])
}

/** Internals shared by the entry lifecycle services (drafts, publishing, versions). */
export function createEntryToolkit(deps: ContentServiceDeps) {
  const { db, authz, registry, schemas, locales } = deps
  let typesMemo: Promise<ContentType[]> | undefined
  let typesTenant = ''

  const resource = (tenant: EnvironmentTenant, id?: string) => ({
    type: 'entry',
    ...(id === undefined ? {} : { id }),
    organizationId: tenant.organizationId,
    spaceId: tenant.spaceId,
  })
  const require = (actor: Actor, action: PermissionId, tenant: EnvironmentTenant, id?: string) =>
    authz.require({ actor, action, resource: resource(tenant, id) })

  /** Every type and component of the environment (once per request and tenant). */
  function types(tenant: EnvironmentTenant): Promise<ContentType[]> {
    const key = `${tenant.spaceId}|${tenant.environmentId}`
    if (typesMemo === undefined || typesTenant !== key) {
      typesTenant = key
      typesMemo = contentTypeRepository.list(db, tenant)
    }
    return typesMemo
  }

  async function typeOf(tenant: EnvironmentTenant, idOrApiId: string): Promise<ContentType> {
    const found = (await types(tenant)).find((t) => t.id === idOrApiId || t.apiId === idOrApiId)
    if (found === undefined) throw new NotFoundError('Content type not found')
    return found
  }

  async function schema(
    tenant: EnvironmentTenant,
    contentType: ContentType,
    mode: 'draft' | 'publish',
  ) {
    const { codes, defaultCode } = await locales.codes(tenant)
    return schemas.get({
      contentType,
      types: await types(tenant),
      locales: codes,
      defaultLocale: defaultCode,
      mode,
      registry,
    })
  }

  async function load(tenant: EnvironmentTenant, id: string): Promise<Entry> {
    const entry = isId(id) ? await entryRepository.findById(db, tenant, id) : undefined
    if (entry === undefined) throw new NotFoundError('Entry not found')
    return entry
  }

  async function view(
    tenant: EnvironmentTenant,
    entry: Entry,
    version: EntryVersion,
  ): Promise<EntryView> {
    const contentType = await typeOf(tenant, entry.contentTypeId)
    return {
      sys: {
        id: entry.id,
        type: 'entry',
        contentType: { id: contentType.id, apiId: contentType.apiId },
        environmentId: entry.environmentId,
        version: entry.version,
        fieldsVersion: version.number,
        status: entryStatus(entry),
        publishedVersionId: entry.publishedVersionId,
        publishedAt: entry.publishedAt,
        firstPublishedAt: entry.firstPublishedAt,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        createdBy: entry.createdBy,
        updatedBy: entry.updatedBy,
      },
      fields: (await schema(tenant, contentType, 'draft')).fromStorage(version.fields),
    }
  }

  /** Validates API fields and returns them in storage form with their links. */
  async function prepare(
    tenant: EnvironmentTenant,
    contentType: ContentType,
    fields: unknown,
    mode: 'draft' | 'publish',
  ) {
    const compiled = await schema(tenant, contentType, mode)
    const result = compiled.validate(fields)
    if (!result.ok) throw new ValidationError('Invalid entry fields', result.issues)
    const stored = compiled.toStorage(result.fields)
    return { stored, links: collectLinks(contentType, await types(tenant), stored) }
  }

  const stale = (current: number) =>
    new ConflictError(
      `The entry changed since you loaded it (now version ${current}): reload and retry`,
    )

  return { require, types, typeOf, schema, load, view, prepare, stale }
}

export function createContentService(deps: ContentServiceDeps): ContentService {
  const { db, events } = deps
  const kit = createEntryToolkit(deps)
  const payload = (entry: Entry, version: EntryVersion) => ({
    entryId: entry.id,
    environmentId: entry.environmentId,
    contentTypeId: entry.contentTypeId,
    versionId: version.id,
  })

  return {
    async resolveTenant(actor, entryId) {
      const entry = isId(entryId) ? await entryRepository.findForResolution(db, entryId) : undefined
      if (entry === undefined) throw new NotFoundError('Entry not found')
      const tenant = {
        organizationId: entry.organizationId,
        spaceId: entry.spaceId,
        environmentId: entry.environmentId,
      }
      await kit.require(actor, P.entriesRead.id, tenant, entry.id)
      return tenant
    },

    async create(actor, tenant, input) {
      await kit.require(actor, P.entriesWrite.id, tenant)
      const contentType = await kit.typeOf(tenant, String(input.contentType ?? ''))
      if (contentType.kind !== 'entry')
        throw new ValidationError('Invalid content type', [
          {
            path: ['contentType'],
            message: 'Components have no entries of their own: add them to a blocks field',
          },
        ])
      const { stored, links } = await kit.prepare(tenant, contentType, input.fields ?? {}, 'draft')
      const { entry, version } = await withTransaction(db, (tx) =>
        entryRepository.create(tx, tenant, contentType.id, {
          fields: stored,
          contentTypeVersion: contentType.version,
          actor: actorId(actor),
          links,
        }),
      )
      await events.emit(entryCreated, payload(entry, version))
      return kit.view(tenant, entry, version)
    },

    async get(actor, tenant, id, options = {}) {
      await kit.require(actor, P.entriesRead.id, tenant, id)
      const entry = await kit.load(tenant, id)
      const versionId =
        options.state === 'published' ? entry.publishedVersionId : entry.currentVersionId
      if (versionId === null) throw new NotFoundError('Entry is not published')
      const version = await entryRepository.version(db, tenant, entry.id, versionId)
      if (version === undefined) throw new NotFoundError('Entry version not found')
      return kit.view(tenant, entry, version)
    },

    async list(actor, tenant, query = {}) {
      await kit.require(actor, P.entriesRead.id, tenant)
      const limit = query.limit ?? 25
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new ValidationError('Invalid limit', [{ path: ['limit'], message: 'Use 1–100' }])
      if (query.updatedSince !== undefined && Number.isNaN(Date.parse(query.updatedSince)))
        throw new ValidationError('Invalid filter', [
          { path: ['updatedSince'], message: 'Use an ISO 8601 timestamp' },
        ])
      const contentType =
        query.contentType === undefined ? undefined : await kit.typeOf(tenant, query.contentType)
      const fieldFilters = storedFilters(contentType, query.fields ?? {})
      const rows = await entryRepository.list(db, tenant, {
        state: query.state ?? 'draft',
        contentTypeId: contentType?.id,
        updatedSince: query.updatedSince,
        cursor: query.cursor === undefined ? undefined : decodeCursor(query.cursor),
        fieldFilters,
        limit: limit + 1,
      })
      const page = rows.slice(0, limit)
      const last = page.at(-1)?.entry
      return {
        entries: await Promise.all(page.map((r) => kit.view(tenant, r.entry, r.version))),
        nextCursor:
          rows.length > limit && last !== undefined
            ? encodeCursor({ updatedAt: last.updatedAt, id: last.id })
            : null,
      }
    },

    async update(actor, tenant, id, input) {
      await kit.require(actor, P.entriesWrite.id, tenant, id)
      if (!Number.isInteger(input.expectedVersion))
        throw new ValidationError('Invalid update', [
          {
            path: ['expectedVersion'],
            message: 'Send the version you edited (sys.version or If-Match)',
          },
        ])
      const entry = await kit.load(tenant, id)
      if (entry.version !== input.expectedVersion) throw kit.stale(entry.version)
      const contentType = await kit.typeOf(tenant, entry.contentTypeId)
      const { stored, links } = await kit.prepare(tenant, contentType, input.fields ?? {}, 'draft')
      const saved = await withTransaction(db, (tx) =>
        entryRepository.append(tx, tenant, entry.id, input.expectedVersion, {
          fields: stored,
          contentTypeVersion: contentType.version,
          actor: actorId(actor),
          links,
        }),
      )
      if (saved === undefined) throw kit.stale((await kit.load(tenant, id)).version)
      await events.emit(entryUpdated, payload(saved.entry, saved.version))
      return kit.view(tenant, saved.entry, saved.version)
    },

    async delete(actor, tenant, id, options = {}) {
      await kit.require(actor, P.entriesDelete.id, tenant, id)
      const entry = await kit.load(tenant, id)
      if (options.expectedVersion !== undefined && entry.version !== options.expectedVersion)
        throw kit.stale(entry.version)
      if (entry.publishedVersionId !== null)
        throw new ConflictError('The entry is published: unpublish it first')
      await withTransaction(db, async (tx) => {
        await entryRepository.delete(tx, tenant, entry.id)
        await events.emit(
          entryDeleted,
          {
            entryId: entry.id,
            environmentId: entry.environmentId,
            contentTypeId: entry.contentTypeId,
            versionId: entry.currentVersionId,
          },
          { transaction: toTransactionScope(tx) },
        )
      })
    },
  }
}

const FILTERABLE: Record<string, (raw: string) => unknown> = {
  text: (raw) => raw,
  select: (raw) => raw,
  date: (raw) => raw,
  number: (raw) => {
    const n = Number(raw)
    return raw.trim() === '' || Number.isNaN(n) ? undefined : n
  },
  boolean: (raw) => (raw === 'true' ? true : raw === 'false' ? false : undefined),
}

/** Maps `?fields.<apiId>=value` filters to stored-shape JSONB containment (MVP, ADR 0010 §9). */
function storedFilters(
  contentType: ContentType | undefined,
  filters: Readonly<Record<string, string>>,
) {
  const entries = Object.entries(filters)
  if (entries.length === 0) return undefined
  if (contentType === undefined)
    throw new ValidationError('Invalid filter', [
      { path: ['contentType'], message: 'Field filters need a contentType' },
    ])
  const stored: Record<string, unknown> = {}
  const issues: { path: string[]; message: string }[] = []
  for (const [apiId, raw] of entries) {
    const field = contentType.fields.find((f) => f.apiId === apiId && !f.disabled)
    const parse = field === undefined ? undefined : FILTERABLE[field.type]
    if (field === undefined || parse === undefined || field.localized) {
      issues.push({
        path: ['fields', apiId],
        message: 'Filter on non-localized text, select, number, boolean, or date fields',
      })
      continue
    }
    const value = parse(raw)
    if (value === undefined)
      issues.push({ path: ['fields', apiId], message: `Invalid ${field.type} value` })
    // Multi-selects store arrays: containment of [value] matches any entry holding it.
    else
      stored[field.id] =
        field.type === 'select' && field.settings['multiple'] === true ? [value] : value
  }
  if (issues.length > 0) throw new ValidationError('Invalid filter', issues)
  return stored
}
