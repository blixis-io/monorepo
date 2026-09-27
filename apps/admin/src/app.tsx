import type { BrowserSession } from '@blixis/sdk'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type RouterHistory, RouterProvider } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Toaster } from './components/ui/toaster.tsx'
import { isRetryable } from './lib/errors.ts'
import { SessionProvider } from './lib/session.tsx'
import { createAdminRouter } from './routes/router.tsx'

/**
 * The admin application: the browser session, server state (TanStack Query), and routes
 * (TanStack Router). It resumes the session from the refresh cookie before the first route loads.
 */
export function App({ session, history }: { session: BrowserSession; history?: RouterHistory }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // The SDK already retries transient failures; retry once more, never 4xx mistakes.
            retry: (failures, error) => failures < 1 && isRetryable(error),
          },
        },
      }),
  )
  const [router] = useState(() => createAdminRouter({ queryClient, session }, history))
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    let active = true
    session
      .restore()
      .catch(() => null)
      .finally(() => {
        if (active) setRestored(true)
      })
    return () => {
      active = false
    }
  }, [session])

  // Signed out or expired elsewhere: drop cached data and let the route guards redirect.
  useEffect(
    () =>
      session.subscribe((user) => {
        if (user === null) queryClient.clear()
        void router.invalidate()
      }),
    [session, queryClient, router],
  )

  if (!restored)
    return (
      <p role="status" className="p-6 text-muted-foreground">
        Loading…
      </p>
    )
  return (
    <SessionProvider value={session}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>
    </SessionProvider>
  )
}
