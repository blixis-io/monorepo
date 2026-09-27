import { createRoute, Link, Outlet, redirect } from '@tanstack/react-router'
import { SpaceSwitcher } from '../components/space-switcher.tsx'
import { ThemeToggle } from '../components/theme-toggle.tsx'
import { UserMenu } from '../components/user-menu.tsx'
import { rootRoute } from './root.tsx'

/** Everything behind sign-in: redirects to `/sign-in` (and back) without a session. */
export const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: ({ context, location }) => {
    if (context.session.user === null)
      throw redirect({ to: '/sign-in', search: { redirect: location.href } })
  },
  component: AppLayout,
})

function AppLayout() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="flex items-center gap-3 border-b border-border px-4 py-2">
        <Link to="/" className="font-semibold">
          Blixis
        </Link>
        <nav aria-label="Spaces">
          <SpaceSwitcher />
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl p-6">
        <Outlet />
      </main>
    </>
  )
}
