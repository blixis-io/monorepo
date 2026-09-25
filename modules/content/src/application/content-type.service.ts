import {
  type Actor,
  type AuthorizationService,
  ConflictError,
  createServiceToken,
  type EventBus,
  NotFoundError,
  type ResourceRef,
  type ServiceToken,
  ValidationError,
  type ValidationIssue,
  validate,
} from '@blixis/contracts'
import { type Database, isId } from '@blixis/database'
import {
  CONTENT_LIMITS,
  type ContentType,
  type ContentTypeKind,
  type CreateContentTypeInput,
  createContentTypeSchema,
  type FieldDefinition,
  type FieldGroup,
  type FieldInput,
  fieldInputSchema,
  newShortId,
  type UpdateContentTypeInput,
  updateContentTypeSchema,
} from '../domain/content-type.ts'
import { contentTypeCreated, contentTypeDeleted, contentTypeUpdated } from '../events.ts'
import type { FieldTypeRegistry } from '../field-types/define.ts'
import {
  contentTypeRepository,
  type EnvironmentTenant,
} from '../infrastructure/content-type.repository.ts'
import { CONTENT_PERMISSIONS } from '../permissions.ts'

/** A field as the API returns it: `showWhen.field` names a sibling by `apiId`. */
export interface FieldView extends Omit<FieldDefinition, 'showWhen'> {
  readonly showWhen?: { readonly field: string; readonly equals: unknown }
}

/** A content type as the API returns it (`displayField` and `showWhen` use `apiId`s). */
export interface ContentTypeView {
  readonly id: string
  readonly environmentId: string
  readonly kind: ContentTypeKind
  readonly apiId: string
  readonly name: string
  readonly description: string
  readonly displayField: string | null
  readonly groups: readonly FieldGroup[]
  readonly fields: readonly FieldView[]
  readonly version: number
  readonly createdAt: string
  readonly updatedAt: string
}

/**
 * Content types and components of one environment, on behalf of an actor (plan 010.005).
 * Reading needs `content.types.read`, changes `content.types.write`. Changes follow ADR 0010 §10:
 * additive changes are free; type/`localized` changes and removals are blocked while entries
 * exist; every change bumps `version`, which clients must send back. Request-scoped.
 */
export interface ContentTypeService {
  list(
    actor: Actor,
    tenant: EnvironmentTenant,
    filter?: { kind?: ContentTypeKind },
  ): Promise<ContentTypeView[]>
  /** @throws NotFoundError */
  get(actor: Actor, tenant: EnvironmentTenant, id: string): Promise<ContentTypeView>
  /** Every type and component of the environment in storage form (for compilers). */
  listStored(actor: Actor, tenant: EnvironmentTenant): Promise<ContentType[]>
  /** @throws ValidationError, ConflictError (apiId taken, limit reached) */
  create(
    actor: Actor,
    tenant: EnvironmentTenant,
    input: CreateContentTypeInput,
  ): Promise<ContentTypeView>
  /** @throws NotFoundError, ValidationError, ConflictError (stale version, unsafe change) */
  update(
    actor: Actor,
    tenant: EnvironmentTenant,
    id: string,
    input: UpdateContentTypeInput,
  ): Promise<ContentTypeView>
  /** @throws NotFoundError, ConflictError (entries exist, used by other types) */
  delete(actor: Actor, tenant: EnvironmentTenant, id: string): Promise<void>
}

/** Request-scoped {@link ContentTypeService}, provided by `contentModule()`. */
export const CONTENT_TYPE_SERVICE: ServiceToken<ContentTypeService> =
  createServiceToken<ContentTypeService>('@blixis/content.content-types')

/**
 * How many entries use a content type (or, for components, entries containing it). Plan 011
 * replaces the default, which reports none because no entries exist yet.
 * TODO(011.001): count entries once the entries table exists.
 */
export type EntryUsage = (tenant: EnvironmentTenant, contentTypeId: string) => Promise<number>

/** Request-scoped {@link EntryUsage}; `contentModule()` provides it, tests may override it. */
export const ENTRY_USAGE: ServiceToken<EntryUsage> = createServiceToken<EntryUsage>(
  '@blixis/content.entry-usage',
)

