import type { Theme } from '@blixis-io/sdk'

/**
 * Theme tokens: the shadcn/ui variable set as tweakcn (https://tweakcn.com) edits it. Each token
 * is a CSS custom property (`--primary`, …) on `<html>`; `styles.css` maps them to Tailwind.
 */
export const COLOR_TOKENS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring',
  'shadow-color',
] as const

/** Tokens tweakcn keeps equal in both modes: a preset's light value also applies to dark. */
export const SHARED_TOKENS = [
  'font-sans',
  'font-serif',
  'font-mono',
  'radius',
  'shadow-opacity',
  'shadow-blur',
  'shadow-spread',
  'shadow-offset-x',
  'shadow-offset-y',
  'letter-spacing',
  'spacing',
] as const

export const THEME_TOKENS: readonly string[] = [...COLOR_TOKENS, ...SHARED_TOKENS]
const KNOWN = new Set(THEME_TOKENS)

export type Tokens = Readonly<Record<string, string>>

/** A preset as tweakcn defines it: overrides of the default theme. */
export interface PresetDefinition {
  readonly label: string
  readonly light: Tokens
  readonly dark: Tokens
}

const FONT_SANS =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif"
const FONT_SERIF = 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif'
const FONT_MONO =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

/** The default theme (tweakcn's default, neutral shadcn/ui); also in `styles.css`. */
export const DEFAULT_LIGHT: Tokens = {
  background: 'oklch(1 0 0)',
  foreground: 'oklch(0.145 0 0)',
  card: 'oklch(1 0 0)',
  'card-foreground': 'oklch(0.145 0 0)',
  popover: 'oklch(1 0 0)',
  'popover-foreground': 'oklch(0.145 0 0)',
  primary: 'oklch(0.205 0 0)',
  'primary-foreground': 'oklch(0.985 0 0)',
  secondary: 'oklch(0.97 0 0)',
  'secondary-foreground': 'oklch(0.205 0 0)',
  muted: 'oklch(0.97 0 0)',
  'muted-foreground': 'oklch(0.556 0 0)',
  accent: 'oklch(0.97 0 0)',
  'accent-foreground': 'oklch(0.205 0 0)',
  destructive: 'oklch(0.577 0.245 27.325)',
  'destructive-foreground': 'oklch(1 0 0)',
  border: 'oklch(0.922 0 0)',
  input: 'oklch(0.922 0 0)',
  ring: 'oklch(0.708 0 0)',
  'chart-1': 'oklch(0.81 0.1 252)',
  'chart-2': 'oklch(0.62 0.19 260)',
  'chart-3': 'oklch(0.55 0.22 263)',
  'chart-4': 'oklch(0.49 0.22 264)',
  'chart-5': 'oklch(0.42 0.18 266)',
  sidebar: 'oklch(0.985 0 0)',
  'sidebar-foreground': 'oklch(0.145 0 0)',
  'sidebar-primary': 'oklch(0.205 0 0)',
  'sidebar-primary-foreground': 'oklch(0.985 0 0)',
  'sidebar-accent': 'oklch(0.97 0 0)',
  'sidebar-accent-foreground': 'oklch(0.205 0 0)',
  'sidebar-border': 'oklch(0.922 0 0)',
  'sidebar-ring': 'oklch(0.708 0 0)',
  'shadow-color': 'oklch(0 0 0)',
  'font-sans': FONT_SANS,
  'font-serif': FONT_SERIF,
  'font-mono': FONT_MONO,
  radius: '0.625rem',
  'shadow-opacity': '0.1',
  'shadow-blur': '3px',
  'shadow-spread': '0px',
  'shadow-offset-x': '0',
  'shadow-offset-y': '1px',
  'letter-spacing': '0em',
  spacing: '0.25rem',
}

export const DEFAULT_DARK: Tokens = {
  ...DEFAULT_LIGHT,
  background: 'oklch(0.145 0 0)',
  foreground: 'oklch(0.985 0 0)',
  card: 'oklch(0.205 0 0)',
  'card-foreground': 'oklch(0.985 0 0)',
  popover: 'oklch(0.269 0 0)',
  'popover-foreground': 'oklch(0.985 0 0)',
  primary: 'oklch(0.922 0 0)',
  'primary-foreground': 'oklch(0.205 0 0)',
  secondary: 'oklch(0.269 0 0)',
  'secondary-foreground': 'oklch(0.985 0 0)',
  muted: 'oklch(0.269 0 0)',
  'muted-foreground': 'oklch(0.708 0 0)',
  accent: 'oklch(0.371 0 0)',
  'accent-foreground': 'oklch(0.985 0 0)',
  destructive: 'oklch(0.704 0.191 22.216)',
  'destructive-foreground': 'oklch(0.985 0 0)',
  border: 'oklch(0.275 0 0)',
  input: 'oklch(0.325 0 0)',
  ring: 'oklch(0.556 0 0)',
  sidebar: 'oklch(0.205 0 0)',
  'sidebar-foreground': 'oklch(0.985 0 0)',
  'sidebar-primary': 'oklch(0.488 0.243 264.376)',
  'sidebar-primary-foreground': 'oklch(0.985 0 0)',
  'sidebar-accent': 'oklch(0.269 0 0)',
  'sidebar-accent-foreground': 'oklch(0.985 0 0)',
  'sidebar-border': 'oklch(0.275 0 0)',
  'sidebar-ring': 'oklch(0.439 0 0)',
}

const pick = (tokens: Tokens, names: readonly string[]) =>
  Object.fromEntries(names.flatMap((n) => (tokens[n] === undefined ? [] : [[n, tokens[n]]])))

