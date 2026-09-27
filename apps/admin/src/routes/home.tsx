import type { Organization } from '@blixis/sdk'
import { useQuery } from '@tanstack/react-query'
import { createRoute, Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { CreateOrganizationDialog } from '../components/create-organization-dialog.tsx'
import { CreateSpaceDialog } from '../components/create-space-dialog.tsx'
import { ErrorView } from '../components/error-view.tsx'
import { Button } from '../components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx'
import { organizationsQuery, spacesQuery } from '../lib/queries.ts'
import { useClient, useUser } from '../lib/session.tsx'
import { appRoute } from './app-layout.tsx'

export const homeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: Home,
})

function Home() {
  const client = useClient()
  const user = useUser()
  const organizations = useQuery(organizationsQuery(client))
  const [newOrganization, setNewOrganization] = useState(false)
  const [newSpaceIn, setNewSpaceIn] = useState<Organization | null>(null)

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          {user === null ? 'Spaces' : `Welcome, ${user.displayName}`}
        </h1>
        <Button variant="outline" onClick={() => setNewOrganization(true)}>
          <Plus aria-hidden />
          New organization
        </Button>
      </div>
      {organizations.isPending ? <p role="status">Loading organizations…</p> : null}
      {organizations.isError ? (
        <ErrorView error={organizations.error} reset={() => void organizations.refetch()} />
      ) : null}
      {organizations.data?.length === 0 ? (
        <Card>
          <CardContent className="grid gap-2">
            <p className="font-medium">You aren’t a member of any organization yet.</p>
            <p className="text-sm text-muted-foreground">
              Create one, or ask an owner to add you to theirs.
            </p>
          </CardContent>
        </Card>
      ) : null}
      {(organizations.data ?? []).map((org) => (
        <OrganizationCard key={org.id} organization={org} onNewSpace={() => setNewSpaceIn(org)} />
      ))}
      <CreateOrganizationDialog open={newOrganization} onOpenChange={setNewOrganization} />
      <CreateSpaceDialog
        organization={newSpaceIn}
        onOpenChange={(open) => {
          if (!open) setNewSpaceIn(null)
        }}
      />
    </section>
  )
}

function OrganizationCard({
  organization,
  onNewSpace,
}: {
  organization: Organization
  onNewSpace: () => void
}) {
  const client = useClient()
  const spaces = useQuery(spacesQuery(client, organization.id))
  return (
    <Card aria-labelledby={`org-${organization.id}`}>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle id={`org-${organization.id}`}>{organization.name}</CardTitle>
        <Button variant="ghost" size="sm" onClick={onNewSpace}>
          <Plus aria-hidden />
          New space
        </Button>
      </CardHeader>
      <CardContent>
        {spaces.isPending ? <p role="status">Loading spaces…</p> : null}
        {spaces.isError ? (
          <ErrorView error={spaces.error} reset={() => void spaces.refetch()} />
        ) : null}
        {spaces.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No spaces yet.</p>
        ) : null}
        <ul className="grid gap-2 sm:grid-cols-2">
          {(spaces.data ?? []).map((space) => (
            <li key={space.id}>
              <Link
                to="/spaces/$spaceId"
                params={{ spaceId: space.id }}
                className="block rounded-md border border-border px-4 py-3 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="font-medium">{space.name}</span>
                <span className="block text-xs text-muted-foreground">{space.slug}</span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
