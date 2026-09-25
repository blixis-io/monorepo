import {
  REQUEST_CONTEXT,
  type RequestContext,
  TENANT_BINDER,
  type TenantContext,
} from '@blixis/contracts'
import type { RequestServiceScope } from './services.ts'

/** Provides `REQUEST_CONTEXT` and a `TENANT_BINDER` that re-binds it with a verified tenant. */
export function provideRequestContext(scope: RequestServiceScope, initial: RequestContext): void {
  let current = initial
  scope.provideValue(REQUEST_CONTEXT, current)
  scope.provideValue(TENANT_BINDER, {
    bind(tenant: TenantContext): RequestContext {
      const fields = Object.fromEntries(
        Object.entries(tenant).filter(([, value]) => value !== undefined),
      )
      current = { ...current, tenant, logger: current.logger.child(fields) }
      scope.provideValue(REQUEST_CONTEXT, current)
      return current
    },
  })
}
