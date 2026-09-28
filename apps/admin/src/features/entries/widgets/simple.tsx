import { useState } from 'react'
import { Checkbox } from '../../../components/ui/checkbox.tsx'
import { Input } from '../../../components/ui/input.tsx'
import { NativeSelect } from '../../../components/ui/native-select.tsx'
import { Textarea } from '../../../components/ui/textarea.tsx'
import { fromLocalInput, toLocalInput } from '../values.ts'
import { settingsOf, type WidgetProps } from './types.ts'

const str = (value: unknown) => (typeof value === 'string' ? value : '')
const orUndefined = (value: string) => (value === '' ? undefined : value)

export function TextWidget({ id, field, value, onChange, invalid, describedBy }: WidgetProps) {
  const settings = settingsOf<{ format: string; maxLength: number }>(field)
  const type = settings.format === 'email' ? 'email' : settings.format === 'url' ? 'url' : 'text'
  return (
    <Input
      id={id}
      type={type}
      value={str(value)}
      maxLength={settings.maxLength ?? 256}
      spellCheck={settings.format === 'plain' || settings.format === undefined}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(event) => onChange(orUndefined(event.target.value))}
    />
  )
}

export function LongTextWidget({ id, field, value, onChange, invalid, describedBy }: WidgetProps) {
  const settings = settingsOf<{ maxLength: number }>(field)
  return (
    <Textarea
      id={id}
      rows={5}
      value={str(value)}
      maxLength={settings.maxLength ?? 50_000}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(event) => onChange(orUndefined(event.target.value))}
    />
  )
}

export function NumberWidget({ id, field, value, onChange, invalid, describedBy }: WidgetProps) {
  const settings = settingsOf<{ integer: boolean; min: number; max: number }>(field)
  return (
    <Input
      id={id}
      type="number"
      inputMode={settings.integer ? 'numeric' : 'decimal'}
      step={settings.integer ? 1 : 'any'}
      min={settings.min}
      max={settings.max}
      value={typeof value === 'number' ? value : ''}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(event) =>
        onChange(event.target.value === '' ? undefined : Number(event.target.value))
      }
    />
  )
}

export function BooleanWidget({ field, value, onChange }: WidgetProps) {
  return (
    <Checkbox
      label={`${field.name}: yes`}
      checked={value === true}
      onChange={(checked) => onChange(checked)}
    />
  )
}

export function DateWidget({ id, field, value, onChange, invalid, describedBy }: WidgetProps) {
  const settings = settingsOf<{ min: string; max: string }>(field)
  return (
    <Input
      id={id}
      type="date"
      min={settings.min}
      max={settings.max}
      value={str(value)}
      className="max-w-56"
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(event) => onChange(orUndefined(event.target.value))}
    />
  )
}

export function DateTimeWidget({ id, value, onChange, invalid, describedBy }: WidgetProps) {
  return (
    <Input
      id={id}
      type="datetime-local"
      value={toLocalInput(value)}
      className="max-w-64"
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(event) => onChange(fromLocalInput(event.target.value))}
    />
  )
}

export function SelectWidget({ id, field, value, onChange, invalid, describedBy }: WidgetProps) {
  const settings = settingsOf<{ options: { value: string; label: string }[]; multiple: boolean }>(
    field,
  )
  const options = settings.options ?? []
  if (settings.multiple === true) {
    const selected = Array.isArray(value) ? (value as string[]) : []
    return (
      <fieldset className="flex flex-wrap gap-x-4 gap-y-2" aria-describedby={describedBy}>
        <legend className="sr-only">{field.name}</legend>
        {options.map((option) => (
          <Checkbox
            key={option.value}
            label={option.label}
            checked={selected.includes(option.value)}
            onChange={(checked) => {
              const next = checked
                ? options
                    .map((o) => o.value)
                    .filter((v) => v === option.value || selected.includes(v))
                : selected.filter((v) => v !== option.value)
              onChange(next.length === 0 ? undefined : next)
            }}
          />
        ))}
      </fieldset>
    )
  }
  return (
    <NativeSelect
      id={id}
      value={str(value)}
      className="max-w-sm"
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(event) => onChange(orUndefined(event.target.value))}
    >
      <option value="">None</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </NativeSelect>
  )
}

export function JsonWidget({ id, value, onChange, invalid, describedBy }: WidgetProps) {
  const [text, setText] = useState(value === undefined ? '' : JSON.stringify(value, null, 2))
  const [broken, setBroken] = useState(false)
  return (
    <div className="grid gap-1">
      <Textarea
        id={id}
        rows={6}
        value={text}
        spellCheck={false}
        className="font-mono text-xs"
        aria-invalid={invalid || broken || undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          setText(event.target.value)
          if (event.target.value.trim() === '') {
            setBroken(false)
            onChange(undefined)
            return
          }
          try {
            onChange(JSON.parse(event.target.value))
            setBroken(false)
          } catch {
            setBroken(true)
          }
        }}
      />
      {broken ? (
        <p className="text-sm text-destructive">
          Not valid JSON yet; the last valid value is kept.
        </p>
      ) : null}
    </div>
  )
}
