import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Component tests in a DOM (jsdom); the admin talks to the API only through @blixis/sdk.
export default defineConfig({
  plugins: [react()],
  test: {
    name: 'admin',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
  },
})
