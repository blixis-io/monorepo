// @ts-check
import { defineConfig } from 'astro/config'

// Static output: every page is rendered at build time from the Blixis delivery API.
// Preview is a second build with BLIXIS_PREVIEW=1 (see README).
export default defineConfig({
  output: 'static',
  trailingSlash: 'ignore',
  telemetry: false,
})
