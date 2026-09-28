import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createRoute, Link, Outlet } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx'
import { organizationsQuery, spaceQuery } from '../lib/queries.ts'
import { useClient } from '../lib/session.tsx'
import { appRoute } from './app-layout.tsx'

/** A space: breadcrumbs, its name, and tabs for its sections. */
export const spaceRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/spaces/$spaceId',
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(spaceQuery(context.session.client, params.spaceId)),
  pendingComponent: () => <p role="status">Loading space…</p>,
  component: SpaceLayout,
})

const tabClass =
  'rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-[current=page]:bg-secondary aria-[current=page]:text-secondary-foreground'

function SpaceLayout() {
  const client = useClient()
  const { spaceId } = spaceRoute.useParams()
  const { data: space } = useSuspenseQuery(spaceQuery(client, spaceId))
  const organization = useQuery(organizationsQuery(client)).data?.find(
    (org) => org.id === space.organizationId,
  )

  return (
    <section className="grid gap-6">
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-1 text-sm text-muted-foreground">
          <li>
            <Link to="/" className="hover:text-foreground hover:underline">
              {organization?.name ?? 'Organization'}
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-4" />
          </li>
          <li aria-current="page" className="text-foreground">
            {space.name}
          </li>
        </ol>
      </nav>
      <div className="grid gap-3">
        <h1 className="text-2xl font-semibold">{space.name}</h1>
        <nav aria-label="Space sections" className="flex gap-1 border-b border-border pb-2">
          <Link
            to="/spaces/$spaceId"
            params={{ spaceId }}
            activeOptions={{ exact: true }}
            className={tabClass}
          >
            Overview
          </Link>
          <Link to="/spaces/$spaceId/content-types" params={{ spaceId }} className={tabClass}>
            Content model
          </Link>
        </nav>
      </div>
      <Outlet />
    </section>
  )
}

export const spaceOverviewRoute = createRoute({
  getParentRoute: () => spaceRoute,
  path: '/',
  component: SpaceOverview,
})

function SpaceOverview() {
  const client = useClient()
  const { spaceId } = spaceOverviewRoute.useParams()
  const { data: space } = useSuspenseQuery(spaceQuery(client, spaceId))
  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">
        Slug <code className="font-mono">{space.slug}</code> · ID{' '}
        <code className="font-mono select-all">{space.id}</code>
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Environments</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              {space.environments.map((environment) => (
                <li key={environment.id}>
                  <code className="font-mono">{environment.key}</code>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Locales</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              {space.locales.map((locale) => (
                <li key={locale.id}>
                  <code className="font-mono">{locale.code}</code>
                  {locale.isDefault ? ' (default)' : ''}
                  {locale.fallbackCode === null ? '' : ` → falls back to ${locale.fallbackCode}`}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
