import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  Outlet,
  type RouterHistory,
} from '@tanstack/react-router'
import { ThemeToggle } from '../components/theme-toggle.tsx'

export interface RouterContext {
  readonly queryClient: QueryClient
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <Link to="/" className="font-semibold">
          Blixis
        </Link>
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-5xl p-6">
        <Outlet />
      </main>
    </div>
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

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <section>
      <h1 className="text-2xl font-semibold">Welcome to Blixis</h1>
      <p className="text-muted-foreground">Sign-in and spaces arrive with plan 019.002.</p>
    </section>
  ),
})

const routeTree = rootRoute.addChildren([indexRoute])

/** The admin's router; tests pass a memory history. */
export function createAdminRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    ...(history === undefined ? {} : { history }),
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAdminRouter>
  }
}
