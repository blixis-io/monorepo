import type { BlixisClient } from '@blixis/sdk'
import { queryOptions } from '@tanstack/react-query'

export const contentTypesQuery = (client: BlixisClient, spaceId: string) =>
  queryOptions({
    queryKey: ['spaces', spaceId, 'content-types'],
    queryFn: () => client.contentTypes.list(spaceId),
  })

export const contentTypeQuery = (client: BlixisClient, spaceId: string, contentTypeId: string) =>
  queryOptions({
    queryKey: ['spaces', spaceId, 'content-types', contentTypeId],
    queryFn: () => client.contentTypes.get(spaceId, contentTypeId),
  })

/** Field types change only with a deploy (plugins): cache them for the session. */
export const fieldTypesQuery = (client: BlixisClient) =>
  queryOptions({
    queryKey: ['field-types'],
    queryFn: () => client.fieldTypes.list(),
    staleTime: Number.POSITIVE_INFINITY,
  })
