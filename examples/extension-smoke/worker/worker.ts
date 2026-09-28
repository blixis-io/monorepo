// A Blixis app with the example plugin, installed from its tarball like any npm module. CI bundles
// it with `wrangler deploy --dry-run` to prove the plugin and the public packages build for
// Workers (plan 018.004). Behavior is tested by the plugin's own tests.

import seo from '@blixis-example/seo'
import { contentModule } from '@blixis-io/content'
import { databaseModule } from '@blixis-io/database'
import { eventsModule } from '@blixis-io/events'
import { graphqlModule } from '@blixis-io/graphql'
import { createBlixis } from '@blixis-io/kernel'
import { permissionsModule } from '@blixis-io/permissions'
import { spacesModule } from '@blixis-io/spaces'
import { usersModule } from '@blixis-io/users'
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
