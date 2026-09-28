import type { BlixisClient } from '@blixis-io/sdk'
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'

const PAGE = 25

/** Entries of a space, newest change first, optionally of one content type. */
export const entriesQuery = (
  client: BlixisClient,
  spaceId: string,
  contentType: string | undefined,
) =>
  infiniteQueryOptions({
    queryKey: ['spaces', spaceId, 'entries', { contentType: contentType ?? null }],
    queryFn: ({ pageParam }) =>
      client.entries.list(spaceId, {
        limit: PAGE,
        ...(contentType === undefined ? {} : { contentType }),
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })

export const entryQuery = (client: BlixisClient, entryId: string) =>
  queryOptions({ queryKey: ['entries', entryId], queryFn: () => client.entries.get(entryId) })

export const versionsQuery = (client: BlixisClient, entryId: string) =>
  queryOptions({
    queryKey: ['entries', entryId, 'versions'],
    queryFn: () => client.entries.versions(entryId, { limit: 50 }),
  })

/** Assets of a space, newest first. */
export const assetsQuery = (client: BlixisClient, spaceId: string) =>
  infiniteQueryOptions({
    queryKey: ['spaces', spaceId, 'assets'],
    queryFn: ({ pageParam }) =>
      client.assets.list(spaceId, {
        limit: 24,
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
