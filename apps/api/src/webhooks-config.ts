import { InfrastructureError } from '@blixis-io/contracts'
import { defineModule } from '@blixis-io/kernel'
import { WEBHOOKS_CONFIG } from '@blixis-io/webhooks'

/**
 * Provides `WEBHOOKS_CONFIG` from the Worker environment (plan 015): the `WEBHOOK_SECRET_KEYS`
 * secret, and whether local receivers (`http://localhost`) are allowed — only when `BLIXIS_ENV`
 * is `local`. Lives in the app because only platform code reads bindings (§19).
 */
export const webhooksConfigModule = defineModule({
  meta: { name: '@blixis/api.webhooks-config', version: '0.0.0' },
  setup(ctx) {
    ctx.services.provideFactory(
      WEBHOOKS_CONFIG,
      ({ bindings }) => {
        const keys = bindings['WEBHOOK_SECRET_KEYS']
        if (typeof keys !== 'string' || keys === '')
          throw new InfrastructureError(
            'WEBHOOK_SECRET_KEYS is not configured (node tooling/db/src/cli.ts generate-webhook-key)',
          )
        return { secretKeys: keys, allowPrivateUrls: bindings['BLIXIS_ENV'] === 'local' }
      },
      { scope: 'request' },
    )
  },
})
