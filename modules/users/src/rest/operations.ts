import type { RestOperation, SameShape } from '@blixis/contracts'
import { z } from 'zod'
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

const check: SameShape<z.output<typeof userSchema>, User> = true
void check

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
]
