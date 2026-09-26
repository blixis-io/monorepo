import type { DeliveryScope } from '../application/delivery.service.ts'
import type { FieldDefinition } from '../domain/content-type.ts'

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * The value of a field for a locale (ADR 0010 §3): non-localized fields have one value;
 * localized ones follow the requested locale's fallback chain, then the default locale.
 */
export function localized(
  field: Pick<FieldDefinition, 'localized'>,
  value: unknown,
  locale: string,
  locales: DeliveryScope['locales'],
): unknown {
  if (!field.localized) return value
  if (!isObject(value)) return undefined
  const seen = new Set<string>()
  let current: string | null | undefined = locale
  while (current !== null && current !== undefined && !seen.has(current)) {
    if (value[current] !== undefined) return value[current]
    seen.add(current)
    current = locales.fallbacks[current]
  }
  return value[locales.defaultCode]
}
