import type { Theme, UserPreferences } from '@blixis/sdk'
import { applyTokens, invalidValue } from './themes/tokens.ts'

/** How the admin looks: the user's preferences as stored by the API (`/users/me/preferences`). */
export type Appearance = UserPreferences
export type ColorScheme = Appearance['colorScheme']

export const DEFAULT_APPEARANCE: Appearance = { colorScheme: 'system', theme: null }
const KEY = 'blixis.appearance'

const isTokens = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' &&
  value !== null &&
  Object.values(value).every((v) => typeof v === 'string' && invalidValue(v) === undefined)

const isTheme = (value: unknown): value is Theme => {
  const theme = value as Partial<Theme> | null
  return (
    typeof theme === 'object' &&
    theme !== null &&
    typeof theme.name === 'string' &&
    isTokens(theme.light) &&
    isTokens(theme.dark)
  )
}

/**
 * The appearance cached on this device, so the theme applies before the first paint (and on the
 * sign-in page). Storage can be unavailable or hold anything: fall back to the default.
 */
export function cachedAppearance(): Appearance {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Appearance> | null
    if (value === null) return DEFAULT_APPEARANCE
    const colorScheme = ['light', 'dark', 'system'].includes(String(value.colorScheme))
      ? (value.colorScheme as ColorScheme)
      : 'system'
    return { colorScheme, theme: isTheme(value.theme) ? value.theme : null }
  } catch {
    return DEFAULT_APPEARANCE
  }
}

/** Light or dark, resolving `system` with the OS setting. */
export function resolvedMode(scheme: ColorScheme): 'light' | 'dark' {
  if (scheme !== 'system') return scheme
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches === true ? 'dark' : 'light'
}

/** Applies an appearance to `<html>` and caches it on this device. */
export function applyAppearance(appearance: Appearance): void {
  const mode = resolvedMode(appearance.colorScheme)
  document.documentElement.classList.toggle('dark', mode === 'dark')
  document.documentElement.style.colorScheme = mode
  applyTokens(appearance.theme === null ? null : appearance.theme[mode])
  try {
    localStorage.setItem(KEY, JSON.stringify(appearance))
  } catch {}
}