export function toView(type: ContentType): ContentTypeView {
  const apiIdOf = new Map(type.fields.map((f) => [f.id, f.apiId]))
  return {
    id: type.id,
    environmentId: type.environmentId,
    kind: type.kind,
    apiId: type.apiId,
    name: type.name,
    description: type.description,
    displayField: type.displayFieldId === null ? null : (apiIdOf.get(type.displayFieldId) ?? null),
    groups: type.groups,
    fields: type.fields.map(({ showWhen, ...field }) => ({
      ...field,
      ...(showWhen === undefined
        ? {}
        : {
            showWhen: {
              field: apiIdOf.get(showWhen.field) ?? showWhen.field,
              equals: showWhen.equals,
            },
          }),
    })),
    version: type.version,
    createdAt: type.createdAt,
    updatedAt: type.updatedAt,
  }
}

/** Setting keys that point at other content types (checked against the environment). */
const TYPE_REFERENCES: Record<string, { key: string; kind: ContentTypeKind }> = {
  blocks: { key: 'componentIds', kind: 'component' },
  reference: { key: 'contentTypeIds', kind: 'entry' },
  link: { key: 'contentTypeIds', kind: 'entry' },
}

/** Ids of other types a type points at through its field settings. */
function referencedTypeIds(type: Pick<ContentType, 'fields'>): Set<string> {
  const ids = new Set<string>()
  for (const field of type.fields) {
    const ref = TYPE_REFERENCES[field.type]
    const value = ref === undefined ? undefined : field.settings[ref.key]
    if (Array.isArray(value)) for (const id of value) if (typeof id === 'string') ids.add(id)
  }
  return ids
}

