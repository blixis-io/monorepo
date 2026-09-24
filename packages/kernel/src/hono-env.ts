import type { ModuleHonoEnv } from '@blixis/contracts'

/**
 * Hono environment of the root application: module variables (`requestContext`, `services`)
 * plus platform bindings supplied by the runtime adapter (e.g. Cloudflare `env`, plan 004).
 */
export interface BlixisHonoEnv<TBindings extends object = Record<string, unknown>> {
  Bindings: TBindings
  Variables: ModuleHonoEnv['Variables']
}
