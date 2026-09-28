import type { ContentType } from '@blixis-io/sdk'
import { useQuery } from '@tanstack/react-query'
import { createRoute, Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { ErrorView } from '../components/error-view.tsx'
import { Button } from '../components/ui/button.tsx'
import { CreateContentTypeDialog } from '../features/content-types/create-content-type-dialog.tsx'
import { contentTypesQuery } from '../features/content-types/queries.ts'
import { useClient } from '../lib/session.tsx'
import { spaceRoute } from './space.tsx'

export const contentTypesRoute = createRoute({
  getParentRoute: () => spaceRoute,
  path: '/content-types',
  component: ContentTypesPage,
})

function ContentTypesPage() {
  const client = useClient()
  const { spaceId } = contentTypesRoute.useParams()
  const types = useQuery(contentTypesQuery(client, spaceId))
  const [creating, setCreating] = useState(false)

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Content model</h2>
        <Button onClick={() => setCreating(true)}>
          <Plus aria-hidden />
          New content type
        </Button>
      </div>
      {types.isPending ? <p role="status">Loading content types…</p> : null}
      {types.isError ? <ErrorView error={types.error} reset={() => void types.refetch()} /> : null}
      {types.data !== undefined ? (
        <>
          <TypeList
            title="Content types"
            empty="No content types yet. Create one to start adding entries."
            spaceId={spaceId}
            types={types.data.filter((t) => t.kind === 'entry')}
          />
          <TypeList
            title="Components"
            empty="No components yet. Components are reusable parts for blocks fields."
            spaceId={spaceId}
            types={types.data.filter((t) => t.kind === 'component')}
          />
        </>
      ) : null}
      <CreateContentTypeDialog spaceId={spaceId} open={creating} onOpenChange={setCreating} />
    </div>
  )
}

function TypeList({
  title,
  empty,
  spaceId,
  types,
}: {
  title: string
  empty: string
  spaceId: string
  types: readonly ContentType[]
}) {
  return (
    <section className="grid gap-2" aria-label={title}>
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      {types.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : null}
      <ul className="grid gap-2 sm:grid-cols-2">
        {types.map((type) => (
          <li key={type.id}>
            <Link
              to="/spaces/$spaceId/content-types/$contentTypeId"
              params={{ spaceId, contentTypeId: type.id }}
              className="block rounded-md border border-border bg-card px-4 py-3 text-card-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="font-medium">{type.name}</span>
              <span className="block text-xs text-muted-foreground">
                <code className="font-mono">{type.apiId}</code> · {type.fields.length}{' '}
                {type.fields.length === 1 ? 'field' : 'fields'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