/** Complete light and dark token sets: the overrides on top of the defaults, as tweakcn does. */
export function resolveTokens(overrides: { light: Tokens; dark: Tokens }): {
  light: Tokens
  dark: Tokens
} {
  const light = { ...DEFAULT_LIGHT, ...pick(overrides.light, THEME_TOKENS) }
  const dark = {
    ...DEFAULT_DARK,
    ...pick(overrides.light, SHARED_TOKENS),
    ...pick(overrides.dark, THEME_TOKENS),
  }
  return { light, dark }
}

/** A saveable theme from a preset. */
export function themeFromPreset(id: string, preset: PresetDefinition): Theme {
  return { name: preset.label, preset: id, ...resolveTokens(preset) }
}

const VALUE = /^[\w\s#%.,()/+*'"-]+$/
const LOADS = /\b(?:url|image|image-set|expression|src|attr|env)\s*\(/i

/**
 * Why a token value can't be used, or `undefined` if it can. The same rule as the API: CSS colors,
 * lengths, numbers, and font lists only — nothing that loads resources or ends the declaration.
 */
export function invalidValue(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed === '' || trimmed.length > 200) return 'must be 1–200 characters'
  if (!VALUE.test(trimmed) || LOADS.test(trimmed)) return 'is not a plain CSS value'
  return undefined
}

/** The result of reading theme CSS. */
export interface ParsedThemeCss {
  readonly light: Tokens
  readonly dark: Tokens
  /** Problems worth showing (invalid values, missing blocks). */
  readonly problems: readonly string[]
}

/** Names in tweakcn's exported CSS that map to a differently named token. */
const ALIASES: Readonly<Record<string, string>> = {
  'shadow-x': 'shadow-offset-x',
  'shadow-y': 'shadow-offset-y',
  'tracking-normal': 'letter-spacing',
}

/**
 * Reads the CSS that tweakcn exports ("Code" → Tailwind v4 or v3): the `:root` and `.dark` blocks.
 * Unknown variables (e.g. the derived `--shadow-sm`) are ignored; bare HSL channels from Tailwind v3
 * exports (`222 47% 11%`) become `hsl(…)`.
 */
export function parseThemeCss(css: string): ParsedThemeCss {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const problems: string[] = []
  const block = (selector: RegExp) => {
    const tokens: Record<string, string> = {}
    for (const match of text.matchAll(selector)) {
      for (const declaration of (match[1] ?? '').split(';')) {
        const found = /^\s*--([a-z0-9-]+)\s*:\s*([\s\S]+?)\s*$/.exec(declaration)
        if (found === null) continue
        const raw = found[1] ?? ''
        const name = ALIASES[raw] ?? raw
        if (!KNOWN.has(name)) continue
        let value = found[2] ?? ''
        if (
          (COLOR_TOKENS as readonly string[]).includes(name) &&
          /^\d[\d.]*\s+[\d.]+%\s+[\d.]+%/.test(value)
        )
          value = `hsl(${value})`
        const problem = invalidValue(value)
        if (problem === undefined) tokens[name] = value
        else problems.push(`--${raw} ${problem}`)
      }
    }
    return tokens
  }
  const light = block(/:root\s*\{([^}]*)\}/g)
  const dark = block(/\.dark\s*\{([^}]*)\}/g)
  if (Object.keys(light).length === 0)
    problems.unshift('No :root { … } block with theme variables found')
  return { light, dark, problems }
}

/** Tokens derived from the base ones (shadows, letter spacing), as Tailwind reads them. */
function derived(tokens: Tokens): Record<string, string> {
  const x = tokens['shadow-offset-x'] ?? '0'
  const y = tokens['shadow-offset-y'] ?? '1px'
  const blur = tokens['shadow-blur'] ?? '3px'
  const spread = tokens['shadow-spread'] ?? '0px'
  const opacity = Number.parseFloat(tokens['shadow-opacity'] ?? '0.1')
  const color = tokens['shadow-color'] ?? 'oklch(0 0 0)'
  const tint = (factor: number) =>
    `color-mix(in oklab, ${color} ${Math.min(100, Math.max(0, (Number.isFinite(opacity) ? opacity : 0.1) * factor * 100)).toFixed(1)}%, transparent)`
  const spread2 = `calc(${spread} - 1px)`
  const layer = `${x} ${y} ${blur} ${spread}`
  const two = (offsetY: string, blur2: string) =>
    `${layer} ${tint(1)}, ${x} ${offsetY} ${blur2} ${spread2} ${tint(1)}`
  return {
    'shadow-2xs': `${layer} ${tint(0.5)}`,
    'shadow-xs': `${layer} ${tint(0.5)}`,
    'shadow-sm': two('1px', '2px'),
    shadow: two('1px', '2px'),
    'shadow-md': two('2px', '4px'),
    'shadow-lg': two('4px', '6px'),
    'shadow-xl': two('8px', '10px'),
    'shadow-2xl': `${layer} ${tint(2.5)}`,
    'tracking-normal': tokens['letter-spacing'] ?? '0em',
  }
}

const APPLIED = [...THEME_TOKENS, ...Object.keys(derived({}))]

/**
 * Sets the theme's tokens on an element (default `<html>`) through the CSSOM — allowed by the
 * admin's Content-Security-Policy, unlike injected `<style>` elements. `null` restores the default
 * theme from `styles.css`.
 */
export function applyTokens(
  tokens: Tokens | null,
  element: HTMLElement = document.documentElement,
) {
  for (const name of APPLIED) element.style.removeProperty(`--${name}`)
  if (tokens === null) return
  for (const [name, value] of Object.entries({ ...tokens, ...derived(tokens) }))
    if (APPLIED.includes(name) && invalidValue(value) === undefined)
      element.style.setProperty(`--${name}`, value)
}
