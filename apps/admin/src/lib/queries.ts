import type { BlixisClient } from '@blixis/sdk'
import { queryOptions } from '@tanstack/react-query'

/** Server-state queries (TanStack Query); keys are shared so mutations can invalidate them. */
export const organizationsQuery = (client: BlixisClient) =>
  queryOptions({ queryKey: ['organizations'], queryFn: () => client.organizations.list() })

export const spacesQuery = (client: BlixisClient, orgId: string) =>
  queryOptions({
    queryKey: ['organizations', orgId, 'spaces'],
    queryFn: () => client.spaces.list(orgId),
  })

export const spaceQuery = (client: BlixisClient, spaceId: string) =>
  queryOptions({ queryKey: ['spaces', spaceId], queryFn: () => client.spaces.get(spaceId) })
