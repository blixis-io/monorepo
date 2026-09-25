import type { ValidationIssue } from '@blixis/contracts'
import { z } from 'zod'
import type { ContentType, FieldDefinition } from '../domain/content-type.ts'
import {
  type FieldTypeRegistry,
  type FieldValueContext,
  isEmptyValue,
  type ResolvedComponent,
  type ValidationMode,
} from '../field-types/define.ts'

/** Entry field values as clients send and receive them, keyed by field `apiId` (ADR 0010 §3). */
export type ApiFields = Record<string, unknown>
/** Entry field values as stored in versions, keyed by stable field id. */
export type StoredFields = Record<string, unknown>

/** What a compiled schema is checked against. */
export interface EntrySchemaOptions {
  readonly contentType: ContentType
  /** Every content type and component of the environment (components resolve from here). */
  readonly types: readonly ContentType[]
  /** Locale codes of the space; the default locale first is not required. */
  readonly locales: readonly string[]
  readonly defaultLocale: string
  readonly mode: ValidationMode
  readonly registry: FieldTypeRegistry
}

/** The validator and mappers derived from one content type (plan 010.004). */
export interface EntrySchema {
  /**
   * Validates entry fields in API shape. Issues use paths such as
   * `fields.title.en-US` or `fields.body.en-US.0.heading`.
   */
  validate(
    fields: unknown,
  ): { ok: true; fields: ApiFields } | { ok: false; issues: ValidationIssue[] }
  /** API shape (apiIds) → storage shape (stable ids), recursively through blocks. */
  toStorage(fields: ApiFields): StoredFields
  /** Storage shape → API shape; disabled and unknown fields are dropped. */
  fromStorage(fields: StoredFields): ApiFields
}

type Issue = { path: (string | number)[]; message: string }

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const active = (fields: readonly FieldDefinition[]) => fields.filter((f) => !f.disabled)

