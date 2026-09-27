/**
 * `@blixis/sdk` — typed clients for Blixis: the Management API (REST) and the GraphQL delivery
 * API. Zero dependencies; runs wherever `fetch` does (plan 017).
 *
 * @packageDocumentation
 */

export {
  type BlixisClient,
  type BlixisClientOptions,
  type CallOptions,
  createBlixisClient,
  type OperationId,
  type OperationInput,
  signIn,
  type UploadOptions,
} from './client.ts'
export { BlixisApiError, type BlixisErrorCode } from './errors.ts'
export type * from './generated/api.ts'
export { ROUTES } from './generated/api.ts'
export type { HttpOptions } from './http.ts'
