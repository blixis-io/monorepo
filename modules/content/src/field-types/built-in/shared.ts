import { z } from 'zod'
import type { FieldValueContext } from '../define.ts'

/** `multiple`/`min`/`max` settings shared by list-capable types. */
export const cardinalitySettings = {
  multiple: z.boolean().default(false),
  /** Minimum items when `multiple` (checked on publish). */
  min: z.number().int().min(0).optional(),
  /** Maximum items when `multiple`. */
  max: z.number().int().min(1).max(100).optional(),
}

/** One value, or a list of them when `multiple` (min checked on publish only). */
export function cardinality(
  item: z.ZodType,
  settings: { multiple: boolean; min?: number | undefined; max?: number | undefined },
  context: FieldValueContext,
): z.ZodType {
  if (!settings.multiple) return item
  let list = z.array(item).max(settings.max ?? 100)
  if (context.mode === 'publish' && settings.min !== undefined) list = list.min(settings.min)
  return list
}

/** Rejects settings where `min` > `max`. */
export const minMaxOrdered = (settings: { min?: number | undefined; max?: number | undefined }) =>
  settings.min === undefined || settings.max === undefined || settings.min <= settings.max

export const uuidSchema = z.uuid()
