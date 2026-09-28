import type { ContentType, Entry, Field } from '@blixis/sdk'

/** Entry fields in API shape: values by apiId; localized fields map locale codes to values. */
export type Fields = Readonly<Record<string, unknown>>

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A field's value in a locale (non-localized fields have one value for all locales). */
export function getValue(
  fields: Fields,
  field: Pick<Field, 'apiId' | 'localized'>,
  locale: string,
): unknown {
  const raw = fields[field.apiId]
  if (!field.localized) return raw
  return isObject(raw) ? raw[locale] : undefined
}

/** Sets (or, with `undefined`, clears) a field's value in a locale. */
export function setValue(
  fields: Fields,
  field: Pick<Field, 'apiId' | 'localized'>,
  locale: string,
  value: unknown,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...fields }
  if (!field.localized) {
    if (value === undefined) delete next[field.apiId]
    else next[field.apiId] = value
    return next
  }
  const perLocale: Record<string, unknown> = {
    ...(isObject(fields[field.apiId]) ? (fields[field.apiId] as object) : {}),
  }
  if (value === undefined) delete perLocale[locale]
  else perLocale[locale] = value
  if (Object.keys(perLocale).length === 0) delete next[field.apiId]
  else next[field.apiId] = perLocale
  return next
}

/** Whether a field is shown: its `showWhen` condition holds (as the server decides "required"). */
export function isVisible(field: Field, fields: Fields): boolean {
  if (field.showWhen === undefined) return true
  return JSON.stringify(fields[field.showWhen.field]) === JSON.stringify(field.showWhen.equals)
}

/** An entry's title: its display field in the given locale (or the default locale), if any. */
export function entryTitle(
  entry: Pick<Entry, 'fields'>,
  type: Pick<ContentType, 'displayField' | 'fields'> | undefined,
  locale: string,
  defaultLocale: string,
): string {
  const field = type?.fields.find((f) => f.apiId === type.displayField)
  if (field === undefined) return 'Untitled'
  const value =
    getValue(entry.fields, field, locale) ?? getValue(entry.fields, field, defaultLocale)
  return typeof value === 'string' && value.trim() !== '' ? value : 'Untitled'
}

/** Where a validation issue belongs: `title`, or `title.nl-NL` for a localized field. */
export const issueKey = (apiId: string, locale?: string) =>
  locale === undefined ? apiId : `${apiId}.${locale}`

/**
 * Groups server issues (`fields.title.nl-NL`, `fields.body.en-US.0.heading`) by field and locale;
 * the rest of the path stays in the message. Issues on no known field are `general`.
 */
export function groupIssues(
  type: Pick<ContentType, 'fields'>,
  issues: readonly { path: readonly (string | number)[]; message: string }[],
): { general: string[]; byKey: Map<string, string[]> } {
  const general: string[] = []
  const byKey = new Map<string, string[]>()
  for (const issue of issues) {
    const [head, apiId, ...rest] = issue.path
    const field = head === 'fields' ? type.fields.find((f) => f.apiId === apiId) : undefined
    if (field === undefined) {
      general.push(
        issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
      )
      continue
    }
    const locale =
      field.localized && typeof rest[0] === 'string' ? (rest.shift() as string) : undefined
    const key = issueKey(field.apiId, locale)
    const list = byKey.get(key) ?? []
    list.push(rest.length > 0 ? `${rest.join('.')}: ${issue.message}` : issue.message)
    byKey.set(key, list)
  }
  return { general, byKey }
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** A new 8-character block id, like the server's (unique within its list). */
export function newBlockId(): string {
  let id = ''
  while (id.length < 8)
    for (const byte of crypto.getRandomValues(new Uint8Array(16)))
      if (byte < 248 && id.length < 8) id += ID_ALPHABET[byte % 62]
  return id
}

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO 8601 with offset → the value of an `<input type="datetime-local">` in local time. */
export function toLocalInput(iso: unknown): string {
  if (typeof iso !== 'string') return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** An `<input type="datetime-local">` value → ISO 8601 with the local offset (`+02:00`). */
export function fromLocalInput(local: string): string | undefined {
  if (local === '') return undefined
  const date = new Date(local)
  if (Number.isNaN(date.getTime())) return undefined
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return `${local.length === 16 ? `${local}:00` : local}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}
