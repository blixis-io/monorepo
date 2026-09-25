import { AUTH_CONFIG } from '@blixis/auth'
import { InfrastructureError } from '@blixis/contracts'
import { defineModule } from '@blixis/kernel'

/**
 * Provides `AUTH_CONFIG` from the Worker environment (ADR 0009): the `AUTH_SIGNING_KEYS` secret
 * and the `AUTH_ALLOWED_ORIGINS` var. Lives in the app because only platform code reads
 * bindings (§19); `@blixis/auth` consumes the service.
 */
export const authConfigModule = defineModule({
  meta: { name: '@blixis/api.auth-config', version: '0.0.0' },
  setup(ctx) {
    ctx.services.provideFactory(
      AUTH_CONFIG,
      ({ bindings }) => {
        const signingKeys = bindings['AUTH_SIGNING_KEYS']
        if (typeof signingKeys !== 'string' || signingKeys === '') {
          throw new InfrastructureError(
            'AUTH_SIGNING_KEYS is not configured (pnpm auth:generate-key)',
          )
        }
        const origins =
          typeof bindings['AUTH_ALLOWED_ORIGINS'] === 'string'
            ? bindings['AUTH_ALLOWED_ORIGINS']
            : ''
        return {
          signingKeys,
          allowedOrigins: origins
            .split(',')
            .map((origin) => origin.trim())
            .filter((origin) => origin !== ''),
        }
      },
      { scope: 'request' },
    )
  },
})
