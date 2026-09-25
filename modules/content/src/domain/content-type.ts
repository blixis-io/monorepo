import { z } from 'zod'

/**
 * `entry` types have entries with their own lifecycle; `component` types exist only inside a
 * `blocks` field of another entry and are published with it (ADR 0010 §1).
 */
export const CONTENT_TYPE_KINDS = ['entry', 'component'] as const
export type ContentTypeKind = (typeof CONTENT_TYPE_KINDS)[number]

/** Limits from ADR 0010 §8. */
export const CONTENT_LIMITS = Object.freeze({
  fieldsPerType: 100,
  typesPerEnvironment: 500,
  blocksPerField: 100,
  blockDepth: 5,
  richTextDepth: 20,
  jsonBytes: 64 * 1024,
})

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

/** A content type or component of one environment (§21). */
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

const API_ID = /^[a-z][a-zA-Z0-9]{0,63}$/
/** Field `apiId`s that clash with system properties of entries (ADR 0010 §2). */
export const RESERVED_FIELD_API_IDS: readonly string[] = ['id', 'sys', 'type']

export const apiIdSchema = z
  .string()
  .regex(API_ID, 'Use camelCase: a lowercase letter, then letters and digits (max 64)')

export const fieldApiIdSchema = apiIdSchema.refine(
  (value) => !RESERVED_FIELD_API_IDS.includes(value),
  { message: `Reserved: ${RESERVED_FIELD_API_IDS.join(', ')}` },
)

const FIELD_ID = /^[a-zA-Z0-9]{8}$/
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** A new 8-character field or block id (`[a-zA-Z0-9]`, ~47 bits; unique within its parent). */
export function newShortId(): string {
  let id = ''
  while (id.length < 8) {
    // 62 × 4 = 248: bytes ≥ 248 are skipped so every character is equally likely.
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < 248 && id.length < 8) id += ID_ALPHABET[byte % 62]
    }
  }
  return id
}

export const shortIdSchema = z.string().regex(FIELD_ID, 'Expected an 8-character id')

const text = (max: number) => z.string().trim().max(max)

/** A field as clients send it: `id` omitted for new fields. Settings are checked per type. */
export const fieldInputSchema = z.object({
  id: shortIdSchema.optional(),
  apiId: fieldApiIdSchema,
  name: text(100).min(1),
  type: z.string().min(1).max(64),
  required: z.boolean().default(false),
  localized: z.boolean().default(false),
  disabled: z.boolean().default(false),
  settings: z.record(z.string(), z.unknown()).default({}),
  description: text(500).optional(),
  group: z.string().max(64).optional(),
  hidden: z.boolean().optional(),
  showWhen: z.object({ field: z.string().min(1), equals: z.unknown() }).optional(),
})
export type FieldInput = z.input<typeof fieldInputSchema>

const groupSchema = z.object({ id: z.string().min(1).max(64), name: text(100).min(1) })

export const createContentTypeSchema = z.object({
  kind: z.enum(CONTENT_TYPE_KINDS).default('entry'),
  apiId: apiIdSchema,
  name: text(100).min(1),
  description: text(1000).default(''),
  /** `apiId` of the display field. */
  displayField: z.string().nullable().optional(),
  groups: z.array(groupSchema).max(20).default([]),
  fields: z.array(fieldInputSchema).max(CONTENT_LIMITS.fieldsPerType).default([]),
})
export type CreateContentTypeInput = z.input<typeof createContentTypeSchema>

export const updateContentTypeSchema = z.object({
  /** The version the client edited; a stale version is a conflict. */
  version: z.number().int().positive(),
  kind: z.enum(CONTENT_TYPE_KINDS).optional(),
  apiId: apiIdSchema.optional(),
  name: text(100).min(1).optional(),
  description: text(1000).optional(),
  displayField: z.string().nullable().optional(),
  groups: z.array(groupSchema).max(20).optional(),
  /** When present, the complete new field list in order; fields are matched by `id`. */
  fields: z.array(fieldInputSchema).max(CONTENT_LIMITS.fieldsPerType).optional(),
})
export type UpdateContentTypeInput = z.input<typeof updateContentTypeSchema>
