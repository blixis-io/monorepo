import type { ContentType } from '@blixis-io/sdk'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '../../components/ui/button.tsx'
import { Checkbox } from '../../components/ui/checkbox.tsx'
import { Input } from '../../components/ui/input.tsx'
import { Label } from '../../components/ui/label.tsx'
import { NativeSelect } from '../../components/ui/native-select.tsx'
import { Textarea } from '../../components/ui/textarea.tsx'
import { humanize, type SettingUi } from './ui-registry.ts'

/** The subset of JSON Schema the API's field type settings use (`z.toJSONSchema`, input side). */
export interface JsonSchema {
  readonly type?: string
  readonly properties?: Readonly<Record<string, JsonSchema>>
  readonly required?: readonly string[]
  readonly enum?: readonly unknown[]
  readonly items?: JsonSchema
  readonly default?: unknown
  readonly minimum?: number
  readonly maximum?: number
  readonly minItems?: number
  readonly maxItems?: number
  readonly maxLength?: number
  readonly format?: string
  /** From Zod `.meta({ title })`: the label. */
  readonly title?: string
  /** From Zod `.describe()`: the hint. */
  readonly description?: string
}

type Settings = Readonly<Record<string, unknown>>
type Pickable = Pick<ContentType, 'id' | 'name' | 'kind'>

/**
 * A settings form generated from a field type's settings schema, with labels and pickers from the
 * UI registry. Unset values stay unset (the server applies defaults); the server validates.
 */
export function SettingsForm({
  schema,
  value,
  onChange,
  ui = {},
  contentTypes,
}: {
  schema: JsonSchema
  value: Settings
  onChange: (next: Settings) => void
  ui?: Readonly<Record<string, SettingUi>>
  contentTypes: readonly Pickable[]
}) {
  const properties = Object.entries(schema.properties ?? {})
  if (schema.type !== 'object' || properties.length === 0)
    return <p className="text-sm text-muted-foreground">This field type has no settings.</p>
  const set = (key: string, next: unknown) => onChange({ ...value, [key]: next })
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {properties.map(([key, property]) => (
        <Setting
          key={key}
          name={key}
          schema={property}
          value={value[key]}
          required={schema.required?.includes(key) ?? false}
          ui={{
            ...(property.title === undefined ? {} : { label: property.title }),
            ...(property.description === undefined ? {} : { hint: property.description }),
            ...ui[key],
          }}
          contentTypes={contentTypes}
          onChange={(next) => set(key, next)}
        />
      ))}
    </div>
  )
}

function Setting({
  name,
  schema,
  value,
  required,
  ui,
  contentTypes,
  onChange,
}: {
  name: string
  schema: JsonSchema
  value: unknown
  required: boolean
  ui: SettingUi
  contentTypes: readonly Pickable[]
  onChange: (next: unknown) => void
}) {
  const id = useId()
  const label = `${ui.label ?? humanize(name)}${required ? ' (required)' : ''}`
  const hint =
    ui.hint === undefined ? null : (
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {ui.hint}
      </p>
    )
  const describedBy = ui.hint === undefined ? undefined : `${id}-hint`
  const current = value ?? schema.default

  if (schema.type === 'boolean')
    return (
      <Checkbox
        label={label}
        hint={ui.hint}
        checked={current === true}
        onChange={(checked) => onChange(checked)}
        className="sm:col-span-2"
      />
    )

  if ((schema.type === 'integer' || schema.type === 'number') && schema.enum === undefined)
    return (
      <div className="grid content-start gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          type="number"
          inputMode={schema.type === 'integer' ? 'numeric' : 'decimal'}
          step={schema.type === 'integer' ? 1 : 'any'}
          min={schema.minimum}
          max={schema.maximum !== undefined && schema.maximum < 1e15 ? schema.maximum : undefined}
          value={typeof value === 'number' ? value : ''}
          placeholder={typeof schema.default === 'number' ? String(schema.default) : ''}
          aria-describedby={describedBy}
          onChange={(event) =>
            onChange(event.target.value === '' ? undefined : Number(event.target.value))
          }
        />
        {hint}
      </div>
    )

  if (schema.type === 'string' && schema.enum !== undefined)
    return (
      <div className="grid content-start gap-2">
        <Label htmlFor={id}>{label}</Label>
        <NativeSelect
          id={id}
          value={String(current ?? '')}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        >
          {current === undefined ? <option value="">Choose…</option> : null}
          {schema.enum.map((option) => (
            <option key={String(option)} value={String(option)}>
              {humanize(String(option))}
            </option>
          ))}
        </NativeSelect>
        {hint}
      </div>
    )

  if (schema.type === 'string')
    return (
      <div className="grid content-start gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          type={schema.format === 'date' ? 'date' : 'text'}
          value={typeof value === 'string' ? value : ''}
          maxLength={schema.maxLength}
          spellCheck={false}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
        />
        {hint}
      </div>
    )

  if (schema.type === 'array' && schema.items !== undefined) {
    const items = schema.items
    const list = Array.isArray(current) ? (current as unknown[]) : []
    const choices =
      items.enum ??
      (items.type === 'integer' &&
      items.minimum !== undefined &&
      items.maximum !== undefined &&
      items.maximum - items.minimum <= 12
        ? Array.from(
            { length: items.maximum - items.minimum + 1 },
            (_, i) => (items.minimum ?? 0) + i,
          )
        : undefined)

    if (choices !== undefined)
      return (
        <CheckboxGroup
          label={label}
          hint={ui.hint}
          options={choices.map((c) => ({ value: c, label: humanize(String(c)) }))}
          selected={list}
          onChange={onChange}
        />
      )

    if (ui.widget !== undefined) {
      const kind = ui.widget === 'components' ? 'component' : 'entry'
      const options = contentTypes.filter((t) => t.kind === kind)
      return (
        <CheckboxGroup
          label={label}
          hint={ui.hint}
          empty={
            kind === 'component' ? 'No components yet: create one first.' : 'No content types yet.'
          }
          options={options.map((t) => ({ value: t.id, label: t.name }))}
          selected={list}
          onChange={onChange}
        />
      )
    }

    if (items.type === 'string')
      return (
        <ListOfStrings
          id={id}
          label={label}
          hint={hint}
          describedBy={describedBy}
          value={list.map(String)}
          onChange={onChange}
        />
      )

    if (items.type === 'object' && items.properties !== undefined)
      return (
        <ObjectList
          label={label}
          hint={ui.hint}
          schema={items}
          value={list as Record<string, unknown>[]}
          onChange={onChange}
        />
      )
  }

  return (
    <JsonSetting
      id={id}
      label={label}
      hint={hint}
      describedBy={describedBy}
      value={value}
      onChange={onChange}
    />
  )
}

