// A Blixis app with the example plugin, installed from its tarball like any npm module. CI bundles
// it with `wrangler deploy --dry-run` to prove the plugin and the public packages build for
// Workers (plan 018.004). Behavior is tested by the plugin's own tests.

import { contentModule } from '@blixis/content'
import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { graphqlModule } from '@blixis/graphql'
import { createBlixis } from '@blixis/kernel'
import { permissionsModule } from '@blixis/permissions'
import { spacesModule } from '@blixis/spaces'
import { usersModule } from '@blixis/users'
import seo from '@blixis-example/seo'
import { z } from 'zod'

z.config({ jitless: true })

const app = createBlixis({
  modules: [
    databaseModule(),
    eventsModule(),
    usersModule(),
    spacesModule(),
    permissionsModule(),
    contentModule(),
    graphqlModule(),
    seo({ defaultTitle: 'Smoke' }),
  ],
})

export default { fetch: (request: Request, env: unknown) => app.fetch(request, env) }
