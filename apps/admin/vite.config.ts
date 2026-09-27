import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Security headers for the admin Worker's static assets (`dist/_headers`, ADR 0017): the admin
 * talks only to its API, and nothing may frame it.
 */
function securityHeaders(apiUrl: string): Plugin {
  const api = new URL(apiUrl).origin
  return {
    name: 'blixis-security-headers',
    apply: 'build',
    generateBundle() {
      const csp = [
        "default-src 'self'",
        `connect-src 'self' ${api}`,
        `img-src 'self' data: blob: ${api}`,
        "style-src 'self'",
        "script-src 'self'",
        "font-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "form-action 'self'",
      ].join('; ')
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: `/*\n  Content-Security-Policy: ${csp}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n`,
      })
    },
  }
}

/**
 * The Management API origin per build mode. Public, so committed here; `VITE_BLIXIS_API_URL`
 * (environment or an ignored `.env.local`) overrides it.
 */
const API_URLS: Readonly<Record<string, string>> = {
  development: 'http://localhost:8787',
  staging: 'https://blixis-api-staging.frosty-hill-6079.workers.dev',
  // Set to https://api.<domain> once the production domain exists (plan 021).
  production: 'https://api.example.invalid',
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'VITE_')
  const apiUrl = env['VITE_BLIXIS_API_URL'] ?? API_URLS[mode] ?? API_URLS['development'] ?? ''
  return {
    plugins: [react(), tailwindcss(), securityHeaders(apiUrl)],
    define: { 'import.meta.env.VITE_BLIXIS_API_URL': JSON.stringify(apiUrl) },
    server: { port: 5173, strictPort: true },
    // No source maps on the public site; uploading them to Sentry comes with plan 020.
    build: { outDir: 'dist', sourcemap: false },
  }
})
