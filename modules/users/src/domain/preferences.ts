import { z } from 'zod'

/**
 * A theme token name: a CSS custom property without the leading `--`, e.g. `primary`,
 * `card-foreground`, `font-sans`, `shadow-blur` (the shadcn/ui and tweakcn variable set).
 */
const tokenNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,39}$/, 'Token names use lower-case letters, digits, and hyphens')

/**
 * A theme token value: a color (`#1e40af`, `oklch(0.6 0.2 260)`, `hsl(0 0% 0% / 0.1)`), a length,
 * a number, or a font list (`"Source Serif 4", serif`). Plain characters only: no `;`, braces,
 * `url(…)`, or at-rules — values are CSS, and a stored theme must never load or run anything.
 */
const tokenValueSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[\w\s#%.,()/+*'"-]+$/, 'Use a CSS color, length, number, or font list')
  .refine((value) => !/\b(?:url|image|image-set|expression|src|attr|env)\s*\(/i.test(value), {
    message: 'Functions that load resources are not allowed',
  })

const tokensSchema = z
  .record(tokenNameSchema, tokenValueSchema)
  .refine((tokens) => Object.keys(tokens).length <= 80, 'At most 80 tokens per mode')

/** A user's UI theme: CSS variable values for light and dark mode (e.g. from tweakcn.com). */
export const themeSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    /** The built-in preset it was based on, if any (informational). */
    preset: z.string().trim().max(60).nullable().default(null),
    light: tokensSchema,
    dark: tokensSchema,
  })
  .meta({ id: 'Theme', description: 'CSS variable values for light and dark mode' })

/** Preferences of first-party UIs such as the admin. Missing fields take their defaults. */
export const preferencesSchema = z
  .object({
    colorScheme: z.enum(['system', 'light', 'dark']).default('system'),
    /** `null`: the app's default theme. */
    theme: themeSchema.nullable().default(null),
  })
  .meta({ id: 'UserPreferences', description: 'UI preferences of the signed-in user' })

export type Theme = z.output<typeof themeSchema>
export type UserPreferences = z.output<typeof preferencesSchema>
export type UpdatePreferencesInput = z.input<typeof preferencesSchema>
