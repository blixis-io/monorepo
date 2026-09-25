import {
  ForbiddenError,
  type ModuleHonoEnv,
  UnauthorizedError,
  ValidationError,
} from '@blixis/contracts'
import { toProblemResponse } from '@blixis/kernel'
import { USER_SERVICE } from '@blixis/users'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { API_TOKEN_SERVICE } from '../application/api-tokens.ts'
import { AUTH_SERVICE, type Authentication } from '../application/auth.service.ts'
import { AUTH_CONFIG } from '../application/config.ts'
import { bearerToken } from '../application/resolvers.ts'

/** Refresh-token cookie (ADR 0009): HttpOnly, Secure, SameSite=Strict, only sent to auth routes. */
export const REFRESH_COOKIE = 'blixis_refresh'
const COOKIE_PATH = '/api/v1/auth'

type Ctx = Context<ModuleHonoEnv>

function readCookie(c: Ctx, name: string): string | undefined {
  for (const part of (c.req.header('cookie') ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return undefined
}

function setRefreshCookie(c: Ctx, token: string, expiresAt: string): void {
  const maxAge = Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000))
  c.header(
    'set-cookie',
    `${REFRESH_COOKIE}=${token}; Path=${COOKIE_PATH}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`,
    { append: true },
  )
}

const CLEARED_COOKIE = `${REFRESH_COOKIE}=; Path=${COOKIE_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Strict`

function clearRefreshCookie(c: Ctx): void {
  c.header('set-cookie', CLEARED_COOKIE, { append: true })
}

async function jsonBody(c: Ctx): Promise<Record<string, unknown>> {
  const type = c.req.header('content-type') ?? ''
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new ValidationError('Send a JSON body (content-type: application/json)', [
      { path: ['headers', 'content-type'], message: 'Must be application/json' },
    ])
  }
  const body = (await c.req.json().catch(() => ({}))) as unknown
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
}

/**
 * Where the refresh token came from. A cookie means a browser: the request must come from an
 * allowed `Origin` (CSRF, ADR 0009). A body token means a non-browser client.
 */
function presentedRefreshToken(
  c: Ctx,
  body: Record<string, unknown>,
): { token?: string; viaCookie: boolean } {
  if (typeof body['refreshToken'] === 'string')
    return { token: body['refreshToken'], viaCookie: false }
  const cookie = readCookie(c, REFRESH_COOKIE)
  if (cookie === undefined || cookie === '') return { viaCookie: true }
  const origin = c.req.header('origin')
  const allowed = c.var.services.get(AUTH_CONFIG).allowedOrigins
  if (origin === undefined || !allowed.includes(origin)) {
    throw new ForbiddenError('Origin not allowed')
  }
  return { token: cookie, viaCookie: true }
}

function respond(c: Ctx, auth: Authentication, delivery: unknown, status: 200 | 201 = 200) {
  const inBody = delivery === 'body'
  if (!inBody) setRefreshCookie(c, auth.tokens.refreshToken, auth.tokens.refreshTokenExpiresAt)
  c.header('cache-control', 'no-store')
  return c.json(
    {
      tokenType: 'Bearer',
      accessToken: auth.tokens.accessToken,
      expiresIn: auth.tokens.expiresIn,
      ...(inBody
        ? {
            refreshToken: auth.tokens.refreshToken,
            refreshTokenExpiresAt: auth.tokens.refreshTokenExpiresAt,
          }
        : {}),
      user: auth.user,
    },
    status,
  )
}

const client = (c: Ctx) => {
  const userAgent = c.req.header('user-agent')
  return userAgent === undefined ? {} : { userAgent }
}

/**
 * Token management requires a signed-in user with a live session (ADR 0009): API tokens cannot
 * create or revoke tokens, and a signed-out session cannot use its remaining access token for it.
 */
