import type { RestOperation, SameShape } from '@blixis-io/contracts'
import { userSchema } from '@blixis-io/users'
import { z } from 'zod'
import type { ApiTokenRecord } from '../application/api-tokens.ts'
import type { DeliveryKeyRecord } from '../application/delivery-keys.ts'

const permissionId = z.templateLiteral([z.string(), '.', z.string()])

export const sessionSchema = z
  .object({
    tokenType: z.literal('Bearer'),
    accessToken: z.string().describe('EdDSA JWT, valid for `expiresIn` seconds (15 minutes)'),
    expiresIn: z.number().int(),
    refreshToken: z
      .string()
      .optional()
      .describe('Only with `tokenDelivery: "body"`; browsers get an HttpOnly cookie instead'),
    refreshTokenExpiresAt: z.string().optional(),
    user: userSchema,
  })
  .meta({ id: 'Session', description: 'Tokens of a signed-in session' })

export const apiTokenSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    prefix: z.string().describe('First characters, e.g. `blx_pat_Ab3d`'),
    scopes: z.array(permissionId).describe('Empty: every permission of the owner'),
    expiresAt: z.string().nullable(),
    lastUsedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'ApiToken', description: 'A personal API token (never the token itself)' })

export const deliveryKeySchema = z
  .object({
    id: z.string(),
    kind: z.enum(['delivery', 'preview']),
    name: z.string(),
    prefix: z.string().describe('e.g. `blx_dk_Ab3x`'),
    environmentIds: z.array(z.string()).nullable().describe('`null`: every environment'),
    createdBy: z.string(),
    createdAt: z.string(),
    lastUsedAt: z.string().nullable(),
  })
  .meta({
    id: 'DeliveryKey',
    description: 'A delivery or preview key of a space (never the key itself)',
  })

const checks: [
  SameShape<z.output<typeof apiTokenSchema>, ApiTokenRecord>,
  SameShape<z.output<typeof deliveryKeySchema>, DeliveryKeyRecord>,
] = [true, true]
void checks

const tokenDelivery = z
  .enum(['cookie', 'body'])
  .optional()
  .describe(
    '`body` returns the refresh token in the response (non-browser clients); default cookie',
  )
const noStore = 'Tokens: `Cache-Control: no-store`'

/** Operations of `@blixis/auth` below `/auth` (ADR 0015). */
export const AUTH_OPERATIONS: readonly RestOperation[] = [
  {
    method: 'POST',
    path: '/sign-up',
    id: 'signUp',
    tag: 'Authentication',
    summary: 'Create an account and sign in (only when the app allows sign-up)',
    auth: false,
    request: {
      body: z.object({
        email: z.string(),
        displayName: z.string(),
        password: z.string().describe('At least 12 characters'),
        tokenDelivery,
      }),
    },
    responses: { 201: { description: noStore, schema: sessionSchema } },
  },
  {
    method: 'POST',
    path: '/sign-in',
    id: 'signIn',
    tag: 'Authentication',
    summary: 'Sign in with email and password',
    auth: false,
    request: { body: z.object({ email: z.string(), password: z.string(), tokenDelivery }) },
    responses: { 200: { description: noStore, schema: sessionSchema } },
  },
  {
    method: 'POST',
    path: '/refresh',
    id: 'refreshSession',
    tag: 'Authentication',
    summary: 'Exchange a refresh token (cookie or body) for new tokens; it rotates',
    auth: false,
    request: { body: z.object({ refreshToken: z.string().optional() }) },
    responses: { 200: { description: noStore, schema: sessionSchema } },
  },
  {
    method: 'POST',
    path: '/sign-out',
    id: 'signOut',
    tag: 'Authentication',
    summary: 'Revoke the refresh-token family and clear the cookie',
    auth: false,
    request: { body: z.object({ refreshToken: z.string().optional() }) },
    responses: { 204: { description: 'Signed out' } },
  },
  {
    method: 'GET',
    path: '/me',
    id: 'getCurrentUser',
    tag: 'Authentication',
    summary: 'The signed-in user',
    responses: { 200: { description: 'OK', schema: userSchema } },
  },
  {
    method: 'GET',
    path: '/tokens',
    id: 'listApiTokens',
    tag: 'API tokens',
    summary: 'Your API tokens (needs a signed-in session, not an API token)',
    responses: {
      200: { description: 'OK', schema: z.object({ tokens: z.array(apiTokenSchema) }) },
    },
  },
  {
    method: 'POST',
    path: '/tokens',
    id: 'createApiToken',
    tag: 'API tokens',
    summary: 'Create an API token; the token is returned once',
    request: {
      body: z.object({
        name: z.string(),
        scopes: z.array(z.string()).optional(),
        expiresInDays: z.number().int().optional(),
      }),
    },
    responses: {
      201: {
        description: 'Created',
        schema: apiTokenSchema.extend({ token: z.string().describe('`blx_pat_…`, shown once') }),
      },
    },
  },
  {
    method: 'DELETE',
    path: '/tokens/:id',
    id: 'revokeApiToken',
    tag: 'API tokens',
    summary: 'Revoke an API token',
    responses: { 204: { description: 'Revoked' } },
  },
  {
    method: 'GET',
    path: '/jwks',
    id: 'getJwks',
    tag: 'Authentication',
    summary: 'Public keys that verify access tokens (JWKS)',
    auth: false,
    responses: {
      200: {
        description: 'OK',
        schema: z.object({ keys: z.array(z.record(z.string(), z.unknown())) }),
      },
    },
  },
]

/** Operations of the delivery-key routes (ADR 0015). */
export const DELIVERY_KEY_OPERATIONS: readonly RestOperation[] = [
  {
    method: 'GET',
    path: '/spaces/:spaceId/delivery-keys',
    id: 'listDeliveryKeys',
    tag: 'Delivery keys',
    summary: 'Delivery and preview keys of a space',
    permission: 'auth.deliveryKeys.manage',
    responses: {
      200: { description: 'OK', schema: z.object({ deliveryKeys: z.array(deliveryKeySchema) }) },
    },
  },
  {
    method: 'POST',
    path: '/spaces/:spaceId/delivery-keys',
    id: 'createDeliveryKey',
    tag: 'Delivery keys',
    summary: 'Create a delivery (`blx_dk_`) or preview (`blx_pk_`) key; the key is returned once',
    permission: 'auth.deliveryKeys.manage',
    request: {
      body: z.object({
        name: z.string(),
        kind: z.enum(['delivery', 'preview']),
        environmentIds: z.array(z.string()).nullable().optional(),
      }),
    },
    responses: {
      201: {
        description: 'Created',
        schema: deliveryKeySchema.extend({ key: z.string().describe('Shown once') }),
      },
    },
  },
  {
    method: 'DELETE',
    path: '/spaces/:spaceId/delivery-keys/:keyId',
    id: 'revokeDeliveryKey',
    tag: 'Delivery keys',
    summary: 'Revoke a key (other isolates stop accepting it within 30 seconds)',
    permission: 'auth.deliveryKeys.manage',
    responses: { 204: { description: 'Revoked' } },
  },
]
