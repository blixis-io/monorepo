import { createRouter, type RouterHistory } from '@tanstack/react-router'
import { appRoute } from './app-layout.tsx'
import { appearanceRoute } from './appearance.tsx'
import { contentTypeRoute } from './content-type.tsx'
import { contentTypesRoute } from './content-types.tsx'
import { homeRoute } from './home.tsx'
import { type RouterContext, rootRoute } from './root.tsx'
import { signInRoute } from './sign-in.tsx'
import { spaceOverviewRoute, spaceRoute } from './space.tsx'

const routeTree = rootRoute.addChildren([
  signInRoute,
  appRoute.addChildren([
    homeRoute,
    spaceRoute.addChildren([spaceOverviewRoute, contentTypesRoute, contentTypeRoute]),
    appearanceRoute,
  ]),
])

/** The admin's router; tests pass a memory history. */
export function createAdminRouter(context: RouterContext, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context,
    defaultPreload: 'intent',
    // Loaders read through TanStack Query, which owns caching.
    defaultPreloadStaleTime: 0,
    ...(history === undefined ? {} : { history }),
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAdminRouter>
  }
}
