import { z } from 'zod'
import { CONTENT_LIMITS } from '../../domain/content-type.ts'
import { defineFieldType } from '../define.ts'
import { cardinality, cardinalitySettings, minMaxOrdered } from './shared.ts'

/** Rejects regular expressions that are invalid, long, or have nested quantifiers (ReDoS). */
function safePattern(source: string): boolean {
  if (source.length > 200 || /\([^)]*[+*][^)]*\)[+*{]/.test(source)) return false
  try {
    new RegExp(source)
    return true
  } catch {
    return false
  }
}

const TEXT_FORMATS = ['plain', 'slug', 'email', 'url'] as const
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Single-line text, e.g. titles, slugs, labels. */
export const textField = defineFieldType({
  id: 'text',
  name: 'Text',
  description: 'Single line of text (up to 256 characters): titles, labels, slugs, emails, URLs.',
  settings: z
    .object({
      minLength: z.number().int().min(0).optional(),
      maxLength: z.number().int().min(1).max(256).default(256),
      /** A JavaScript regular expression the value must match (no nested quantifiers). */
      pattern: z.string().refine(safePattern, 'Invalid or unsafe regular expression').optional(),
      patternMessage: z.string().max(200).optional(),
      format: z.enum(TEXT_FORMATS).default('plain'),
    })
    .strict()
    .refine((s) => s.minLength === undefined || s.minLength <= s.maxLength, {
      message: 'minLength must not exceed maxLength',
    }),
  value(settings) {
    let value: z.ZodType<string> =
      settings.format === 'email'
        ? z.email()
        : settings.format === 'url'
          ? z.url({ protocol: /^https?$/ })
          : settings.format === 'slug'
            ? z.string().regex(SLUG, 'Use lowercase letters, digits, and single hyphens')
            : z.string()
    value = value.refine((v) => v.length <= settings.maxLength, {
      message: `At most ${settings.maxLength} characters`,
    })
    if (settings.minLength !== undefined) {
      const min = settings.minLength
      value = value.refine((v) => v.length >= min, { message: `At least ${min} characters` })
    }
    if (settings.pattern !== undefined) {
      const pattern = new RegExp(settings.pattern)
      value = value.refine((v) => pattern.test(v), {
        message: settings.patternMessage ?? `Must match ${settings.pattern}`,
      })
    }
    return value
  },
  graphql: () => ({ type: 'String', list: false }),
})

/** Multi-line plain text. */
export const longTextField = defineFieldType({
  id: 'longText',
  name: 'Long text',
  description: 'Multiple lines of plain text (up to 50,000 characters): descriptions, excerpts.',
  settings: z
    .object({
      minLength: z.number().int().min(0).optional(),
      maxLength: z.number().int().min(1).max(50_000).default(50_000),
    })
    .strict(),
  value: (settings) => {
    const value = z.string().max(settings.maxLength)
    return settings.minLength === undefined ? value : value.min(settings.minLength)
  },
  graphql: () => ({ type: 'String', list: false }),
})

/** Integer or decimal number. */
export const numberField = defineFieldType({
  id: 'number',
  name: 'Number',
  description: 'An integer or decimal number, optionally within a range.',
  settings: z
    .object({
      integer: z.boolean().default(false),
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .strict()
    .refine(minMaxOrdered, { message: 'min must not exceed max' }),
  value: (settings) => {
    let value = settings.integer ? z.number().int() : z.number()
    if (settings.min !== undefined) value = value.min(settings.min)
    if (settings.max !== undefined) value = value.max(settings.max)
    return value
  },
  graphql: (settings) => ({ type: settings.integer ? 'Int' : 'Float', list: false }),
})

/** True or false. */
export const booleanField = defineFieldType({
  id: 'boolean',
  name: 'Boolean',
  description: 'A yes/no switch.',
  settings: z.object({}).strict(),
  value: () => z.boolean(),
  graphql: () => ({ type: 'Boolean', list: false }),
})

const isoDate = z.iso.date()

/** A calendar date without time. */
export const dateField = defineFieldType({
  id: 'date',
  name: 'Date',
  description: 'A calendar date (YYYY-MM-DD) without time or time zone.',
  settings: z
    .object({ min: isoDate.optional(), max: isoDate.optional() })
    .strict()
    .refine((s) => s.min === undefined || s.max === undefined || s.min <= s.max, {
      message: 'min must not be after max',
    }),
  value: (settings) =>
    isoDate
      .refine((v) => settings.min === undefined || v >= settings.min, {
        message: `On or after ${settings.min}`,
      })
      .refine((v) => settings.max === undefined || v <= settings.max, {
        message: `On or before ${settings.max}`,
      }),
  graphql: () => ({ type: 'Date', list: false }),
})

/** A moment in time with its offset. */
export const dateTimeField = defineFieldType({
  id: 'dateTime',
  name: 'Date and time',
  description: 'A moment in time, ISO 8601 with a UTC offset (2026-09-25T14:30:00+02:00).',
  settings: z.object({}).strict(),
  value: () => z.iso.datetime({ offset: true }),
  graphql: () => ({ type: 'DateTime', list: false }),
})

const optionSchema = z.object({
  value: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
})

/** One or more values from a fixed list. */
export const selectField = defineFieldType({
  id: 'select',
  name: 'Select',
  description: 'One value (or several, with `multiple`) from a fixed list of options.',
  settings: z
    .object({
      options: z
        .array(optionSchema)
        .min(1)
        .max(500)
        .refine((o) => new Set(o.map((x) => x.value)).size === o.length, {
          message: 'Option values must be unique',
        }),
      ...cardinalitySettings,
    })
    .strict()
    .refine(minMaxOrdered, { message: 'min must not exceed max' }),
  value: (settings, context) => {
    const values = settings.options.map((o) => o.value) as [string, ...string[]]
    const item = z.enum(values)
    const list = cardinality(item, settings, context)
    return settings.multiple
      ? list.refine((v) => new Set(v as string[]).size === (v as string[]).length, {
          message: 'Values must be unique',
        })
      : list
  },
  graphql: (settings) => ({ type: 'String', list: settings.multiple }),
})

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }
const json: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(json),
    z.record(z.string(), json),
  ]),
)

/** Arbitrary JSON (no further validation). */
export const jsonField = defineFieldType({
  id: 'json',
  name: 'JSON',
  description: 'Any JSON value up to 64 KiB, for structured data without a fixed shape.',
  settings: z.object({}).strict(),
  value: () =>
    json.refine(
      (v) => new TextEncoder().encode(JSON.stringify(v)).length <= CONTENT_LIMITS.jsonBytes,
      {
        message: 'At most 64 KiB of JSON',
      },
    ),
  isEmpty: (value) => value === undefined || value === null,
  graphql: () => ({ type: 'JSON', list: false }),
})