async function requireLiveSession(c: Ctx): Promise<string> {
  const actor = c.var.requestContext.actor
  if (actor.type === 'apiToken')
    throw new ForbiddenError('API tokens cannot manage API tokens; sign in')
  const token = bearerToken(c.req.raw)
  if (actor.type !== 'user' || token === undefined)
    throw new UnauthorizedError('Sign in to manage API tokens')
  return c.var.services.get(AUTH_SERVICE).assertActiveSession(token)
}

/** `/auth` routes. Handlers only translate HTTP ⇄ `AUTH_SERVICE` (§48 Code.8). */
export function authRoutes(options: { readonly allowSignUp: boolean }) {
  return new Hono<ModuleHonoEnv>()
    .post('/sign-up', async (c) => {
      if (!options.allowSignUp) throw new ForbiddenError('Sign-up is disabled')
      const body = await jsonBody(c)
      const auth = await c.var.services.get(AUTH_SERVICE).signUp(
        {
          email: String(body['email'] ?? ''),
          displayName: String(body['displayName'] ?? ''),
          password: String(body['password'] ?? ''),
        },
        client(c),
      )
      return respond(c, auth, body['tokenDelivery'], 201)
    })
    .post('/sign-in', async (c) => {
      const body = await jsonBody(c)
      const auth = await c.var.services
        .get(AUTH_SERVICE)
        .signIn(
          { email: String(body['email'] ?? ''), password: String(body['password'] ?? '') },
          client(c),
        )
      return respond(c, auth, body['tokenDelivery'])
    })
    .post('/refresh', async (c) => {
      const body = await jsonBody(c)
      const { token, viaCookie } = presentedRefreshToken(c, body)
      if (token === undefined) throw new UnauthorizedError('Invalid or expired refresh token')
      try {
        const auth = await c.var.services.get(AUTH_SERVICE).refresh(token, client(c))
        return respond(c, auth, viaCookie ? 'cookie' : 'body')
      } catch (error) {
        if (!viaCookie || !(error instanceof UnauthorizedError)) throw error
        // A thrown error gets a fresh problem response; build it here to also clear the cookie.
        const response = toProblemResponse(error, c.var.requestContext.requestId)
        response.headers.append('set-cookie', CLEARED_COOKIE)
        return response
      }
    })
    .post('/sign-out', async (c) => {
      const body = await jsonBody(c)
      const { token } = presentedRefreshToken(c, body)
      if (token !== undefined) await c.var.services.get(AUTH_SERVICE).signOut(token)
      clearRefreshCookie(c)
      return c.body(null, 204)
    })
    .get('/me', async (c) => {
      const actor = c.var.requestContext.actor
      const userId =
        actor.type === 'user' ? actor.userId : actor.type === 'apiToken' ? actor.ownerId : undefined
      if (userId === undefined) throw new UnauthorizedError('Not signed in')
      return c.json(await c.var.services.get(USER_SERVICE).getById(userId))
    })
    .get('/tokens', async (c) => {
      const userId = await requireLiveSession(c)
      return c.json({ tokens: await c.var.services.get(API_TOKEN_SERVICE).list(userId) })
    })
    .post('/tokens', async (c) => {
      const userId = await requireLiveSession(c)
      const body = await jsonBody(c)
      const { token, record } = await c.var.services.get(API_TOKEN_SERVICE).create(userId, {
        name: String(body['name'] ?? ''),
        ...(Array.isArray(body['scopes']) ? { scopes: body['scopes'].map(String) } : {}),
        ...(typeof body['expiresInDays'] === 'number'
          ? { expiresInDays: body['expiresInDays'] }
          : {}),
      })
      c.header('cache-control', 'no-store')
      // The plaintext token is returned once and never stored.
      return c.json({ ...record, token }, 201)
    })
    .delete('/tokens/:id', async (c) => {
      const userId = await requireLiveSession(c)
      await c.var.services.get(API_TOKEN_SERVICE).revoke(userId, c.req.param('id'))
      return c.body(null, 204)
    })
    .get('/jwks', async (c) => {
      c.header('cache-control', 'public, max-age=300')
      return c.json({ keys: await c.var.services.get(AUTH_SERVICE).publicKeys() })
    })
}
