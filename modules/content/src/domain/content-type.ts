import {
  CONTENT_TYPE_KINDS,
  type ContentType,
  type ContentTypeKind,
  type CreateContentTypeInput,
  type FieldDefinition,
  type FieldGroup,
  type FieldInput,
  type ShowWhen,
  type UpdateContentTypeInput,
} from '@blixis-io/content-api'
import type { SameShape } from '@blixis-io/contracts'
import { z } from 'zod'

// The public shapes live in `@blixis/content-api` (ADR 0016); this module implements them.
export {
  CONTENT_TYPE_KINDS,
  type ContentType,
  type ContentTypeKind,
  type CreateContentTypeInput,
  type FieldDefinition,
  type FieldGroup,
  type FieldInput,
  type ShowWhen,
  type UpdateContentTypeInput,
}

/** Limits from ADR 0010 §8. */
export const CONTENT_LIMITS = Object.freeze({
  fieldsPerType: 100,
  typesPerEnvironment: 500,
  blocksPerField: 100,
  blockDepth: 5,
  richTextDepth: 20,
  jsonBytes: 64 * 1024,
})

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

// The Zod schemas accept exactly the public input types.
const inputShapes: [
  SameShape<z.input<typeof fieldInputSchema>, FieldInput>,
  SameShape<z.input<typeof createContentTypeSchema>, CreateContentTypeInput>,
  SameShape<z.input<typeof updateContentTypeSchema>, UpdateContentTypeInput>,
] = [true, true, true]
void inputShapes
