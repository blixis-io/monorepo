import {
  assetCreated,
  assetDeleted,
  assetPublished,
  assetUnpublished,
  assetUpdated,
} from '@blixis-io/assets'
import {
  contentTypeCreated,
  contentTypeDeleted,
  contentTypeUpdated,
  entryCreated,
  entryDeleted,
  entryPublished,
  entryUnpublished,
  entryUpdated,
} from '@blixis-io/content-api'
import type { EventDefinition } from '@blixis-io/contracts'

/**
 * Definitions of the events webhooks deliver — the same set as `PUBLIC_WEBHOOK_EVENTS` (a test
 * keeps them equal). Subscribing needs the definitions; the modules emitting them are optional
 * at runtime.
 */
export const PUBLIC_EVENT_DEFINITIONS: readonly EventDefinition[] = [
  entryCreated,
  entryUpdated,
  entryPublished,
  entryUnpublished,
  entryDeleted,
  contentTypeCreated,
  contentTypeUpdated,
  contentTypeDeleted,
  assetCreated,
  assetUpdated,
  assetPublished,
  assetUnpublished,
  assetDeleted,
] as readonly EventDefinition[]
