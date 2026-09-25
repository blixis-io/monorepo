import { createServiceToken, type ServiceToken } from '@blixis/contracts'
import type { SchemaPart } from './compose.ts'
import type { GraphQLContext } from './context.ts'

/**
 * Extra schema for one request — e.g. types generated from a space's content model (ADR 0011).
 * `key` identifies the extension's content (such as `space:env:modelVersion`): equal keys must
 * mean equal parts, because composed schemas are cached per key.
 */
export interface SchemaExtension {
  readonly key: string
  readonly parts: readonly SchemaPart[]
}

/** Returns the extension for a request, or `undefined` for the static schema only. */
export type SchemaExtensionProvider = (
  context: GraphQLContext,
) => Promise<SchemaExtension | undefined>

/**
 * Optional request-scoped provider of per-request schema extensions (plan 012.002). At most one
 * module provides it (`@blixis/content` for typed delivery schemas).
 */
export const GRAPHQL_SCHEMA_EXTENSION: ServiceToken<SchemaExtensionProvider> =
  createServiceToken<SchemaExtensionProvider>('@blixis/graphql.schema-extension')
