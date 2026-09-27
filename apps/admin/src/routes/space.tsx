import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createRoute, Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx'
import { organizationsQuery, spaceQuery } from '../lib/queries.ts'
import { useClient } from '../lib/session.tsx'
import { appRoute } from './app-layout.tsx'

export const spaceRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/spaces/$spaceId',
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(spaceQuery(context.session.client, params.spaceId)),
  pendingComponent: () => <p role="status">Loading space…</p>,
  component: SpacePage,
})

function SpacePage() {
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
      <div>
        <h1 className="text-2xl font-semibold">{space.name}</h1>
        <p className="text-sm text-muted-foreground">
          Slug <code className="font-mono">{space.slug}</code> · ID{' '}
          <code className="font-mono select-all">{space.id}</code>
        </p>
      </div>
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
    </section>
  )
}
