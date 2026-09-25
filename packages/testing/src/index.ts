/**
 * `@blixis/testing` — utilities for testing Blixis modules. Import it **only from test files**
 * (enforced by the repository's boundary checker).
 *
 * @packageDocumentation
 */

export { type ServiceOverride, serviceOverride } from '@blixis/kernel'
export {
  asAnonymous,
  asApiToken,
  asDeliveryKey,
  asSystem,
  asUser,
  encodeTestActor,
  TEST_ACTOR_HEADER,
} from './actors.ts'
export {
  type AuthzCase,
  type AuthzLevel,
  type AuthzRoute,
  checkAuthzMatrix,
  defineAuthzMatrix,
  expectedAuthzStatus,
} from './authz-matrix.ts'
export {
  type CreateTestBlixisOptions,
  createTestBlixis,
  type TestBlixis,
  type TestRequestInit,
} from './create-test-blixis.ts'
export { type CapturedEvents, captureEvents } from './events.ts'
export {
  expectIsolated,
  type IsolationParams,
  type IsolationRoute,
  isolationUrl,
  isTenantScoped,
  uncoveredTenantRoutes,
} from './isolation.ts'
export { type CapturingLogger, createCapturingLogger, type LogEntry } from './logger.ts'
