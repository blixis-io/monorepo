import { createRoute } from '@tanstack/react-router'
import { contentTypesQuery } from '../features/content-types/queries.ts'
import { entryQuery } from '../features/entries/queries.ts'
import { spaceQuery } from '../lib/queries.ts'
import { spaceRoute } from './space.tsx'

/** The entry editor is code-split (`entry.lazy.tsx`); the loaders fetch in parallel with it. */
export const entryRoute = createRoute({
  getParentRoute: () => spaceRoute,
  path: '/entries/$entryId',
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(entryQuery(context.session.client, params.entryId)),
      context.queryClient.ensureQueryData(
        contentTypesQuery(context.session.client, params.spaceId),
      ),
      context.queryClient.ensureQueryData(spaceQuery(context.session.client, params.spaceId)),
    ]),
  pendingComponent: () => <p role="status">Loading entry…</p>,
}).lazy(() => import('./entry.lazy.tsx').then((m) => m.EntryRoute))

export const newEntryRoute = createRoute({
  getParentRoute: () => spaceRoute,
  path: '/entries/new/$contentTypeId',
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(
        contentTypesQuery(context.session.client, params.spaceId),
      ),
      context.queryClient.ensureQueryData(spaceQuery(context.session.client, params.spaceId)),
    ]),
  pendingComponent: () => <p role="status">Loading…</p>,
}).lazy(() => import('./entry.lazy.tsx').then((m) => m.NewEntryRoute))
