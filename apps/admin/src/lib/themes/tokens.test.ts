import { afterEach, describe, expect, it } from 'vitest'
import {
  applyTokens,
  DEFAULT_DARK,
  DEFAULT_LIGHT,
  invalidValue,
  parseThemeCss,
  resolveTokens,
  THEME_TOKENS,
  themeFromPreset,
} from './tokens.ts'
import { TWEAKCN_PRESETS } from './tweakcn-presets.ts'

/** The shape of tweakcn's "Code" export (Tailwind v4). */
const TWEAKCN_EXPORT = `
:root {
  --background: oklch(0.9818 0.0054 95.0986);
  --foreground: oklch(0.3438 0.0269 95.7226);
  --primary: oklch(0.6171 0.1375 39.0427);
  --font-sans: "Plus Jakarta Sans", sans-serif;
  --radius: 0.5rem;
  --shadow-x: 0px;
  --shadow-y: 2px;
  --shadow-color: hsl(0 0% 0%);
  --shadow-sm: 0px 2px 3px 0px hsl(0 0% 0% / 0.10); /* derived: ignored */
  --tracking-normal: 0.01em;
}

.dark {
  --background: oklch(0.2679 0.0036 106.6427);
  --primary: oklch(0.6724 0.1308 38.7559);
}

@theme inline {
  --color-background: var(--background);
}
`

afterEach(() => {
  applyTokens(null)
})

describe('theme CSS import', () => {
  it('reads the :root and .dark blocks of a tweakcn export', () => {
    const parsed = parseThemeCss(TWEAKCN_EXPORT)
    expect(parsed.problems).toEqual([])
    expect(parsed.light).toEqual({
      background: 'oklch(0.9818 0.0054 95.0986)',
      foreground: 'oklch(0.3438 0.0269 95.7226)',
      primary: 'oklch(0.6171 0.1375 39.0427)',
      'font-sans': '"Plus Jakarta Sans", sans-serif',
      radius: '0.5rem',
      'shadow-offset-x': '0px',
      'shadow-offset-y': '2px',
      'shadow-color': 'hsl(0 0% 0%)',
      'letter-spacing': '0.01em',
    })
    expect(parsed.dark).toEqual({
      background: 'oklch(0.2679 0.0036 106.6427)',
      primary: 'oklch(0.6724 0.1308 38.7559)',
    })
  })

  it('wraps Tailwind v3 HSL channels and skips unsafe values', () => {
    const parsed = parseThemeCss(`:root {
      --primary: 222.2 47.4% 11.2%;
      --accent: url(https://evil.example/x.png);
      --muted: red } body { display: none;
    }`)
    expect(parsed.light['primary']).toBe('hsl(222.2 47.4% 11.2%)')
    expect(parsed.light['accent']).toBeUndefined()
    expect(parsed.problems).toEqual(['--accent is not a plain CSS value'])
    expect(parseThemeCss('body { color: red }').problems[0]).toMatch(/No :root/)
  })

  it('fills missing values from the defaults, sharing fonts and radius with dark mode', () => {
    const { light, dark } = resolveTokens(parseThemeCss(TWEAKCN_EXPORT))
    expect(light['card']).toBe(DEFAULT_LIGHT['card'])
    expect(dark['card']).toBe(DEFAULT_DARK['card'])
    expect(dark['font-sans']).toBe('"Plus Jakarta Sans", sans-serif')
    expect(dark['radius']).toBe('0.5rem')
    expect(dark['primary']).toBe('oklch(0.6724 0.1308 38.7559)')
  })
})

describe('applying tokens', () => {
  it('sets the variables and derived shadows on <html>, and removes them again', () => {
    const root = document.documentElement
    applyTokens(resolveTokens(parseThemeCss(TWEAKCN_EXPORT)).light)
    expect(root.style.getPropertyValue('--primary')).toBe('oklch(0.6171 0.1375 39.0427)')
    expect(root.style.getPropertyValue('--tracking-normal')).toBe('0.01em')
    expect(root.style.getPropertyValue('--shadow-md')).toContain('0px 2px 3px 0px')
    applyTokens(null)
    expect(root.style.getPropertyValue('--primary')).toBe('')
    expect(root.style.getPropertyValue('--shadow-md')).toBe('')
  })

  it('never sets values that fail the rules', () => {
    applyTokens({ primary: 'url(x)', background: '#fff' })
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--background')).toBe('#fff')
  })
})

describe('tweakcn presets', () => {
  const presets = Object.entries(TWEAKCN_PRESETS)

  it('are all there', () => {
    expect(presets.length).toBeGreaterThanOrEqual(40)
  })

  it('resolve to themes the API accepts (known tokens, plain values, sizes)', () => {
    for (const [id, preset] of presets) {
      const theme = themeFromPreset(id, preset)
      expect(theme.name.length, id).toBeLessThanOrEqual(60)
      for (const mode of ['light', 'dark'] as const) {
        const tokens = theme[mode]
        expect(Object.keys(tokens).length, id).toBeLessThanOrEqual(80)
        for (const [name, value] of Object.entries(tokens)) {
          expect(THEME_TOKENS, `${id}.${mode}.${name}`).toContain(name)
          expect(name).toMatch(/^[a-z][a-z0-9-]{0,39}$/)
          expect(invalidValue(value), `${id}.${mode}.${name} = ${value}`).toBeUndefined()
        }
      }
    }
  })
})
