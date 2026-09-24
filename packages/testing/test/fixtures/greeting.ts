// Fixture: a first-party-style module providing a service behind a capability.
import { createServiceToken } from '@blixis/contracts'
import { defineModule } from '@blixis/kernel'

export interface GreetingService {
  greet(name: string): string
}

/** Public token, as a real module would export it from its package root. */
export const GREETING_SERVICE = createServiceToken<GreetingService>('@fixture/greeting.service')

export const greeting = defineModule((options: { salutation?: string }) => ({
  meta: { name: '@fixture/greeting', version: '1.2.0', capabilities: ['fixture.greeting'] },
  config: options,
  setup(ctx) {
    const salutation = (ctx.config as { salutation?: string }).salutation ?? 'Hello'
    ctx.services.provide(GREETING_SERVICE, { greet: (name) => `${salutation}, ${name}!` })
    ctx.logger.info('greeting ready')
  },
}))