/** Compiles the validator for entries of `options.contentType`. Pure: safe to cache. */
export function compileEntrySchema(options: EntrySchemaOptions): EntrySchema {
  const { registry, mode } = options
  const components = new Map(
    options.types.filter((t) => t.kind === 'component').map((t) => [t.apiId, t]),
  )
  const componentsById = new Map([...components.values()].map((t) => [t.id, t]))
  const componentCache = new Map<string, ResolvedComponent>()

  /** A field's validator for one value, with components resolved one level deeper. */
  function valueSchema(field: FieldDefinition, depth: number): z.ZodType {
    const type = registry.require(field.type)
    const context: FieldValueContext = {
      mode,
      depth,
      component: (apiId) => resolveComponent(apiId, depth + 1),
    }
    return type.value(type.settings.parse(field.settings), context)
  }

  function isEmpty(field: FieldDefinition, value: unknown): boolean {
    const type = registry.require(field.type)
    return type.isEmpty === undefined
      ? isEmptyValue(value)
      : type.isEmpty(value, type.settings.parse(field.settings))
  }

  function resolveComponent(apiId: string, depth: number): ResolvedComponent | undefined {
    const type = components.get(apiId)
    if (type === undefined) return undefined
    const key = `${type.id}@${depth}`
    let resolved = componentCache.get(key)
    if (resolved === undefined) {
      // Lazy: a component may (indirectly) contain itself; the depth limit ends the recursion.
      const fields = active(type.fields)
      let checker: ((value: unknown) => Issue[]) | undefined
      resolved = {
        id: type.id,
        apiId: type.apiId,
        schema: z.unknown().superRefine((value, ctx) => {
          checker ??= objectChecker(fields, false, depth)
          for (const issue of checker(value)) ctx.addIssue({ code: 'custom', ...issue })
        }),
      }
      componentCache.set(key, resolved)
    }
    return resolved
  }

  /**
   * Checks an object of fields keyed by `apiId`: unknown keys, localized maps (entries only),
   * per-value validation, and `required` (publish mode, honouring `showWhen`).
   */
  function objectChecker(
    fields: readonly FieldDefinition[],
    allowLocalized: boolean,
    depth: number,
  ): (value: unknown) => Issue[] {
    const schemas = new Map(fields.map((f) => [f.id, valueSchema(f, depth)]))
    const byApiId = new Map(fields.map((f) => [f.apiId, f]))
    const byId = new Map(fields.map((f) => [f.id, f]))
    const locales = new Set(options.locales)

    return (value) => {
      if (!isObject(value)) return [{ path: [], message: 'Expected an object of fields' }]
      const issues: Issue[] = []
      for (const key of Object.keys(value)) {
        if (!byApiId.has(key)) issues.push({ path: [key], message: 'Unknown field' })
      }
      const visible = (field: FieldDefinition) => {
        if (field.showWhen === undefined) return true
        const condition = byId.get(field.showWhen.field)
        if (condition === undefined) return true
        return JSON.stringify(value[condition.apiId]) === JSON.stringify(field.showWhen.equals)
      }
      for (const field of fields) {
        const schema = schemas.get(field.id) as z.ZodType
        const raw = value[field.apiId]
        const check = (item: unknown, path: (string | number)[]) => {
          const result = schema.safeParse(item)
          if (!result.success)
            for (const issue of result.error.issues)
              issues.push({
                path: [...path, ...(issue.path as (string | number)[])],
                message: issue.message,
              })
        }
        const required = mode === 'publish' && field.required && visible(field)
        if (field.localized && allowLocalized) {
          if (raw === undefined) {
            if (required)
              issues.push({ path: [field.apiId, options.defaultLocale], message: 'Required' })
            continue
          }
          if (!isObject(raw)) {
            issues.push({
              path: [field.apiId],
              message: 'Expected values per locale, e.g. { "en-US": … }',
            })
            continue
          }
          for (const [locale, item] of Object.entries(raw)) {
            if (!locales.has(locale))
              issues.push({ path: [field.apiId, locale], message: 'Unknown locale' })
            else if (item !== undefined) check(item, [field.apiId, locale])
          }
          if (required && isEmpty(field, raw[options.defaultLocale]))
            issues.push({ path: [field.apiId, options.defaultLocale], message: 'Required' })
        } else {
          if (raw !== undefined) check(raw, [field.apiId])
          if (required && isEmpty(field, raw))
            issues.push({ path: [field.apiId], message: 'Required' })
        }
      }
      return issues
    }
  }

  const entryChecker = objectChecker(active(options.contentType.fields), true, 0)

  /** Maps keys (and nested block types) between apiIds and stable ids. */
  function mapFields(
    type: ContentType,
    input: Record<string, unknown>,
    direction: 'toStorage' | 'fromStorage',
  ): Record<string, unknown> {
    const output: Record<string, unknown> = {}
    for (const field of active(type.fields)) {
      const from = direction === 'toStorage' ? field.apiId : field.id
      const to = direction === 'toStorage' ? field.id : field.apiId
      if (!(from in input)) continue
      const value = input[from]
      output[to] =
        field.type !== 'blocks'
          ? value
          : field.localized && isObject(value)
            ? Object.fromEntries(
                Object.entries(value).map(([l, v]) => [l, mapBlocks(v, direction)]),
              )
            : mapBlocks(value, direction)
    }
    return output
  }

  function mapBlocks(value: unknown, direction: 'toStorage' | 'fromStorage'): unknown {
    if (!Array.isArray(value)) return value
    return value.flatMap((item) => {
      if (!isObject(item)) return []
      const { _id, _type, ...fields } = item
      const component =
        direction === 'toStorage'
          ? components.get(String(_type))
          : componentsById.get(String(_type))
      if (component === undefined) return []
      return [
        {
          _id,
          _type: direction === 'toStorage' ? component.id : component.apiId,
          ...mapFields(component, fields, direction),
        },
      ]
    })
  }

  return {
    validate(fields) {
      const issues = entryChecker(fields)
      if (issues.length > 0)
        return {
          ok: false,
          issues: issues.map((i) => ({ path: ['fields', ...i.path], message: i.message })),
        }
      return { ok: true, fields: fields as ApiFields }
    },
    toStorage: (fields) => mapFields(options.contentType, fields, 'toStorage'),
    fromStorage: (fields) => mapFields(options.contentType, fields, 'fromStorage'),
  }
}

/**
 * Isolate-level LRU of compiled schemas (plan 010.004): pure data, safe in app scope. The key
 * covers everything the schema depends on — the type's and components' versions, the locales,
 * and the mode — so a changed model never hits a stale entry.
 */
export interface EntrySchemaCache {
  get(options: EntrySchemaOptions): EntrySchema
  readonly size: number
}

export function createEntrySchemaCache(capacity = 200): EntrySchemaCache {
  const entries = new Map<string, EntrySchema>()
  const keyOf = (o: EntrySchemaOptions) =>
    [
      o.contentType.id,
      o.contentType.version,
      o.mode,
      o.defaultLocale,
      o.locales.join(','),
      o.types
        .filter((t) => t.kind === 'component')
        .map((t) => `${t.id}:${t.version}`)
        .sort()
        .join(','),
    ].join('|')
  return {
    get(options) {
      const key = keyOf(options)
      const hit = entries.get(key)
      if (hit !== undefined) {
        entries.delete(key)
        entries.set(key, hit)
        return hit
      }
      const compiled = compileEntrySchema(options)
      entries.set(key, compiled)
      if (entries.size > capacity) entries.delete(entries.keys().next().value as string)
      return compiled
    },
    get size() {
      return entries.size
    },
  }
}
