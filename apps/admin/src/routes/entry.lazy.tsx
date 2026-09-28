import { useSuspenseQuery } from '@tanstack/react-query'
import { createLazyRoute, getRouteApi } from '@tanstack/react-router'
import { ErrorView } from '../components/error-view.tsx'
import { contentTypesQuery } from '../features/content-types/queries.ts'
import { EntryEditor } from '../features/entries/entry-editor.tsx'
import { entryQuery } from '../features/entries/queries.ts'
import { spaceQuery } from '../lib/queries.ts'
import { useClient } from '../lib/session.tsx'

const entryApi = getRouteApi('/app/spaces/$spaceId/entries/$entryId')
const newEntryApi = getRouteApi('/app/spaces/$spaceId/entries/new/$contentTypeId')

function EntryPage() {
  const client = useClient()
  const { spaceId, entryId } = entryApi.useParams()
  const { data: entry } = useSuspenseQuery(entryQuery(client, entryId))
  const types = useSuspenseQuery(contentTypesQuery(client, spaceId)).data
  const space = useSuspenseQuery(spaceQuery(client, spaceId)).data
  const type = types.find((t) => t.id === entry.sys.contentType.id)
  if (type === undefined)
    return <ErrorView error={new Error('The content type of this entry no longer exists.')} />
  // A new version (save elsewhere, restore, "load the latest") starts a fresh working copy.
  return (
    <EntryEditor
      key={`${entry.sys.id}:${entry.sys.version}`}
      spaceId={spaceId}
      entry={entry}
      type={type}
      contentTypes={types}
      locales={space.locales}
    />
  )
}

function NewEntryPage() {
  const client = useClient()
  const { spaceId, contentTypeId } = newEntryApi.useParams()
  const types = useSuspenseQuery(contentTypesQuery(client, spaceId)).data
  const space = useSuspenseQuery(spaceQuery(client, spaceId)).data
  const type = types.find((t) => t.id === contentTypeId && t.kind === 'entry')
  if (type === undefined) return <ErrorView error={new Error('Unknown content type.')} />
  return (
    <EntryEditor
      spaceId={spaceId}
      entry={null}
      type={type}
      contentTypes={types}
      locales={space.locales}
    />
  )
}

export const EntryRoute = createLazyRoute('/app/spaces/$spaceId/entries/$entryId')({
  component: EntryPage,
})
export const NewEntryRoute = createLazyRoute('/app/spaces/$spaceId/entries/new/$contentTypeId')({
  component: NewEntryPage,
})
