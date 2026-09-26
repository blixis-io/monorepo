/**
 * `@blixis/graphql` — the `/graphql` endpoint (GraphQL Yoga) composed from module
 * contributions (architecture §10, plan 012).
 *
 * @packageDocumentation
 */
export { type BatchLoader, createBatchLoader } from './batch.ts'
export { composeSchema, type SchemaPart } from './compose.ts'
export { type GraphQLContext, loader } from './context.ts'
export { mapGraphQLError, useBlixisErrors } from './errors.ts'
export {
  GRAPHQL_SCHEMA_EXTENSION,
  type SchemaExtension,
  type SchemaExtensionProvider,
} from './extensions.ts'
export { DEFAULT_LIMITS, type GraphqlLimits, useLimits } from './limits.ts'
export { type GraphqlModuleOptions, graphqlModule } from './module.ts'
export { SCALAR_TYPE_DEFS, SCALARS } from './scalars.ts'
