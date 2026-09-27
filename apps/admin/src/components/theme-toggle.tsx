import { Monitor, Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { applyTheme, savedTheme, type Theme } from '../lib/theme.ts'
import { Button } from './ui/button.tsx'

const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
const LABEL: Record<Theme, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
}

/** Cycles system → light → dark. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(savedTheme)
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`${LABEL[theme]} (change)`}
      onClick={() => {
        const next = NEXT[theme]
        applyTheme(next)
        setTheme(next)
      }}
    >
      <Icon aria-hidden />
    </Button>
  )
}
