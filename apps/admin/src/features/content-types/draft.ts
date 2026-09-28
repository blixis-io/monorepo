import type { ContentType, Field, Operations } from '@blixis/sdk'

/**
 * The content type editor's working copy. Fields keep a local `key` (their server `id`, or a
 * temporary one until the first save) so React and reordering stay stable; the server stays the
 * judge of what is valid (019.003: UX hints only).
 */
export interface FieldDraft {
  readonly key: string
  readonly id?: string | undefined
  readonly apiId: string
  readonly name: string
  readonly type: string
  readonly required: boolean
  readonly localized: boolean
  readonly disabled: boolean
  readonly hidden: boolean
  readonly description: string
  readonly group: string
  readonly settings: Readonly<Record<string, unknown>>
  readonly showWhen?: { readonly field: string; readonly equals: unknown } | undefined
}

export interface ContentTypeDraft {
  readonly name: string
  readonly apiId: string
  readonly description: string
  readonly kind: ContentType['kind']
  readonly displayField: string | null
  readonly groups: readonly { readonly id: string; readonly name: string }[]
  readonly fields: readonly FieldDraft[]
}

export const RESERVED_FIELD_API_IDS = ['id', 'sys', 'type']
/** Types that can be the display field (the server checks it too). */
export const DISPLAY_FIELD_TYPES = ['text', 'longText']

let counter = 0
const tempKey = () => `new-${++counter}`

export function fieldFromApi(field: Field): FieldDraft {
  return {
    key: field.id,
    id: field.id,
    apiId: field.apiId,
    name: field.name,
    type: field.type,
    required: field.required,
    localized: field.localized,
    disabled: field.disabled,
    hidden: field.hidden ?? false,
    description: field.description ?? '',
    group: field.group ?? '',
    settings: field.settings,
    showWhen: field.showWhen,
  }
}

export function draftFromApi(type: ContentType): ContentTypeDraft {
  return {
    name: type.name,
    apiId: type.apiId,
    description: type.description,
    kind: type.kind,
    displayField: type.displayField,
    groups: type.groups,
    fields: type.fields.map(fieldFromApi),
  }
}

type UpdateBody = Operations['updateContentType']['body']

/** The complete update: every field in order, new ones without `id`. */
export function toUpdateBody(draft: ContentTypeDraft, version: number): UpdateBody {
  return {
    version,
    kind: draft.kind,
    apiId: draft.apiId,
    name: draft.name.trim(),
    description: draft.description.trim(),
    displayField: draft.displayField,
    groups: draft.groups.map((g) => ({ id: g.id, name: g.name.trim() })),
    fields: draft.fields.map((f) => ({
      ...(f.id === undefined ? {} : { id: f.id }),
      apiId: f.apiId,
      name: f.name.trim(),
      type: f.type,
      required: f.required,
      localized: f.localized,
      disabled: f.disabled,
      settings: withoutUndefined(f.settings),
      ...(f.description.trim() === '' ? {} : { description: f.description.trim() }),
      ...(f.group === '' ? {} : { group: f.group }),
      ...(f.hidden ? { hidden: true } : {}),
      ...(f.showWhen === undefined ? {} : { showWhen: f.showWhen }),
    })),
  }
}

const withoutUndefined = (settings: Readonly<Record<string, unknown>>) =>
  Object.fromEntries(Object.entries(settings).filter(([, v]) => v !== undefined))

/** A camelCase API id from a display name: "Hero image" → "heroImage". */
export function toApiId(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  const id = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0]?.toUpperCase() + w.slice(1).toLowerCase()))
    .join('')
    .replace(/^[0-9]+/, '')
  return id.slice(0, 64)
}

/** An API id that no other field uses (and isn't reserved): `title`, `title2`, … */
export function uniqueApiId(base: string, taken: Iterable<string>): string {
  const used = new Set([...taken, ...RESERVED_FIELD_API_IDS])
  const root = base === '' ? 'field' : base
  if (!used.has(root)) return root
  for (let n = 2; ; n++) if (!used.has(`${root}${n}`)) return `${root}${n}`
}

/** A new field of a type, named after it. */
export function newField(
  type: { id: string; name: string },
  existing: readonly FieldDraft[],
): FieldDraft {
  const name = type.name
  return {
    key: tempKey(),
    apiId: uniqueApiId(
      toApiId(name),
      existing.map((f) => f.apiId),
    ),
    name,
    type: type.id,
    required: false,
    localized: false,
    disabled: false,
    hidden: false,
    description: '',
    group: '',
    settings: {},
  }
}

export function moveField(fields: readonly FieldDraft[], key: string, by: -1 | 1): FieldDraft[] {
  const index = fields.findIndex((f) => f.key === key)
  const target = index + by
  if (index < 0 || target < 0 || target >= fields.length) return [...fields]
  const next = [...fields]
  const [moved] = next.splice(index, 1)
  if (moved !== undefined) next.splice(target, 0, moved)
  return next
}

/**
 * Removes a field and what points at it: the display field and other fields' `showWhen`. The
 * server refuses removing fields with values in entries (disable them first); it says so.
 */
export function removeField(draft: ContentTypeDraft, key: string): ContentTypeDraft {
  const removed = draft.fields.find((f) => f.key === key)
  if (removed === undefined) return draft
  return {
    ...draft,
    displayField: draft.displayField === removed.apiId ? null : draft.displayField,
    fields: draft.fields
      .filter((f) => f.key !== key)
      .map((f) => (f.showWhen?.field === removed.apiId ? { ...f, showWhen: undefined } : f)),
  }
}

/** Keeps references in step when a field's apiId changes. */
export function renameApiId(draft: ContentTypeDraft, key: string, apiId: string): ContentTypeDraft {
  const before = draft.fields.find((f) => f.key === key)?.apiId
  return {
    ...draft,
    displayField: draft.displayField === before ? apiId : draft.displayField,
    fields: draft.fields.map((f) => {
      if (f.key === key) return { ...f, apiId }
      if (before !== undefined && f.showWhen?.field === before)
        return { ...f, showWhen: { ...f.showWhen, field: apiId } }
      return f
    }),
  }
}

/** Server validation issues (`fields.3.settings.maxLength`) grouped per field key. */
export function issuesByField(
  draft: ContentTypeDraft,
  issues: readonly { path: readonly (string | number)[]; message: string }[],
): { general: string[]; byField: Map<string, string[]> } {
  const general: string[] = []
  const byField = new Map<string, string[]>()
  for (const issue of issues) {
    const [head, index, ...rest] = issue.path
    const field = head === 'fields' && typeof index === 'number' ? draft.fields[index] : undefined
    if (field === undefined) {
      general.push(
        issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
      )
      continue
    }
    const list = byField.get(field.key) ?? []
    list.push(rest.length > 0 ? `${rest.join('.')}: ${issue.message}` : issue.message)
    byField.set(field.key, list)
  }
  return { general, byField }
}
