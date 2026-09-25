import { createServiceToken, ModuleError, type ServiceToken } from '@blixis/contracts'
import { z } from 'zod'

/** How strictly entry values are checked (plan 011): drafts may be incomplete. */
export type ValidationMode = 'draft' | 'publish'

/** A component a `blocks` field may contain, resolved by the entry schema compiler. */
export interface ResolvedComponent {
  readonly id: string
  readonly apiId: string
  /** Validates one block instance's fields (without `_id`/`_type`). */
  readonly schema: z.ZodType
}

/** What a field type knows while building the validator for one value. */
export interface FieldValueContext {
  readonly mode: ValidationMode
  /** Nesting depth of the value (0 for an entry's own fields, +1 per `blocks` level). */
  readonly depth: number
  /** Resolves a component by `apiId` (used by `blocks`); `undefined` for unknown components. */
  readonly component: (apiId: string) => ResolvedComponent | undefined
}

/** GraphQL output hint for plan 012. */
export interface GraphqlHint {
  /** A built-in scalar (`String`, `Int`, `Float`, `Boolean`), `JSON`, or a Blixis type name. */
  readonly type: string
  readonly list: boolean
}

/**
 * A field type: its settings, the validator for one value, and hints for delivery. Built-in types
 * have plain ids (`text`); types contributed by modules use `vendor.name` (`acme.color`).
 *
 * @example
 * export const colorField = defineFieldType({
 *   id: 'acme.color',
 *   name: 'Color',
 *   description: 'A hex color such as #ff6600',
 *   settings: z.object({ allowAlpha: z.boolean().default(false) }).strict(),
 *   value: (settings) =>
 *     z.string().regex(settings.allowAlpha ? /^#[0-9a-f]{8}$/i : /^#[0-9a-f]{6}$/i),
 *   graphql: () => ({ type: 'String', list: false }),
 * })
 */
export interface FieldTypeDefinition<Settings = unknown> {
  readonly id: string
  readonly name: string
  readonly description: string
  /** Validates a field's `settings` and fills in defaults. Use a strict object schema. */
  readonly settings: z.ZodType<Settings>
  /** The validator for one value (one locale of a localized field). */
  value(settings: Settings, context: FieldValueContext): z.ZodType
  /** Whether a value counts as empty for `required` (default: null, undefined, '', []). */
  isEmpty?(value: unknown, settings: Settings): boolean
  /** Whether fields of this type may be localized. Default `true`. */
  readonly localizable?: boolean
  /** Output type for GraphQL delivery (plan 012). Default `{ type: 'JSON', list: false }`. */
  graphql?(settings: Settings): GraphqlHint
}

/** Declares a field type (checks nothing at runtime; the registry validates ids). */
export function defineFieldType<Settings>(
  definition: FieldTypeDefinition<Settings>,
): FieldTypeDefinition<Settings> {
  return Object.freeze(definition)
}

/** Default emptiness: nothing, an empty string, or an empty list. */
export function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0)
  )
}

/** A field type as listed by the API: settings as JSON Schema for editors. */
export interface FieldTypeInfo {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly localizable: boolean
  readonly builtIn: boolean
  readonly settingsSchema: unknown
}

/** The field types available in this app. App-scoped: `services.get(FIELD_TYPES)`. */
export interface FieldTypeRegistry {
  get(id: string): FieldTypeDefinition | undefined
  /** @throws ModuleError for ids no module registered */
  require(id: string): FieldTypeDefinition
  list(): readonly FieldTypeDefinition[]
  describe(): readonly FieldTypeInfo[]
}

export const FIELD_TYPES: ServiceToken<FieldTypeRegistry> = createServiceToken<FieldTypeRegistry>(
  '@blixis/content.field-types',
)

const BUILT_IN_ID = /^[a-z][a-zA-Z]*$/
const CUSTOM_ID = /^[a-z][a-z0-9-]*\.[a-z][a-zA-Z0-9-]*$/

/**
 * Builds the registry: built-in types plus custom ones. Custom ids must be namespaced
 * (`vendor.name`) so they can never shadow a built-in, and must be unique.
 * @throws ModuleError for invalid or duplicate ids
 */
export function createFieldTypeRegistry(
  builtIn: readonly FieldTypeDefinition<never>[],
  custom: readonly FieldTypeDefinition<never>[],
): FieldTypeRegistry {
  const byId = new Map<string, FieldTypeDefinition>()
  const builtInIds = new Set<string>()
  const add = (type: FieldTypeDefinition<never>, isBuiltIn: boolean) => {
    const pattern = isBuiltIn ? BUILT_IN_ID : CUSTOM_ID
    if (!pattern.test(type.id)) {
      throw new ModuleError(
        '@blixis/content',
        `Invalid field type id "${type.id}"${isBuiltIn ? '' : ': custom field types use "vendor.name", e.g. "acme.color"'}`,
      )
    }
    if (byId.has(type.id))
      throw new ModuleError('@blixis/content', `Field type "${type.id}" is registered twice`)
    byId.set(type.id, type as FieldTypeDefinition)
    if (isBuiltIn) builtInIds.add(type.id)
  }
  for (const type of builtIn) add(type, true)
  for (const type of custom) add(type, false)
  const all = Object.freeze([...byId.values()])

  return {
    get: (id) => byId.get(id),
    require(id) {
      const type = byId.get(id)
      if (type === undefined) throw new ModuleError('@blixis/content', `Unknown field type "${id}"`)
      return type
    },
    list: () => all,
    describe: () =>
      all.map((type) => ({
        id: type.id,
        name: type.name,
        description: type.description,
        localizable: type.localizable !== false,
        builtIn: builtInIds.has(type.id),
        settingsSchema: settingsJsonSchema(type.settings),
      })),
  }
}

function settingsJsonSchema(schema: z.ZodType): unknown {
  const { $schema: _, ...rest } = z.toJSONSchema(schema, {
    io: 'input',
    unrepresentable: 'any',
  }) as Record<string, unknown>
  return rest
}
