import { z } from 'zod'

/** A person who can sign in (architecture §30). Users are global, not tenant-scoped. */
export interface User {
  readonly id: string
  /** Normalized: trimmed and lower-cased. Unique. */
  readonly email: string
  readonly displayName: string
  readonly status: UserStatus
  /** ISO-8601. */
  readonly createdAt: string
  readonly updatedAt: string
}

/** `disabled` users cannot sign in; their data stays. */
export type UserStatus = 'active' | 'disabled'

/** Normalizes an email for storage and lookup (trim + lower-case). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Email address as accepted from clients (normalized). */
export const emailSchema = z.string().trim().max(254).pipe(z.email()).transform(normalizeEmail)

/** Display name: 1–100 characters after trimming. */
export const displayNameSchema = z.string().trim().min(1).max(100)

/** Input of {@link UserService.create}. */
export const createUserSchema = z.object({ email: emailSchema, displayName: displayNameSchema })
export type CreateUserInput = z.input<typeof createUserSchema>

/** Input of {@link UserService.updateProfile}. */
export const updateProfileSchema = z.object({ displayName: displayNameSchema })
export type UpdateProfileInput = z.input<typeof updateProfileSchema>