function CheckboxGroup({
  label,
  hint,
  empty,
  options,
  selected,
  onChange,
}: {
  label: string
  hint?: string | undefined
  empty?: string
  options: readonly { value: unknown; label: string }[]
  selected: readonly unknown[]
  onChange: (next: unknown[]) => void
}) {
  return (
    <fieldset className="grid content-start gap-2 sm:col-span-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      {hint === undefined ? null : <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>}
      {options.length === 0 && empty !== undefined ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : null}
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {options.map((option) => (
          <Checkbox
            key={String(option.value)}
            label={option.label}
            checked={selected.includes(option.value)}
            onChange={(checked) =>
              onChange(
                checked
                  ? options
                      .map((o) => o.value)
                      .filter((v) => v === option.value || selected.includes(v))
                  : selected.filter((v) => v !== option.value),
              )
            }
          />
        ))}
      </div>
    </fieldset>
  )
}

/** Comma-separated strings (e.g. MIME types); kept as typed until the field loses focus. */
function ListOfStrings({
  id,
  label,
  hint,
  describedBy,
  value,
  onChange,
}: {
  id: string
  label: string
  hint: React.ReactNode
  describedBy: string | undefined
  value: string[]
  onChange: (next: string[] | undefined) => void
}) {
  const [text, setText] = useState(value.join(', '))
  return (
    <div className="grid content-start gap-2 sm:col-span-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={text}
        spellCheck={false}
        aria-describedby={describedBy}
        onChange={(event) => {
          setText(event.target.value)
          const items = event.target.value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
          onChange(items.length === 0 ? undefined : items)
        }}
      />
      {hint}
    </div>
  )
}

/** Rows of objects (e.g. select options: value and label). */
function ObjectList({
  label,
  hint,
  schema,
  value,
  onChange,
}: {
  label: string
  hint?: string | undefined
  schema: JsonSchema
  value: Record<string, unknown>[]
  onChange: (next: Record<string, unknown>[]) => void
}) {
  const keys = Object.keys(schema.properties ?? {})
  const update = (index: number, key: string, next: string) =>
    onChange(value.map((row, i) => (i === index ? { ...row, [key]: next } : row)))
  const move = (index: number, by: -1 | 1) => {
    const next = [...value]
    const [row] = next.splice(index, 1)
    if (row !== undefined) next.splice(index + by, 0, row)
    onChange(next)
  }
  return (
    <fieldset className="grid content-start gap-2 sm:col-span-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      {hint === undefined ? null : <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>}
      {value.map((row, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity of their own
        <div key={index} className="flex items-center gap-2">
          {keys.map((key) => (
            <Input
              key={key}
              aria-label={`${humanize(key)} ${index + 1}`}
              placeholder={humanize(key)}
              value={String(row[key] ?? '')}
              onChange={(event) => update(index, key, event.target.value)}
            />
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move row ${index + 1} up`}
            disabled={index === 0}
            onClick={() => move(index, -1)}
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move row ${index + 1} down`}
            disabled={index === value.length - 1}
            onClick={() => move(index, 1)}
          >
            <ArrowDown aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove row ${index + 1}`}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...value, Object.fromEntries(keys.map((k) => [k, '']))])}
        >
          <Plus aria-hidden />
          Add
        </Button>
      </div>
    </fieldset>
  )
}

/** Anything the generator doesn't know: edit the JSON value directly. */
function JsonSetting({
  id,
  label,
  hint,
  describedBy,
  value,
  onChange,
}: {
  id: string
  label: string
  hint: React.ReactNode
  describedBy: string | undefined
  value: unknown
  onChange: (next: unknown) => void
}) {
  const [text, setText] = useState(value === undefined ? '' : JSON.stringify(value, null, 2))
  const [invalid, setInvalid] = useState(false)
  return (
    <div className="grid content-start gap-2 sm:col-span-2">
      <Label htmlFor={id}>{label} (JSON)</Label>
      <Textarea
        id={id}
        value={text}
        spellCheck={false}
        className="font-mono text-xs"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          setText(event.target.value)
          if (event.target.value.trim() === '') {
            setInvalid(false)
            onChange(undefined)
            return
          }
          try {
            onChange(JSON.parse(event.target.value))
            setInvalid(false)
          } catch {
            setInvalid(true)
          }
        }}
      />
      {invalid ? <p className="text-sm text-destructive">Not valid JSON yet.</p> : null}
      {hint}
    </div>
  )
}
