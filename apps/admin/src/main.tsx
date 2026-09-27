import { createBrowserSession } from '@blixis/sdk'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app.tsx'
import { API_URL } from './lib/config.ts'
import { applyTheme, savedTheme } from './lib/theme.ts'
import './styles.css'

applyTheme(savedTheme())
const session = createBrowserSession({ baseUrl: API_URL })
const root = document.getElementById('root')
if (root === null) throw new Error('#root is missing from index.html')
createRoot(root).render(
  <StrictMode>
    <App session={session} />
  </StrictMode>,
)
