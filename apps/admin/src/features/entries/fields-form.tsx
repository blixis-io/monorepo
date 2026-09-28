import type { ContentType, Field } from '@blixis/sdk'
import { Languages } from 'lucide-react'
import { type ComponentType, lazy, Suspense, useId } from 'react'
import { Label } from '../../components/ui/label.tsx'
import { type Fields, getValue, issueKey, isVisible, setValue } from './values.ts'
import { BlocksWidget } from './widgets/blocks.tsx'
import { AssetWidget, LinkWidget, ReferenceWidget } from './widgets/links.tsx'
import {
  BooleanWidget,
  DateTimeWidget,
  DateWidget,
  JsonWidget,
  LongTextWidget,
  NumberWidget,
  SelectWidget,
  TextWidget,
} from './widgets/simple.tsx'
import type { WidgetContext, WidgetProps } from './widgets/types.ts'

/** Tiptap is the heaviest part of the admin: load it with the first rich-text field. */
const RichTextWidget = lazy(() => import('./widgets/rich-text.tsx'))

const WIDGETS: Readonly<Record<string, ComponentType<WidgetProps>>> = {
  text: TextWidget,
  longText: LongTextWidget,
  richText: (props) => (
    <Suspense fallback={<p role="status">Loading editor…</p>}>
      <RichTextWidget {...props} />
    </Suspense>
  ),
  number: NumberWidget,
  boolean: BooleanWidget,
  date: DateWidget,
  dateTime: DateTimeWidget,
  select: SelectWidget,
  reference: ReferenceWidget,
  asset: AssetWidget,
  link: LinkWidget,
  blocks: BlocksWidget,
  json: JsonWidget,
}

/**
 * The fields of an entry (or of a block's component) for one locale. Hidden, disabled, and
 * conditionally hidden fields are left out; their stored values are kept as they are.
 */
export function FieldsForm({
  type,
  fields,
  onChange,
  context,
  issues,
  localizable = true,
}: {
  type: Pick<ContentType, 'fields' | 'groups'>
  fields: Fields
  onChange: (next: Fields) => void
  context: WidgetContext
  /** Server issues by `apiId` or `apiId.locale`. */
  issues: ReadonlyMap<string, readonly string[]>
  /** False inside blocks: component fields are never localized. */
  localizable?: boolean
}) {
  const shown = type.fields.filter((f) => !f.hidden && !f.disabled && isVisible(f, fields))
  const groups = type.groups.filter((g) => shown.some((f) => f.group === g.id))
  const ungrouped = shown.filter(
    (f) => f.group === undefined || !groups.some((g) => g.id === f.group),
  )
  const row = (field: Field) => (
    <FieldRow
      key={field.id}
      field={field}
      value={getValue(fields, field, context.locale)}
      onChange={(value) => onChange(setValue(fields, field, context.locale, value))}
      context={context}
      issues={issues.get(issueKey(field.apiId, field.localized ? context.locale : undefined)) ?? []}
      localizable={localizable}
    />
  )
  if (shown.length === 0) return <p className="text-sm text-muted-foreground">No fields to edit.</p>
  return (
    <div className="grid gap-6">
      {ungrouped.map(row)}
      {groups.map((group) => (
        <fieldset key={group.id} className="grid gap-6 rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-semibold">{group.name}</legend>
          {shown.filter((f) => f.group === group.id).map(row)}
        </fieldset>
      ))}
    </div>
  )
}

function FieldRow({
  field,
  value,
  onChange,
  context,
  issues,
  localizable,
}: {
  field: Field
  value: unknown
  onChange: (value: unknown) => void
  context: WidgetContext
  issues: readonly string[]
  localizable: boolean
}) {
  const id = useId()
  const Widget = WIDGETS[field.type] ?? JsonWidget
  const invalid = issues.length > 0
  const describedBy =
    [field.description === undefined ? '' : `${id}-help`, invalid ? `${id}-error` : '']
      .filter(Boolean)
      .join(' ') || undefined
  return (
    <div className="grid gap-2" data-field={field.apiId}>
      <div className="flex flex-wrap items-center gap-2">
        {field.type === 'boolean' ? (
          <span className="text-sm font-medium">{field.name}</span>
        ) : (
          <Label htmlFor={id}>{field.name}</Label>
        )}
        {field.required ? <span className="text-xs text-muted-foreground">Required</span> : null}
        {localizable && field.localized ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Languages aria-hidden className="size-3" />
            {context.locale}
          </span>
        ) : null}
      </div>
      {/* Remount per locale: widgets such as the rich-text editor hold their own state. */}
      <Widget
        key={field.localized ? context.locale : 'all'}
        id={id}
        field={field}
        value={value}
        onChange={onChange}
        invalid={invalid}
        describedBy={describedBy}
        context={context}
      />
      {field.description === undefined ? null : (
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          {field.description}
        </p>
      )}
      {invalid ? (
        <ul id={`${id}-error`} className="grid gap-0.5 text-sm text-destructive" role="alert">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
