import type { Theme } from '@blixis-io/sdk'
import { useQuery } from '@tanstack/react-query'
import { createRoute } from '@tanstack/react-router'
import { Check, ExternalLink, Monitor, Moon, Sun } from 'lucide-react'
import { useId, useState } from 'react'
import { Alert } from '../components/ui/alert.tsx'
import { Button } from '../components/ui/button.tsx'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.tsx'
import { Input } from '../components/ui/input.tsx'
import { Label } from '../components/ui/label.tsx'
import { type ColorScheme, resolvedMode } from '../lib/appearance.ts'
import { useAppearance } from '../lib/appearance-context.tsx'
import {
  DEFAULT_DARK,
  DEFAULT_LIGHT,
  type PresetDefinition,
  parseThemeCss,
  resolveTokens,
  type Tokens,
  themeFromPreset,
} from '../lib/themes/tokens.ts'
import { toast } from '../lib/toast.ts'
import { cn } from '../lib/utils.ts'
import { appRoute } from './app-layout.tsx'

export const appearanceRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/appearance',
  component: AppearancePage,
})

/** The tweakcn presets are about 100 kB: load them with this page only. */
const presetsQuery = {
  queryKey: ['tweakcn-presets'],
  queryFn: async () => (await import('../lib/themes/tweakcn-presets.ts')).TWEAKCN_PRESETS,
  staleTime: Number.POSITIVE_INFINITY,
}

const SCHEMES: { value: ColorScheme; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

function AppearancePage() {
  const { appearance, update } = useAppearance()
  const presets = useQuery(presetsQuery)
  const mode = resolvedMode(appearance.colorScheme)
  const current = appearance.theme

  const choose = (theme: Theme | null) => {
    update({ ...appearance, theme })
    toast({ title: theme === null ? 'Default theme' : `Theme: ${theme.name}` })
  }

  return (
    <section className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Appearance</h1>
        <p className="text-sm text-muted-foreground">
          Your color scheme and theme, saved to your account and used on every device.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Color scheme</CardTitle>
        </CardHeader>
        <CardContent>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Color scheme</legend>
            {SCHEMES.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant={appearance.colorScheme === value ? 'default' : 'outline'}
                aria-pressed={appearance.colorScheme === value}
                onClick={() => update({ ...appearance, colorScheme: value })}
              >
                <Icon aria-hidden />
                {label}
              </Button>
            ))}
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>
            Current:{' '}
            <span className="font-medium text-foreground">{current?.name ?? 'Default'}</span>.
            Presets from{' '}
            <a
              href="https://tweakcn.com"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              tweakcn
            </a>
            ; fonts show when installed on your device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {presets.isPending ? <p role="status">Loading themes…</p> : null}
          {presets.isError ? (
            <Alert variant="destructive">
              Couldn’t load the theme presets. Reload to try again.
            </Alert>
          ) : null}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Themes">
            <li>
              <ThemeButton
                label="Default"
                tokens={mode === 'dark' ? DEFAULT_DARK : DEFAULT_LIGHT}
                selected={current === null}
                onSelect={() => choose(null)}
              />
            </li>
            {Object.entries(presets.data ?? {}).map(([id, preset]) => (
              <li key={id}>
                <ThemeButton
                  label={preset.label}
                  tokens={previewTokens(preset, mode)}
                  selected={current?.preset === id}
                  onSelect={() => choose(themeFromPreset(id, preset))}
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <ImportTheme onImport={choose} />
    </section>
  )
}

const previewTokens = (preset: PresetDefinition, mode: 'light' | 'dark') =>
  resolveTokens(preset)[mode]

/** A theme choice with swatches of its main colors, in the current mode. */
function ThemeButton({
  label,
  tokens,
  selected,
  onSelect,
}: {
  label: string
  tokens: Tokens
  selected: boolean
  onSelect: () => void
}) {
  const swatches = ['primary', 'secondary', 'accent', 'muted'] as const
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'grid w-full gap-2 rounded-md border p-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      <span
        className="flex h-10 items-center gap-1 rounded-sm border border-border px-2"
        style={{ background: tokens['background'] }}
        aria-hidden
      >
        {swatches.map((name) => (
          <span key={name} className="size-5 rounded-full" style={{ background: tokens[name] }} />
        ))}
      </span>
      <span className="flex items-center justify-between gap-1">
        <span className="truncate">{label}</span>
        {selected ? <Check aria-hidden className="size-4 shrink-0" /> : null}
      </span>
    </button>
  )
}

/** Paste the CSS from tweakcn's editor ("Code") to use your own theme. */
function ImportTheme({ onImport }: { onImport: (theme: Theme) => void }) {
  const id = useId()
  const [css, setCss] = useState('')
  const [name, setName] = useState('')
  const [problems, setProblems] = useState<readonly string[]>([])

  const submit = () => {
    const parsed = parseThemeCss(css)
    setProblems(parsed.problems)
    if (Object.keys(parsed.light).length === 0) return
    onImport({
      name: name.trim() === '' ? 'Custom theme' : name.trim().slice(0, 60),
      preset: null,
      // Missing values (or a missing .dark block) fall back to the defaults, as in tweakcn.
      ...resolveTokens({ light: parsed.light, dark: parsed.dark }),
    })
    if (parsed.problems.length === 0) setCss('')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your own theme</CardTitle>
        <CardDescription>
          Design a theme in the{' '}
          <a
            href="https://tweakcn.com/editor/theme"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline underline-offset-2"
          >
            tweakcn editor
            <ExternalLink aria-hidden className="size-3" />
          </a>
          , choose Code, copy the CSS, and paste it here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input
              id={`${id}-name`}
              value={name}
              maxLength={60}
              placeholder="Custom theme"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-css`}>Theme CSS</Label>
            <textarea
              id={`${id}-css`}
              value={css}
              onChange={(event) => setCss(event.target.value)}
              rows={8}
              spellCheck={false}
              placeholder={
                ':root {\n  --background: oklch(1 0 0);\n  --primary: oklch(0.55 0.2 260);\n  …\n}\n.dark {\n  …\n}'
              }
              aria-describedby={problems.length > 0 ? `${id}-problems` : undefined}
              className="min-h-40 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {problems.length > 0 ? (
            <Alert variant="destructive" id={`${id}-problems`}>
              <p className="font-medium">
                {problems.length === 1 ? 'One value was skipped' : `${problems.length} problems`}
              </p>
              <ul className="list-disc pl-5">
                {problems.slice(0, 8).map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
          <div>
            <Button type="submit" disabled={css.trim() === ''}>
              Use this theme
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
