export type Theme = 'light' | 'dark' | 'system'
const KEY = 'blixis.theme'

/** The saved theme; storage can be unavailable (private windows), then `system`. */
export function savedTheme(): Theme {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

/** Applies a theme to `<html>` and remembers it. */
export function applyTheme(theme: Theme): void {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true)
  document.documentElement.classList.toggle('dark', dark)
  try {
    if (theme === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {}
}
