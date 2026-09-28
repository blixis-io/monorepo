import type { RestOperation, SameShape } from '@blixis-io/contracts'
import { z } from 'zod'
import { preferencesSchema, type UserPreferences } from '../domain/preferences.ts'
import { type User, updateProfileSchema } from '../domain/user.ts'

export const userSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    displayName: z.string(),
    status: z.enum(['active', 'disabled']),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'User', description: 'A user account' })

const checks: [
  SameShape<z.output<typeof userSchema>, User>,
  SameShape<z.output<typeof preferencesSchema>, UserPreferences>,
] = [true, true]
void checks

/** Operations of `@blixis/users` (ADR 0015). */
export const USERS_OPERATIONS: readonly RestOperation[] = [
  {
    method: 'GET',
    path: '/me',
    id: 'getProfile',
    tag: 'Users',
    summary: 'Your profile (users and API tokens)',
    responses: { 200: { description: 'OK', schema: userSchema } },
  },
  {
    method: 'PATCH',
    path: '/me',
    id: 'updateProfile',
    tag: 'Users',
    summary: 'Change your display name',
    request: { body: updateProfileSchema },
    responses: { 200: { description: 'OK', schema: userSchema } },
  },
  {
    method: 'GET',
    path: '/me/preferences',
    id: 'getPreferences',
    tag: 'Users',
    summary: 'Your UI preferences (color scheme and theme)',
    responses: { 200: { description: 'OK', schema: preferencesSchema } },
  },
  {
    method: 'PUT',
    path: '/me/preferences',
    id: 'updatePreferences',
    tag: 'Users',
    summary: 'Replace your UI preferences; omitted fields reset to their defaults',
    request: { body: preferencesSchema },
    responses: { 200: { description: 'OK', schema: preferencesSchema } },
  },
]
