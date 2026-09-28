import { type Actor, createServiceToken, type ServiceToken } from '@blixis/contracts'

/** A verified environment tenant: the organization, space, and environment a request acts in. */
export interface EnvironmentTenant {
  readonly organizationId: string
  readonly spaceId: string
  readonly environmentId: string
}

/**
 * `entry` types have entries with their own lifecycle; `component` types exist only inside a
 * `blocks` field of another entry and are published with it (ADR 0010 §1).
 */
export const CONTENT_TYPE_KINDS = ['entry', 'component'] as const
export type ContentTypeKind = (typeof CONTENT_TYPE_KINDS)[number]

/** Show a field only while a sibling (non-localized) field equals a value (ADR 0010 §6). */
export interface ShowWhen {
  /** Stable id of the sibling field. */
  readonly field: string
  readonly equals: unknown
}

/**
 * A field of a content type or component. `id` is stable and keys stored values; `apiId` is what
 * clients see and may be renamed freely (ADR 0010 §2).
 */
export interface FieldDefinition {
  readonly id: string
  readonly apiId: string
  readonly name: string
  /** A field type id, e.g. `text`, `blocks`, or a module's `acme.color`. */
  readonly type: string
  readonly required: boolean
  /** Values per locale. Always `false` in components (they are localized as a whole). */
  readonly localized: boolean
  /** Omitted from APIs and validation, kept in stored versions (schema evolution, §10). */
  readonly disabled: boolean
  /** Type-specific settings, validated by the field type's `settings` schema. */
  readonly settings: Readonly<Record<string, unknown>>
  /** Help text for editors. */
  readonly description?: string
  /** Editor tab: the id of one of the type's `groups`. */
  readonly group?: string
  /** Hidden in editors, still part of the API. */
  readonly hidden?: boolean
  readonly showWhen?: ShowWhen
}

/** An editor tab grouping fields. */
export interface FieldGroup {
  readonly id: string
  readonly name: string
}

/** A content type or component of one environment in storage form (§21): fields by stable id. */
export interface ContentType {
  readonly id: string
  readonly organizationId: string
  readonly spaceId: string
  readonly environmentId: string
  readonly kind: ContentTypeKind
  readonly apiId: string
  readonly name: string
  readonly description: string
  /** Field used as an entry's title in lists. */
  readonly displayFieldId: string | null
  readonly groups: readonly FieldGroup[]
  readonly fields: readonly FieldDefinition[]
  /** Increments on every change; clients send it back for optimistic concurrency. */
  readonly version: number
  readonly createdAt: string
  readonly updatedAt: string
}

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

/** A field as clients send it: `id` omitted for new fields. Settings are checked per type. */
export interface FieldInput {
  id?: string | undefined
  apiId: string
  name: string
  type: string
  required?: boolean | undefined
  localized?: boolean | undefined
  disabled?: boolean | undefined
  settings?: Record<string, unknown> | undefined
  description?: string | undefined
  group?: string | undefined
  hidden?: boolean | undefined
  showWhen?: { field: string; equals: unknown } | undefined
}

/** Input of {@link ContentTypeService.create}. */
export interface CreateContentTypeInput {
  kind?: ContentTypeKind | undefined
  apiId: string
  name: string
  description?: string | undefined
  /** `apiId` of the display field. */
  displayField?: string | null | undefined
  groups?: { id: string; name: string }[] | undefined
  fields?: FieldInput[] | undefined
}

/** Input of {@link ContentTypeService.update}: `fields`, when present, is the complete new list. */
export interface UpdateContentTypeInput {
  /** The version the client edited; a stale version is a conflict. */
  version: number
  kind?: ContentTypeKind | undefined
  apiId?: string | undefined
  name?: string | undefined
  description?: string | undefined
  displayField?: string | null | undefined
  groups?: { id: string; name: string }[] | undefined
  fields?: FieldInput[] | undefined
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

/** Request-scoped {@link ContentTypeService}, provided by the content module. */
export const CONTENT_TYPE_SERVICE: ServiceToken<ContentTypeService> =
  createServiceToken<ContentTypeService>('@blixis/content.content-types')