export function createContentTypeService(deps: {
  readonly db: Database
  readonly authz: AuthorizationService
  readonly events: EventBus
  readonly registry: FieldTypeRegistry
  readonly entryUsage: EntryUsage
}): ContentTypeService {
  const { db, authz, events, registry, entryUsage } = deps

  const resource = (tenant: EnvironmentTenant, id?: string): ResourceRef => ({
    type: 'content type',
    ...(id === undefined ? {} : { id }),
    organizationId: tenant.organizationId,
    spaceId: tenant.spaceId,
  })
  const requireRead = (actor: Actor, tenant: EnvironmentTenant, id?: string) =>
    authz.require({
      actor,
      action: CONTENT_PERMISSIONS.typesRead.id,
      resource: resource(tenant, id),
    })
  const requireWrite = (actor: Actor, tenant: EnvironmentTenant, id?: string) =>
    authz.require({
      actor,
      action: CONTENT_PERMISSIONS.typesWrite.id,
      resource: resource(tenant, id),
    })

  async function load(tenant: EnvironmentTenant, id: string): Promise<ContentType> {
    const type = isId(id) ? await contentTypeRepository.findById(db, tenant, id) : undefined
    if (type === undefined) throw new NotFoundError('Content type not found')
    return type
  }

  type ContentTypeEvent =
    | typeof contentTypeCreated
    | typeof contentTypeUpdated
    | typeof contentTypeDeleted
  const emit = (event: ContentTypeEvent, type: ContentType) =>
    events.emit(event as typeof contentTypeCreated, {
      contentTypeId: type.id,
      environmentId: type.environmentId,
      apiId: type.apiId,
      kind: type.kind,
      version: type.version,
    })

  /**
   * Turns client fields into stored definitions: keeps known ids, assigns new ones, validates
   * settings per field type, groups, `showWhen`, and references to other types.
   */
  function buildFields(
    inputs: readonly FieldInput[],
    context: {
      kind: ContentTypeKind
      selfId: string | undefined
      groups: readonly FieldGroup[]
      existing: readonly FieldDefinition[]
      environment: readonly ContentType[]
    },
  ): FieldDefinition[] {
    const issues: ValidationIssue[] = []
    const issue = (path: (string | number)[], message: string) =>
      issues.push({ path: ['fields', ...path], message })
    const existingIds = new Set(context.existing.map((f) => f.id))
    const parsed = inputs.map((input) => fieldInputSchema.parse(input))
    const withIds = parsed.map((field, index) => {
      if (field.id !== undefined && !existingIds.has(field.id))
        issue([index, 'id'], 'Unknown field id; omit `id` for new fields')
      return { ...field, id: field.id ?? newShortId() }
    })
    const seenApiIds = new Set<string>()
    const seenIds = new Set<string>()
    const byApiId = new Map(withIds.map((f) => [f.apiId, f]))
    const typesById = new Map(context.environment.map((t) => [t.id, t]))

    const fields = withIds.map((field, index): FieldDefinition => {
      if (seenApiIds.has(field.apiId))
        issue([index, 'apiId'], `Duplicate field apiId "${field.apiId}"`)
      if (seenIds.has(field.id)) issue([index, 'id'], 'Duplicate field id')
      seenApiIds.add(field.apiId)
      seenIds.add(field.id)

      const type = registry.get(field.type)
      let settings: Record<string, unknown> = field.settings
      if (type === undefined) {
        issue([index, 'type'], `Unknown field type "${field.type}" (see GET /api/v1/field-types)`)
      } else {
        const result = type.settings.safeParse(field.settings)
        if (!result.success) {
          for (const i of result.error.issues)
            issue([index, 'settings', ...(i.path as (string | number)[])], i.message)
        } else settings = result.data as Record<string, unknown>
        if (field.localized && type.localizable === false)
          issue([index, 'localized'], `"${field.type}" fields cannot be localized`)
      }
      if (field.localized && context.kind === 'component')
        issue(
          [index, 'localized'],
          'Component fields are never localized: localize the blocks field that contains the component',
        )
      if (field.group !== undefined && !context.groups.some((g) => g.id === field.group))
        issue([index, 'group'], `Unknown group "${field.group}"`)

      const ref = TYPE_REFERENCES[field.type]
      const targets = ref === undefined ? undefined : settings[ref.key]
      if (ref !== undefined && Array.isArray(targets)) {
        for (const [i, id] of targets.entries()) {
          const target = typesById.get(String(id))
          const self = id === context.selfId && context.kind === ref.kind
          if (!self && (target === undefined || target.kind !== ref.kind))
            issue(
              [index, 'settings', ref.key, i],
              `Not a ${ref.kind === 'component' ? 'component' : 'content type'} of this environment`,
            )
        }
      }

      let showWhen: FieldDefinition['showWhen']
      if (field.showWhen !== undefined) {
        const sibling =
          byApiId.get(field.showWhen.field) ?? withIds.find((f) => f.id === field.showWhen?.field)
        if (sibling === undefined || sibling.id === field.id)
          issue([index, 'showWhen', 'field'], 'Must name another field of this type')
        else if (sibling.localized)
          issue([index, 'showWhen', 'field'], 'The condition field must not be localized')
        else showWhen = { field: sibling.id, equals: field.showWhen.equals }
      }

      return {
        id: field.id,
        apiId: field.apiId,
        name: field.name,
        type: field.type,
        required: field.required,
        localized: field.localized,
        disabled: field.disabled,
        settings,
        ...(field.description === undefined || field.description === ''
          ? {}
          : { description: field.description }),
        ...(field.group === undefined ? {} : { group: field.group }),
        ...(field.hidden === undefined ? {} : { hidden: field.hidden }),
        ...(showWhen === undefined ? {} : { showWhen }),
      }
    })
    if (issues.length > 0) throw new ValidationError('Invalid fields', issues)
    return fields
  }

  function displayFieldId(
    fields: readonly FieldDefinition[],
    apiId: string | null | undefined,
  ): string | null {
    if (apiId === null || apiId === undefined) return null
    const field = fields.find((f) => f.apiId === apiId)
    if (field === undefined || !['text', 'longText'].includes(field.type))
      throw new ValidationError('Invalid display field', [
        { path: ['displayField'], message: 'Must name a text field of this type' },
      ])
    return field.id
  }

  /** Other types pointing at `id` through their settings, by name. */
  const usedBy = (environment: readonly ContentType[], id: string) =>
    environment.filter((t) => t.id !== id && referencedTypeIds(t).has(id)).map((t) => t.apiId)

  return {
    async list(actor, tenant, filter = {}) {
      await requireRead(actor, tenant)
      return (await contentTypeRepository.list(db, tenant, filter.kind)).map(toView)
    },

    async get(actor, tenant, id) {
      await requireRead(actor, tenant, id)
      return toView(await load(tenant, id))
    },

    async listStored(actor, tenant) {
      await requireRead(actor, tenant)
      return contentTypeRepository.list(db, tenant)
    },

    async create(actor, tenant, input) {
      await requireWrite(actor, tenant)
      const values = await validate(createContentTypeSchema, input, {
        message: 'Invalid content type',
      })
      if ((await contentTypeRepository.count(db, tenant)) >= CONTENT_LIMITS.typesPerEnvironment)
        throw new ConflictError(
          `An environment holds at most ${CONTENT_LIMITS.typesPerEnvironment} content types`,
        )
      const environment = await contentTypeRepository.list(db, tenant)
      const fields = buildFields(values.fields, {
        kind: values.kind,
        selfId: undefined,
        groups: values.groups,
        existing: [],
        environment,
      })
      const created = await contentTypeRepository
        .insert(db, tenant, {
          kind: values.kind,
          apiId: values.apiId,
          name: values.name,
          description: values.description,
          displayFieldId: displayFieldId(fields, values.displayField),
          groups: values.groups,
          fields,
        })
        .catch(apiIdTaken)
      await emit(contentTypeCreated, created)
      return toView(created)
    },

    async update(actor, tenant, id, input) {
      await requireWrite(actor, tenant, id)
      const values = await validate(updateContentTypeSchema, input, {
        message: 'Invalid content type',
      })
      const current = await load(tenant, id)
      if (values.version !== current.version) throw stale(current.version)
      const kind = values.kind ?? current.kind
      const groups = values.groups ?? current.groups
      const environment = await contentTypeRepository.list(db, tenant)
      const fields =
        values.fields === undefined
          ? current.fields
          : buildFields(values.fields, {
              kind,
              selfId: current.id,
              groups,
              existing: current.fields,
              environment,
            })

      const entries = await entryUsage(tenant, current.id)
      const problems: string[] = []
      if (kind !== current.kind) {
        const users = usedBy(environment, current.id)
        if (entries > 0 || users.length > 0)
          problems.push(
            `kind cannot change while entries exist or other types use it${users.length > 0 ? ` (${users.join(', ')})` : ''}`,
          )
      }
      if (entries > 0) {
        const next = new Map(fields.map((f) => [f.id, f]))
        for (const before of current.fields) {
          const after = next.get(before.id)
          if (after === undefined && !before.disabled)
            problems.push(
              `field "${before.apiId}" has values in entries: set disabled: true first, then remove it`,
            )
          if (after !== undefined && after.type !== before.type)
            problems.push(`field "${before.apiId}" cannot change type while entries exist`)
          if (after !== undefined && after.localized !== before.localized)
            problems.push(`field "${before.apiId}" cannot change localized while entries exist`)
        }
      }
      if (problems.length > 0)
        throw new ConflictError(`Unsafe content type change: ${problems.join('; ')}`)

      const displayApiId =
        values.displayField === undefined
          ? (current.fields.find((f) => f.id === current.displayFieldId)?.apiId ?? null)
          : values.displayField
      const updated = await contentTypeRepository
        .update(db, tenant, id, current.version, {
          kind,
          apiId: values.apiId ?? current.apiId,
          name: values.name ?? current.name,
          description: values.description ?? current.description,
          displayFieldId: fields.some((f) => f.apiId === displayApiId)
            ? displayFieldId(fields, displayApiId)
            : null,
          groups,
          fields,
        })
        .catch(apiIdTaken)
      if (updated === undefined) throw stale(current.version)
      await emit(contentTypeUpdated, updated)
      return toView(updated)
    },

    async delete(actor, tenant, id) {
      await requireWrite(actor, tenant, id)
      const current = await load(tenant, id)
      const environment = await contentTypeRepository.list(db, tenant)
      const users = usedBy(environment, current.id)
      if (users.length > 0)
        throw new ConflictError(
          `Used by ${users.join(', ')}: remove it from their field settings first`,
        )
      if ((await entryUsage(tenant, current.id)) > 0)
        throw new ConflictError('The content type has entries: delete them first')
      await contentTypeRepository.delete(db, tenant, id)
      await emit(contentTypeDeleted, current)
    },
  }
}

const stale = (version: number) =>
  new ConflictError(
    `The content type changed since you loaded it (now version ${version}): reload and retry`,
  )

function apiIdTaken(error: unknown): never {
  if (error instanceof ConflictError)
    throw new ConflictError('Another content type or component in this environment uses this apiId')
  throw error
}
