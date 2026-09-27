import { type BlixisClient, createBlixisClient } from './client.ts'
import { BlixisApiError } from './errors.ts'
import { ROUTES, type Session, type User } from './generated/api.ts'
import { createHttp, type HttpOptions } from './http.ts'

/** Options of {@link createBrowserSession}. */
export interface BrowserSessionOptions
  extends Pick<HttpOptions, 'baseUrl' | 'fetch' | 'timeoutMs' | 'retries'> {
  /** Renew the access token this long before it expires. Default 60 000 ms. */
  readonly refreshMarginMs?: number | undefined
  /**
   * Serializes refreshes across tabs of the same browser (refresh tokens rotate). Default: the Web
   * Locks API when available, else no cross-tab lock.
   */
  readonly lock?: (<T>(name: string, run: () => Promise<T>) => Promise<T>) | undefined
  /** The clock, for tests. */
  readonly now?: (() => number) | undefined
}

/** A signed-in (or signed-out) browser session, from {@link createBrowserSession}. */
export interface BrowserSession {
  /** A Management API client that authenticates as the session's user and refreshes on its own. */
  readonly client: BlixisClient
  /** The signed-in user, or `null`. */
  readonly user: User | null
  /** Signs in with email and password; the refresh token becomes an HttpOnly cookie. */
  signIn(credentials: { email: string; password: string }): Promise<User>
  /** Resumes a session from the refresh cookie (e.g. after a reload); `null` when there is none. */
  restore(): Promise<User | null>
  /** Revokes the session and clears the cookie. Always ends the local session. */
  signOut(): Promise<void>
  /** Called with the user whenever the session starts, ends, or expires. Returns an unsubscribe. */
  subscribe(listener: (user: User | null) => void): () => void
}

const webLock = <T>(name: string, run: () => Promise<T>): Promise<T> => {
  const locks = (globalThis.navigator as { locks?: LockManager } | undefined)?.locks
  return locks === undefined ? run() : locks.request(name, run)
}

/**
 * A browser session for first-party apps such as the admin (ADR 0009, ADR 0017): the access token
 * lives only in memory, the rotating refresh token in an `HttpOnly; SameSite=Strict` cookie that
 * JavaScript never sees. The page must be served from an origin listed in the API's
 * `AUTH_ALLOWED_ORIGINS`, on the same site as the API (e.g. `admin.example.com` and
 * `api.example.com`). Never store tokens in `localStorage`.
 *
 * @example
 * const session = createBrowserSession({ baseUrl: 'https://api.example.com' })
 * if ((await session.restore()) === null) await session.signIn({ email, password })
 * const organizations = await session.client.organizations.list()
 */
export function createBrowserSession(options: BrowserSessionOptions): BrowserSession {
  const now = options.now ?? Date.now
  const margin = options.refreshMarginMs ?? 60_000
  const lock = options.lock ?? webLock
  const http = createHttp({ ...options, retries: 0, credentials: 'include' })
  const listeners = new Set<(user: User | null) => void>()

  let user: User | null = null
  let accessToken: string | undefined
  let expiresAt = 0
  let refreshing: Promise<boolean> | undefined

  function set(session: Session | null) {
    const before = user
    user = session?.user ?? null
    accessToken = session?.accessToken
    expiresAt = session === null ? 0 : now() + session.expiresIn * 1000
    if (before?.id !== user?.id || (before === null) !== (user === null))
      for (const listener of listeners) listener(user)
  }

  /** Exchanges the refresh cookie for new tokens: `false` (and signed out) when it's gone. */
  function refresh(): Promise<boolean> {
    refreshing ??= lock('blixis-session-refresh', async () => {
      try {
        set(
          await http.json<Session>({
            method: 'POST',
            path: ROUTES.refreshSession.path,
            json: {},
            anonymous: true,
          }),
        )
        return true
      } catch (error) {
        if (error instanceof BlixisApiError && (error.status === 401 || error.status === 403)) {
          set(null)
          return false
        }
        throw error
      }
    }).finally(() => {
      refreshing = undefined
    })
    return refreshing
  }

  const client = createBlixisClient({
    ...options,
    credentials: 'include',
    token: async () => {
      if (accessToken !== undefined && now() >= expiresAt - margin)
        await refresh().catch(() => false)
      return accessToken
    },
    onUnauthorized: () => (user === null ? Promise.resolve(false) : refresh().catch(() => false)),
  })

  return {
    client,
    get user() {
      return user
    },
    async signIn(credentials) {
      const session = await http.json<Session>({
        method: 'POST',
        path: ROUTES.signIn.path,
        json: { ...credentials, tokenDelivery: 'cookie' },
        anonymous: true,
      })
      set(session)
      return session.user
    },
    async restore() {
      if (user !== null) return user
      return (await refresh()) ? user : null
    },
    async signOut() {
      try {
        await http.send({ method: 'POST', path: ROUTES.signOut.path, json: {}, anonymous: true })
      } finally {
        set(null)
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
