import type { Organization } from '@blixis/sdk'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Fragment, useState } from 'react'
import { organizationsQuery, spacesQuery } from '../lib/queries.ts'
import { useClient } from '../lib/session.tsx'
import { CreateOrganizationDialog } from './create-organization-dialog.tsx'
import { CreateSpaceDialog } from './create-space-dialog.tsx'
import { Button } from './ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.tsx'

/** Switches between the spaces of every organization; creates organizations and spaces. */
export function SpaceSwitcher() {
  const client = useClient()
  const { spaceId } = useParams({ strict: false })
  const organizations = useQuery(organizationsQuery(client))
  const spaces = useQueries({
    queries: (organizations.data ?? []).map((org) => spacesQuery(client, org.id)),
  })
  const [newOrganization, setNewOrganization] = useState(false)
  const [newSpaceIn, setNewSpaceIn] = useState<Organization | null>(null)

  const current = spaces.flatMap((q) => q.data ?? []).find((space) => space.id === spaceId)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="min-w-48 justify-between" aria-label="Switch space">
            <span className="truncate">{current?.name ?? 'Choose a space'}</span>
            <ChevronsUpDown aria-hidden className="opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {organizations.isPending ? <DropdownMenuLabel>Loading…</DropdownMenuLabel> : null}
          {organizations.isError ? (
            <DropdownMenuLabel className="text-destructive">
              Couldn’t load organizations
            </DropdownMenuLabel>
          ) : null}
          {(organizations.data ?? []).map((org, index) => (
            <Fragment key={org.id}>
              {index > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuGroup>
                <DropdownMenuLabel>{org.name}</DropdownMenuLabel>
                {(spaces[index]?.data ?? []).map((space) => (
                  <DropdownMenuItem key={space.id} asChild>
                    <Link to="/spaces/$spaceId" params={{ spaceId: space.id }}>
                      <Check aria-hidden className={space.id === spaceId ? '' : 'invisible'} />
                      {space.name}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onSelect={() => setNewSpaceIn(org)}>
                  <Plus aria-hidden />
                  New space…
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </Fragment>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setNewOrganization(true)}>
            <Plus aria-hidden />
            New organization…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateOrganizationDialog open={newOrganization} onOpenChange={setNewOrganization} />
      <CreateSpaceDialog
        organization={newSpaceIn}
        onOpenChange={(open) => {
          if (!open) setNewSpaceIn(null)
        }}
      />
    </>
  )
}
