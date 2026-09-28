import type { BlixisClient, BrowserSession, User } from '@blixis-io/sdk'
import { createContext, useContext, useSyncExternalStore } from 'react'

const SessionContext = createContext<BrowserSession | null>(null)

export const SessionProvider = SessionContext.Provider

/** The browser session (ADR 0017): tokens stay in memory and in the HttpOnly refresh cookie. */
export function useSession(): BrowserSession {
  const session = useContext(SessionContext)
  if (session === null) throw new Error('useSession outside <SessionProvider>')
  return session
}

/** The Management API client of the signed-in user. */
export function useClient(): BlixisClient {
  return useSession().client
}

/** The signed-in user; re-renders when the session starts or ends. */
export function useUser(): User | null {
  const session = useSession()
  return useSyncExternalStore(session.subscribe, () => session.user)
}

/**
 * Where to go after signing in: only paths inside the admin (`/…`), never another origin
 * (`//evil.example`, `https://…`) — an open redirect would help phishing.
 */
export function safeRedirect(target: string | undefined): string {
  if (target === undefined || !target.startsWith('/')) return '/'
  return target.startsWith('//') || target.startsWith('/\\') ? '/' : target
}
