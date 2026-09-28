import {
  CONTENT_SERVICE,
  type ContentService,
  type EntryListQuery,
  type EntrySys,
  type EntryVersionView,
  type EntryView,
} from '@blixis/content-api'
import {
  type Actor,
  type AssetLookup,
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
import { collectLinks, collectLinkUsages } from '../domain/links.ts'
import {
  entryCreated,
  entryDeleted,
  entryPublished,
  entryUnpublished,
  entryUpdated,
} from '../events.ts'
import type { FieldTypeRegistry } from '../field-types/define.ts'
import {
  contentTypeRepository,
  type EnvironmentTenant,
} from '../infrastructure/content-type.repository.ts'
import { type EntryCursor, entryRepository } from '../infrastructure/entry.repository.ts'
import { CONTENT_PERMISSIONS } from '../permissions.ts'
import type { ApiFields, EntrySchemaCache } from './entry-schema.ts'

export {
  CONTENT_SERVICE,
  type ContentService,
  type EntryListQuery,
  type EntrySys,
  type EntryVersionView,
  type EntryView,
} from '@blixis/content-api'

/** Everything the content service needs (plus its later capabilities). */
export interface ContentServiceDeps {
  readonly db: Database
  readonly authz: AuthorizationService
  readonly events: EventBus
  readonly registry: FieldTypeRegistry
  readonly schemas: EntrySchemaCache
  readonly locales: Pick<LocaleService, 'codes'>
  /** Asset lookup when the app has assets (`blixis.assets`); asset links are checked with it. */
  readonly assets?: AssetLookup | undefined
}

const P = CONTENT_PERMISSIONS
/** Maximum levels of `include` (link resolution depth). */
export const MAX_INCLUDE_DEPTH = 3
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
    organizationId: entry.organizationId,
    spaceId: entry.spaceId,
    environmentId: entry.environmentId,
    contentTypeId: entry.contentTypeId,
    versionId: version.id,
  })

  async function versionView(
    tenant: EnvironmentTenant,
    entry: Entry,
    version: EntryVersion,
  ): Promise<EntryVersionView> {
    const contentType = await kit.typeOf(tenant, entry.contentTypeId)
    return {
      sys: {
        id: version.id,
        entryId: entry.id,
        number: version.number,
        contentTypeVersion: version.contentTypeVersion,
        restoredFrom: version.restoredFrom,
        isCurrent: version.id === entry.currentVersionId,
        isPublished: version.id === entry.publishedVersionId,
        createdAt: version.createdAt,
        createdBy: version.createdBy,
      },
      fields: (await kit.schema(tenant, contentType, 'draft')).fromStorage(version.fields),
    }
  }

  const service: ContentService = {
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
            organizationId: entry.organizationId,
            spaceId: entry.spaceId,
            environmentId: entry.environmentId,
            contentTypeId: entry.contentTypeId,
            versionId: entry.currentVersionId,
          },
          { transaction: toTransactionScope(tx) },
        )
      })
    },
    async listVersions(actor, tenant, id, page = {}) {
      await kit.require(actor, P.entriesRead.id, tenant, id)
      const limit = page.limit ?? 25
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new ValidationError('Invalid limit', [{ path: ['limit'], message: 'Use 1–100' }])
      if (page.before !== undefined && !Number.isInteger(page.before))
        throw new ValidationError('Invalid page', [
          { path: ['before'], message: 'Use nextBefore from the previous page' },
        ])
      const entry = await kit.load(tenant, id)
      const rows = await entryRepository.versions(db, tenant, entry.id, {
        limit: limit + 1,
        before: page.before,
      })
      const versions = rows.slice(0, limit)
      return {
        versions: await Promise.all(versions.map((v) => versionView(tenant, entry, v))),
        nextBefore: rows.length > limit ? (versions.at(-1)?.number ?? null) : null,
      }
    },

    async getVersion(actor, tenant, id, versionId) {
      await kit.require(actor, P.entriesRead.id, tenant, id)
      const entry = await kit.load(tenant, id)
      const version = isId(versionId)
        ? await entryRepository.version(db, tenant, entry.id, versionId)
        : undefined
      if (version === undefined) throw new NotFoundError('Entry version not found')
      return versionView(tenant, entry, version)
    },

    async restoreVersion(actor, tenant, id, versionId, expectedVersion) {
      await kit.require(actor, P.entriesWrite.id, tenant, id)
      if (!Number.isInteger(expectedVersion))
        throw new ValidationError('Invalid restore', [
          {
            path: ['expectedVersion'],
            message: 'Send the version you edited (sys.version or If-Match)',
          },
        ])
      const entry = await kit.load(tenant, id)
      if (entry.version !== expectedVersion) throw kit.stale(entry.version)
      const old = isId(versionId)
        ? await entryRepository.version(db, tenant, entry.id, versionId)
        : undefined
      if (old === undefined) throw new NotFoundError('Entry version not found')
      const contentType = await kit.typeOf(tenant, entry.contentTypeId)
      const draft = await kit.schema(tenant, contentType, 'draft')
      const { stored, links } = await kit.prepare(
        tenant,
        contentType,
        draft.fromStorage(old.fields),
        'draft',
      )
      const saved = await withTransaction(db, (tx) =>
        entryRepository.append(tx, tenant, entry.id, expectedVersion, {
          fields: stored,
          contentTypeVersion: contentType.version,
          actor: actorId(actor),
          links,
          restoredFrom: old.id,
        }),
      )
      if (saved === undefined) throw kit.stale((await kit.load(tenant, id)).version)
      await events.emit(entryUpdated, {
        ...payload(saved.entry, saved.version),
        restoredFrom: old.id,
      })
      return kit.view(tenant, saved.entry, saved.version)
    },
    async findReferrers(actor, tenant, id, options = {}) {
      await kit.require(actor, P.entriesRead.id, tenant, id)
      const entry = await kit.load(tenant, id)
      const state = options.state ?? 'draft'
      const referrers = (
        await entryRepository.referrers(db, tenant, { type: 'entry', id: entry.id }, state)
      ).filter((r) => r.id !== entry.id)
      const loaded = await entryRepository.findManyWithVersions(
        db,
        tenant,
        referrers.map((r) => r.id),
        state,
      )
      return Promise.all(loaded.map((r) => kit.view(tenant, r.entry, r.version)))
    },

    async resolveLinks(actor, tenant, entryIds, options = {}) {
      await kit.require(actor, P.entriesRead.id, tenant)
      const depth = options.depth ?? 1
      if (!Number.isInteger(depth) || depth < 0 || depth > MAX_INCLUDE_DEPTH)
        throw new ValidationError('Invalid include', [
          { path: ['include'], message: `Use 0–${MAX_INCLUDE_DEPTH}` },
        ])
      const state = options.state ?? 'draft'
      const seen = new Set(entryIds)
      const included: EntryView[] = []
      const types = await kit.types(tenant)
      let frontier = await entryRepository.findManyWithVersions(db, tenant, [...seen], state)
      for (let level = 0; level < depth && frontier.length > 0; level++) {
        const next = new Set<string>()
        for (const { entry, version } of frontier) {
          const type = types.find((t) => t.id === entry.contentTypeId)
          if (type === undefined) continue
          for (const link of collectLinks(type, types, version.fields))
            if (link.type === 'entry' && !seen.has(link.id)) next.add(link.id)
        }
        if (next.size === 0) break
        for (const id of next) seen.add(id)
        frontier = await entryRepository.findManyWithVersions(db, tenant, [...next], state)
        for (const row of frontier) included.push(await kit.view(tenant, row.entry, row.version))
      }
      return included
    },
    async publish(actor, tenant, id, options = {}) {
      await kit.require(actor, P.entriesPublish.id, tenant, id)
      const entry = await kit.load(tenant, id)
      if (options.expectedVersion !== undefined && entry.version !== options.expectedVersion)
        throw kit.stale(entry.version)
      const versionId = options.versionId ?? entry.currentVersionId
      const version = isId(versionId)
        ? await entryRepository.version(db, tenant, entry.id, versionId)
        : undefined
      if (version === undefined) throw new NotFoundError('Entry version not found')
      if (entry.publishedVersionId === version.id) return kit.view(tenant, entry, version)

      const contentType = await kit.typeOf(tenant, entry.contentTypeId)
      const strict = await kit.schema(tenant, contentType, 'publish')
      const checked = strict.validate(strict.fromStorage(version.fields))
      const issues = checked.ok ? [] : [...checked.issues]
      issues.push(...(await linkIssues(tenant, contentType, version.fields, entry.id)))
      if (issues.length > 0) throw new ValidationError('The entry cannot be published', issues)

      const published = await withTransaction(db, async (tx) => {
        const updated = await entryRepository.setPublished(
          tx,
          tenant,
          entry.id,
          version.id,
          actorId(actor),
        )
        await events.emit(entryPublished, payload(updated, version), {
          transaction: toTransactionScope(tx),
        })
        return updated
      })
      return kit.view(tenant, published, version)
    },

    async unpublish(actor, tenant, id, options = {}) {
      await kit.require(actor, P.entriesPublish.id, tenant, id)
      const entry = await kit.load(tenant, id)
      const current = await entryRepository.version(db, tenant, entry.id, entry.currentVersionId)
      if (current === undefined) throw new NotFoundError('Entry version not found')
      const liveVersionId = entry.publishedVersionId
      if (liveVersionId === null) return kit.view(tenant, entry, current)
      if (options.force !== true) {
        const referrers = (
          await entryRepository.referrers(db, tenant, { type: 'entry', id: entry.id }, 'published')
        ).filter((r) => r.id !== entry.id)
        if (referrers.length > 0)
          throw new ConflictError(
            `Published entries link to this entry (${referrers.map((r) => r.id).join(', ')}): unpublish or change them first, or unpublish with force`,
          )
      }
      const unpublished = await withTransaction(db, async (tx) => {
        const updated = await entryRepository.setPublished(
          tx,
          tenant,
          entry.id,
          null,
          actorId(actor),
        )
        await events.emit(
          entryUnpublished,
          {
            entryId: entry.id,
            organizationId: entry.organizationId,
            spaceId: entry.spaceId,
            environmentId: entry.environmentId,
            contentTypeId: entry.contentTypeId,
            versionId: liveVersionId,
          },
          { transaction: toTransactionScope(tx) },
        )
        return updated
      })
      return kit.view(tenant, unpublished, current)
    },
  }

  return service

  /**
   * Links that block publishing: missing or unpublished entries and assets, entries of a type the
   * field does not allow, and assets of a media type it does not allow (plan 014.005).
   */
  async function linkIssues(
    tenant: EnvironmentTenant,
    contentType: ContentType,
    fields: Readonly<Record<string, unknown>>,
    self: string,
  ) {
    const usages = collectLinkUsages(contentType, await kit.types(tenant), fields).filter(
      (u) => u.link.type === 'entry' && u.link.id !== self,
    )
    const targets = new Map(
      (
        await entryRepository.findManyByIds(db, tenant, [...new Set(usages.map((u) => u.link.id))])
      ).map((e) => [e.id, e]),
    )
    const issues: { path: (string | number)[]; message: string }[] = []
    for (const usage of usages) {
      const target = targets.get(usage.link.id)
      const message =
        target === undefined
          ? 'Links to an entry that does not exist'
          : target.publishedVersionId === null
            ? 'Links to an unpublished entry: publish it first'
            : usage.contentTypeIds.length > 0 &&
                !usage.contentTypeIds.includes(target.contentTypeId)
              ? 'Links to an entry of a type this field does not allow'
              : undefined
      if (message !== undefined) issues.push({ path: [...usage.path], message })
    }
    issues.push(...(await assetIssues(tenant, contentType, fields)))
    return issues
  }

  /** Asset links: the asset must exist, be published, and match the field's `mimeTypes`. */
  async function assetIssues(
    tenant: EnvironmentTenant,
    contentType: ContentType,
    fields: Readonly<Record<string, unknown>>,
  ) {
    const usages = collectLinkUsages(contentType, await kit.types(tenant), fields).filter(
      (u) => u.link.type === 'asset',
    )
    if (usages.length === 0 || deps.assets === undefined) return []
    const found = new Map(
      (await deps.assets.findMany(tenant, [...new Set(usages.map((u) => u.link.id))])).map((a) => [
        a.id,
        a,
      ]),
    )
    const issues: { path: (string | number)[]; message: string }[] = []
    for (const usage of usages) {
      const asset = found.get(usage.link.id)
      const message =
        asset === undefined
          ? 'Links to an asset that does not exist'
          : asset.status !== 'published'
            ? 'Links to an unpublished asset: publish it first'
            : !mimeAllowed(usage.mimeTypes, asset.mimeType)
              ? `Links to a ${asset.mimeType} asset, which this field does not allow`
              : undefined
      if (message !== undefined) issues.push({ path: [...usage.path], message })
    }
    return issues
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

/** Whether `mimeType` matches one of `patterns` (`image/*`, `application/pdf`); none allows all. */
function mimeAllowed(patterns: readonly string[], mimeType: string): boolean {
  if (patterns.length === 0) return true
  return patterns.some((pattern) =>
    pattern.endsWith('/*') ? mimeType.startsWith(pattern.slice(0, -1)) : pattern === mimeType,
  )
}
