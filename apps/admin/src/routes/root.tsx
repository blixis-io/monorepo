import type { BrowserSession } from '@blixis/sdk'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import { ErrorView } from '../components/error-view.tsx'

export interface RouterContext {
  readonly queryClient: QueryClient
  readonly session: BrowserSession
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <div className="min-h-screen bg-background text-foreground">
      <Outlet />
    </div>
  ),
  errorComponent: ({ error, reset }) => (
    <main className="p-6">
      <ErrorView error={error} reset={reset} />
    </main>
  ),
  notFoundComponent: () => (
    <div role="alert">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">
        <Link to="/" className="underline">
          Back to the start
        </Link>
      </p>
    </div>
  ),
})
