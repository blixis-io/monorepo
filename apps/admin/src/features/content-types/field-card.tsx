import type { ContentType, FieldType } from '@blixis-io/sdk'
import { ArrowDown, ArrowUp, ChevronDown, Trash2 } from 'lucide-react'
import { useId } from 'react'
import { Button } from '../../components/ui/button.tsx'
import { Checkbox } from '../../components/ui/checkbox.tsx'
import { Input } from '../../components/ui/input.tsx'
import { Label } from '../../components/ui/label.tsx'
import { NativeSelect } from '../../components/ui/native-select.tsx'
import { cn } from '../../lib/utils.ts'
import type { ContentTypeDraft, FieldDraft } from './draft.ts'
import { type JsonSchema, SettingsForm } from './settings-form.tsx'
import { FIELD_TYPE_UI, fallbackIcon } from './ui-registry.ts'

/** One field of the content type: its basics, flags, condition, group, and type settings. */
export function FieldCard({
  field,
  draft,
  fieldType,
  contentTypes,
  index,
  count,
  open,
  issues,
  onToggle,
  onChange,
  onApiIdChange,
  onNameChange,
  onMove,
  onRemove,
}: {
  field: FieldDraft
  draft: ContentTypeDraft
  fieldType: FieldType | undefined
  contentTypes: readonly Pick<ContentType, 'id' | 'name' | 'kind'>[]
  index: number
  count: number
  open: boolean
  issues: readonly string[]
  onToggle: () => void
  onChange: (next: FieldDraft) => void
  onApiIdChange: (apiId: string) => void
  onNameChange: (name: string) => void
  onMove: (by: -1 | 1) => void
  onRemove: () => void
}) {
  const id = useId()
  const ui = FIELD_TYPE_UI[field.type]
  const Icon = ui?.icon ?? fallbackIcon
  const set = <K extends keyof FieldDraft>(key: K, value: FieldDraft[K]) =>
    onChange({ ...field, [key]: value })
  const localizable = fieldType?.localizable !== false
  // Conditions may use earlier, non-localized boolean or select fields.
  const conditionFields = draft.fields.filter(
    (f) => f.key !== field.key && !f.localized && (f.type === 'boolean' || f.type === 'select'),
  )
  const condition = conditionFields.find((f) => f.apiId === field.showWhen?.field)

  return (
    <li
      className={cn(
        'rounded-lg border bg-card text-card-foreground',
        issues.length > 0 ? 'border-destructive' : 'border-border',
        field.disabled && 'opacity-75',
      )}
      aria-labelledby={`${id}-title`}
    >
      <div className="flex items-center gap-2 p-3">
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <button
          type="button"
          id={`${id}-title`}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="truncate font-medium">{field.name || 'Untitled field'}</span>
          <code className="truncate font-mono text-xs text-muted-foreground">{field.apiId}</code>
          <span className="text-xs text-muted-foreground">
            {fieldType?.name ?? field.type}
            {field.required ? ' · required' : ''}
            {field.localized ? ' · localized' : ''}
            {field.disabled ? ' · disabled' : ''}
          </span>
          <ChevronDown
            aria-hidden
            className={cn('ml-auto size-4 shrink-0 transition-transform', open && 'rotate-180')}
          />
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Move ${field.name} up`}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          <ArrowUp aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Move ${field.name} down`}
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove ${field.name}`}
          onClick={onRemove}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
      {issues.length > 0 ? (
        <ul className="mx-3 mb-3 list-disc pl-5 text-sm text-destructive" role="alert">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <div id={`${id}-body`} className="grid gap-5 border-t border-border p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${id}-name`}>Name</Label>
              <Input
                id={`${id}-name`}
                value={field.name}
                maxLength={100}
                onChange={(event) => onNameChange(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-api`}>API ID</Label>
              <Input
                id={`${id}-api`}
                value={field.apiId}
                maxLength={64}
                spellCheck={false}
                aria-describedby={`${id}-api-hint`}
                onChange={(event) => onApiIdChange(event.target.value)}
              />
              <p id={`${id}-api-hint`} className="text-xs text-muted-foreground">
                camelCase; the key in the API. Renaming it changes the API for clients.
              </p>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor={`${id}-description`}>Help text</Label>
              <Input
                id={`${id}-description`}
                value={field.description}
                maxLength={500}
                placeholder="Shown to editors below the field"
                onChange={(event) => set('description', event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Checkbox
              label="Required"
              hint="Checked when publishing."
              checked={field.required}
              onChange={(v) => set('required', v)}
            />
            <Checkbox
              label="Localized"
              hint={localizable ? 'A value per locale.' : 'This field type can’t be localized.'}
              checked={field.localized}
              disabled={!localizable}
              onChange={(v) => set('localized', v)}
            />
            <Checkbox
              label="Hidden"
              hint="Not shown to editors."
              checked={field.hidden}
              onChange={(v) => set('hidden', v)}
            />
            <Checkbox
              label="Disabled"
              hint="Kept in entries, but no longer edited or delivered. Disable before removing a field that has values."
              checked={field.disabled}
              onChange={(v) => set('disabled', v)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {draft.groups.length > 0 ? (
              <div className="grid gap-2">
                <Label htmlFor={`${id}-group`}>Group</Label>
                <NativeSelect
                  id={`${id}-group`}
                  value={field.group}
                  onChange={(event) => set('group', event.target.value)}
                >
                  <option value="">No group</option>
                  {draft.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor={`${id}-when`}>Show only when</Label>
              <NativeSelect
                id={`${id}-when`}
                value={field.showWhen?.field ?? ''}
                onChange={(event) => {
                  const target = conditionFields.find((f) => f.apiId === event.target.value)
                  set(
                    'showWhen',
                    target === undefined
                      ? undefined
                      : { field: target.apiId, equals: target.type === 'boolean' ? true : '' },
                  )
                }}
              >
                <option value="">Always</option>
                {conditionFields.map((f) => (
                  <option key={f.key} value={f.apiId}>
                    {f.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {condition !== undefined && field.showWhen !== undefined ? (
              <div className="grid gap-2">
                <Label htmlFor={`${id}-equals`}>equals</Label>
                <NativeSelect
                  id={`${id}-equals`}
                  value={JSON.stringify(field.showWhen.equals)}
                  onChange={(event) =>
                    set('showWhen', {
                      field: condition.apiId,
                      equals: JSON.parse(event.target.value) as unknown,
                    })
                  }
                >
                  {condition.type === 'boolean' ? (
                    <>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </>
                  ) : (
                    <>
                      <option value={'""'}>Choose…</option>
                      {(
                        (condition.settings['options'] as
                          | { value: string; label: string }[]
                          | undefined) ?? []
                      ).map((o) => (
                        <option key={o.value} value={JSON.stringify(o.value)}>
                          {o.label}
                        </option>
                      ))}
                    </>
                  )}
                </NativeSelect>
              </div>
            ) : null}
          </div>

          <section aria-labelledby={`${id}-settings`} className="grid gap-3">
            <h4 id={`${id}-settings`} className="text-sm font-semibold">
              {fieldType?.name ?? field.type} settings
            </h4>
            {fieldType === undefined ? (
              <p className="text-sm text-destructive">
                Unknown field type “{field.type}”: it isn’t installed in this app.
              </p>
            ) : (
              <SettingsForm
                schema={fieldType.settingsSchema as JsonSchema}
                value={field.settings}
                ui={ui?.settings ?? {}}
                contentTypes={contentTypes}
                onChange={(settings) => set('settings', settings)}
              />
            )}
          </section>
        </div>
      ) : null}
    </li>
  )
}
