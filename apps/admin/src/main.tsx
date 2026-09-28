import { createBrowserSession } from '@blixis-io/sdk'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app.tsx'
import { applyAppearance, cachedAppearance } from './lib/appearance.ts'
import { API_URL } from './lib/config.ts'
import './styles.css'

applyAppearance(cachedAppearance())
const session = createBrowserSession({ baseUrl: API_URL })
const root = document.getElementById('root')
if (root === null) throw new Error('#root is missing from index.html')
createRoot(root).render(
  <StrictMode>
    <App session={session} />
  </StrictMode>,
)
