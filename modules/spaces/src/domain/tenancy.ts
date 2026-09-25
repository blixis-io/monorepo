import { z } from 'zod'

/** Top-level tenant: owns spaces and members (architecture §21). */
export interface Organization {
  readonly id: string
  readonly name: string
  /** URL-safe, unique across the platform. */
  readonly slug: string
  readonly createdAt: string
  readonly updatedAt: string
}

/** A content space inside an organization (§21). All content is scoped to a space. */
export interface Space {
  readonly id: string
  readonly organizationId: string
  readonly name: string
  /** URL-safe, unique within the organization. */
  readonly slug: string
  readonly createdAt: string
  readonly updatedAt: string
}

/** A content environment of a space. MVP: exactly one, `main` (plan 008 decision). */
export interface Environment {
  readonly id: string
  readonly organizationId: string
  readonly spaceId: string
  readonly key: string
  readonly isDefault: boolean
  readonly createdAt: string
}

/** A locale of a space (BCP 47), with an optional fallback. Exactly one is the default. */
export interface Locale {
  readonly id: string
  readonly organizationId: string
  readonly spaceId: string
  /** Canonical BCP 47 tag, e.g. `en`, `nl-NL`. */
  readonly code: string
  readonly name: string
  readonly isDefault: boolean
  readonly fallbackCode: string | null
  readonly createdAt: string
}

/** Default environment key every space gets. */
export const DEFAULT_ENVIRONMENT_KEY = 'main'

/** Lower-case letters, digits, and inner hyphens; 1–63 characters (DNS-label-like). */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    'Use lower-case letters, digits, and hyphens (1–63)',
  )

export const nameSchema = z.string().trim().min(1).max(100)

/**
 * Canonicalizes a BCP 47 locale tag with `Intl.getCanonicalLocales` (available in Workers and
 * Node), e.g. `en-us` → `en-US`. Returns `undefined` for invalid tags.
 */
export function canonicalLocale(code: string): string | undefined {
  try {
    const [canonical] = Intl.getCanonicalLocales(code.trim())
    return canonical
  } catch {
    return undefined
  }
}

/** A BCP 47 tag, canonicalized. */
export const localeCodeSchema = z
  .string()
  .max(35)
  .transform((code, ctx) => {
    const canonical = canonicalLocale(code)
    if (canonical === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Not a valid BCP 47 language tag' })
      return z.NEVER
    }
    return canonical
  })
