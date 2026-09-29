// Auxiliary Worker for service-binding.worker.test.ts (plan 020.005): serves a small service
// over a Service Binding the way an extracted Blixis Worker would. Bundled by vitest.config.ts.

import { WorkerEntrypoint } from 'cloudflare:workers'
import { handleServiceCall, type ServiceCall } from '@blixis-io/cloudflare'
import { createServiceToken, REQUEST_CONTEXT, ValidationError } from '@blixis-io/contracts'
import { createBlixis, defineModule, noopLogger } from '@blixis-io/kernel'

export interface NotesService {
  whoAmI(): Promise<{ actor: string; correlationId: string; spaceId?: string }>
  fail(): Promise<never>
}
export const NOTES = createServiceToken<NotesService>('@acme/notes.service')

const app = createBlixis({
  logger: noopLogger,
  modules: [
    defineModule({
      meta: { name: '@acme/notes', version: '1.0.0' },
      setup(ctx) {
        ctx.services.provideFactory(
          NOTES,
          ({ services }) => ({
            async whoAmI() {
              const request = services.get(REQUEST_CONTEXT)
              return {
                actor: request.actor.type === 'user' ? request.actor.userId : request.actor.type,
                correlationId: request.correlationId,
                ...(request.tenant.spaceId === undefined
                  ? {}
                  : { spaceId: request.tenant.spaceId }),
              }
            },
            async fail() {
              throw new ValidationError('Bad note', [{ path: ['title'], message: 'Required' }])
            },
          }),
          { scope: 'request' },
        )
      },
    })(),
  ],
})

export class NotesEntrypoint extends WorkerEntrypoint {
  call(call: ServiceCall) {
    return handleServiceCall(app, NOTES, call, this.env)
  }
}

export default {
  fetch: () => new Response('notes service', { status: 404 }),
}
