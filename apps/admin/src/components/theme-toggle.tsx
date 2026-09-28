import { Monitor, Moon, Sun } from 'lucide-react'
import type { ColorScheme } from '../lib/appearance.ts'
import { useAppearance } from '../lib/appearance-context.tsx'
import { Button } from './ui/button.tsx'

const NEXT: Record<ColorScheme, ColorScheme> = { system: 'light', light: 'dark', dark: 'system' }
const LABEL: Record<ColorScheme, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
}

/** Cycles the color scheme system → light → dark; saved with the user's preferences. */
export function ThemeToggle() {
  const { appearance, update } = useAppearance()
  const scheme = appearance.colorScheme
  const Icon = scheme === 'light' ? Sun : scheme === 'dark' ? Moon : Monitor
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`${LABEL[scheme]} (change)`}
      onClick={() => update({ ...appearance, colorScheme: NEXT[scheme] })}
    >
      <Icon aria-hidden />
    </Button>
  )
}
