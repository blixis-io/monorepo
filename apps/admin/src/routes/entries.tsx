import { useInfiniteQuery, useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { z } from 'zod'
import { ErrorView } from '../components/error-view.tsx'
import { Button } from '../components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.tsx'
import { Label } from '../components/ui/label.tsx'
import { NativeSelect } from '../components/ui/native-select.tsx'
import { contentTypesQuery } from '../features/content-types/queries.ts'
import { entriesQuery } from '../features/entries/queries.ts'
import { StatusBadge } from '../features/entries/status-badge.tsx'
import { entryTitle } from '../features/entries/values.ts'
import { spaceQuery } from '../lib/queries.ts'
import { useClient } from '../lib/session.tsx'
import { spaceRoute } from './space.tsx'

export const entriesRoute = createRoute({
  getParentRoute: () => spaceRoute,
  path: '/entries',
  validateSearch: z.object({ contentType: z.string().optional() }),
  component: EntriesPage,
})

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function EntriesPage() {
  const client = useClient()
  const navigate = useNavigate()
  const { spaceId } = entriesRoute.useParams()
  const { contentType } = entriesRoute.useSearch()
  const space = useSuspenseQuery(spaceQuery(client, spaceId)).data
  const defaultLocale = space.locales.find((l) => l.isDefault)?.code ?? 'en-US'
  const types = (useQuery(contentTypesQuery(client, spaceId)).data ?? []).filter(
    (t) => t.kind === 'entry',
  )
  const entries = useInfiniteQuery(entriesQuery(client, spaceId, contentType))
  const list = (entries.data?.pages ?? []).flatMap((p) => p.entries)

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-xl font-semibold">Entries</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <Label htmlFor="entries-type">Content type</Label>
            <NativeSelect
              id="entries-type"
              className="w-48"
              value={contentType ?? ''}
              onChange={(event) =>
                void navigate({
                  to: '/spaces/$spaceId/entries',
                  params: { spaceId },
                  search: event.target.value === '' ? {} : { contentType: event.target.value },
                })
              }
            >
              <option value="">All</option>
              {types.map((t) => (
                <option key={t.id} value={t.apiId}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={types.length === 0}>
                <Plus aria-hidden />
                New entry
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {types.map((t) => (
                <DropdownMenuItem key={t.id} asChild>
                  <Link
                    to="/spaces/$spaceId/entries/new/$contentTypeId"
                    params={{ spaceId, contentTypeId: t.id }}
                  >
                    {t.name}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {types.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Create a content type in the{' '}
          <Link to="/spaces/$spaceId/content-types" params={{ spaceId }} className="underline">
            content model
          </Link>{' '}
          first.
        </p>
      ) : null}
      {entries.isPending ? <p role="status">Loading entries…</p> : null}
      {entries.isError ? (
        <ErrorView error={entries.error} reset={() => void entries.refetch()} />
      ) : null}
      {entries.data !== undefined && list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No entries yet.</p>
      ) : null}
      {list.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Title
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Content type
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((entry) => {
                const type = types.find((t) => t.id === entry.sys.contentType.id)
                return (
                  <tr key={entry.sys.id} className="border-t border-border hover:bg-accent/50">
                    <td className="px-3 py-2">
                      <Link
                        to="/spaces/$spaceId/entries/$entryId"
                        params={{ spaceId, entryId: entry.sys.id }}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {entryTitle(entry, type, defaultLocale, defaultLocale)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {type?.name ?? entry.sys.contentType.apiId}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={entry.sys.status} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {dateFormat.format(new Date(entry.sys.updatedAt))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {entries.hasNextPage ? (
        <div>
          <Button
            variant="outline"
            disabled={entries.isFetchingNextPage}
            onClick={() => void entries.fetchNextPage()}
          >
            {entries.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
