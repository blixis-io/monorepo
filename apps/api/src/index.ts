import { createBlixis } from '@blixis/kernel'
import { z } from 'zod'
import { modules } from './blixis.config.ts'

// Workers forbid code generation (eval / new Function); keep Zod on its interpreter (ADR 0004).
z.config({ jitless: true })

const app = createBlixis({ modules })

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
} satisfies ExportedHandler<Env>
