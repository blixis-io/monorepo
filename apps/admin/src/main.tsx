import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app.tsx'
import { applyTheme, savedTheme } from './lib/theme.ts'
import './styles.css'

applyTheme(savedTheme())
const root = document.getElementById('root')
if (root === null) throw new Error('#root is missing from index.html')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
