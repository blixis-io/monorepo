import type { Entry } from '@blixis/sdk'
import { useQueries, useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Button } from '../../../components/ui/button.tsx'
import { Checkbox } from '../../../components/ui/checkbox.tsx'
import { Input } from '../../../components/ui/input.tsx'
import { Label } from '../../../components/ui/label.tsx'
import { NativeSelect } from '../../../components/ui/native-select.tsx'
import { useClient } from '../../../lib/session.tsx'
import { AssetPickerDialog, AssetPreview } from '../../assets/asset-picker.tsx'
import { EntryPickerDialog } from '../entry-picker-dialog.tsx'
import { entryQuery } from '../queries.ts'
import { StatusBadge } from '../status-badge.tsx'
import { entryTitle } from '../values.ts'
import { settingsOf, type WidgetContext, type WidgetProps } from './types.ts'

type EntryLink = { type: 'entry'; id: string }
type AssetLink = { type: 'asset'; id: string }

const asList = <T,>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : value === undefined || value === null ? [] : [value as T]

/** A chosen item with move and remove controls (lists keep their order). */
function Chosen({
  label,
  index,
  count,
  children,
  onMove,
  onRemove,
}: {
  label: string
  index: number
  count: number
  children: ReactNode
  onMove?: ((by: -1 | 1) => void) | undefined
  onRemove: () => void
}) {
  return (
    <li className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-sm text-card-foreground">
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {onMove !== undefined && count > 1 ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move ${label} up`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move ${label} down`}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown aria-hidden />
          </Button>
        </>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
      >
        <X aria-hidden />
      </Button>
    </li>
  )
}

const move = <T,>(list: readonly T[], index: number, by: -1 | 1) => {
  const next = [...list]
  const [item] = next.splice(index, 1)
  if (item !== undefined) next.splice(index + by, 0, item)
  return next
}

/** Titles of linked entries, loaded one by one (they are cached per entry). */
function useEntryTitles(ids: readonly string[], context: WidgetContext) {
  const client = useClient()
  const results = useQueries({
    queries: ids.map((id) => ({ ...entryQuery(client, id), retry: false })),
  })
  return ids.map((id, i) => {
    const result = results[i]
    const entry = result?.data as Entry | undefined
    if (result?.isError) return { id, title: 'Missing entry', entry: undefined }
    const type = context.contentTypes.find((t) => t.id === entry?.sys.contentType.id)
    return {
      id,
      title:
        entry === undefined
          ? 'Loading…'
          : entryTitle(entry, type, context.locale, context.defaultLocale),
      entry,
    }
  })
}

export function ReferenceWidget({ field, value, onChange, context, describedBy }: WidgetProps) {
  const settings = settingsOf<{ contentTypeIds: string[]; multiple: boolean; max: number }>(field)
  const multiple = settings.multiple === true
  const links = asList<EntryLink>(value)
  const titles = useEntryTitles(
    links.map((l) => l.id),
    context,
  )
  const [picking, setPicking] = useState(false)
  const set = (next: EntryLink[]) =>
    onChange(multiple ? (next.length === 0 ? undefined : next) : next[0])
  const full = multiple ? links.length >= (settings.max ?? 100) : links.length >= 1

  return (
    <div className="grid gap-2" aria-describedby={describedBy}>
      {links.length > 0 ? (
        <ul className="grid gap-1" aria-label={`${field.name}: linked entries`}>
          {titles.map((t, index) => (
            <Chosen
              key={t.id}
              label={t.title}
              index={index}
              count={links.length}
              onMove={multiple ? (by) => set(move(links, index, by)) : undefined}
              onRemove={() => set(links.filter((_, i) => i !== index))}
            >
              <span className="truncate">{t.title}</span>
              {t.entry === undefined ? null : <StatusBadge status={t.entry.sys.status} />}
            </Chosen>
          ))}
        </ul>
      ) : null}
      {full ? null : (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setPicking(true)}>
            <Plus aria-hidden />
            {multiple || links.length === 0 ? 'Link an entry' : 'Replace entry'}
          </Button>
        </div>
      )}
      <EntryPickerDialog
        open={picking}
        onOpenChange={setPicking}
        context={context}
        contentTypeIds={settings.contentTypeIds ?? []}
        exclude={links.map((l) => l.id)}
        onPick={(entry) => {
          set([...(multiple ? links : []), { type: 'entry', id: entry.sys.id }])
          setPicking(false)
        }}
      />
    </div>
  )
}

export function AssetWidget({ field, value, onChange, context, describedBy }: WidgetProps) {
  const client = useClient()
  const settings = settingsOf<{ mimeTypes: string[]; multiple: boolean; max: number }>(field)
  const multiple = settings.multiple === true
  const links = asList<AssetLink>(value)
  const assets = useQueries({
    queries: links.map((l) => ({
      queryKey: ['assets', l.id],
      queryFn: () => client.assets.get(l.id),
      retry: false,
    })),
  })
  const [picking, setPicking] = useState(false)
  const set = (next: AssetLink[]) =>
    onChange(multiple ? (next.length === 0 ? undefined : next) : next[0])
  const full = multiple ? links.length >= (settings.max ?? 100) : links.length >= 1

  return (
    <div className="grid gap-2" aria-describedby={describedBy}>
      {links.length > 0 ? (
        <ul className="grid gap-1" aria-label={`${field.name}: linked assets`}>
          {links.map((link, index) => {
            const asset = assets[index]?.data
            const name =
              asset?.fields.filename ?? (assets[index]?.isError ? 'Missing asset' : 'Loading…')
            return (
              <Chosen
                key={link.id}
                label={name}
                index={index}
                count={links.length}
                onMove={multiple ? (by) => set(move(links, index, by)) : undefined}
                onRemove={() => set(links.filter((_, i) => i !== index))}
              >
                {asset === undefined ? null : (
                  <AssetPreview
                    asset={asset}
                    className="size-10 shrink-0 rounded-sm object-cover"
                  />
                )}
                <span className="truncate">{name}</span>
                {asset === undefined ? null : <StatusBadge status={asset.sys.status} />}
              </Chosen>
            )
          })}
        </ul>
      ) : null}
      {full ? null : (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setPicking(true)}>
            <Plus aria-hidden />
            {multiple || links.length === 0 ? 'Add an asset' : 'Replace asset'}
          </Button>
        </div>
      )}
      <AssetPickerDialog
        open={picking}
        onOpenChange={setPicking}
        spaceId={context.spaceId}
        mimeTypes={settings.mimeTypes ?? []}
        onPick={(asset) => {
          if (!links.some((l) => l.id === asset.sys.id))
            set([...(multiple ? links : []), { type: 'asset', id: asset.sys.id }])
          setPicking(false)
        }}
      />
    </div>
  )
}

type LinkKind = 'entry' | 'url' | 'email' | 'phone'
type LinkValue = {
  kind: LinkKind
  id?: string | undefined
  url?: string | undefined
  email?: string | undefined
  phone?: string | undefined
  text?: string | undefined
  title?: string | undefined
  newTab?: boolean | undefined
}
const KIND_LABEL: Record<LinkKind, string> = {
  entry: 'Entry',
  url: 'Web address (URL)',
  email: 'Email address',
  phone: 'Phone number',
}

export function LinkWidget({
  id,
  field,
  value,
  onChange,
  context,
  invalid,
  describedBy,
}: WidgetProps) {
  const client = useClient()
  const settings = settingsOf<{
    kinds: LinkKind[]
    contentTypeIds: string[]
    text: 'none' | 'optional' | 'required'
    allowNewTab: boolean
  }>(field)
  const kinds = settings.kinds ?? ['entry', 'url']
  const link = (typeof value === 'object' && value !== null ? value : undefined) as
    | LinkValue
    | undefined
  const kind = link?.kind ?? kinds[0] ?? 'url'
  const [picking, setPicking] = useState(false)
  const target = useQuery({
    ...entryQuery(client, link?.id ?? ''),
    enabled: kind === 'entry' && link?.id !== undefined,
    retry: false,
  })
  const targetType = context.contentTypes.find((t) => t.id === target.data?.sys.contentType.id)

  /** Keeps text, title, and new tab; drops the other kinds' targets. */
  const update = (patch: Partial<LinkValue>) => {
    const next: LinkValue = { ...(link ?? { kind }), ...patch }
    const cleaned = Object.fromEntries(
      Object.entries(next).filter(
        ([k, v]) =>
          v !== undefined &&
          v !== '' &&
          (k === 'kind' ||
            k === 'text' ||
            k === 'title' ||
            k === 'newTab' ||
            k === targetKey(next.kind)),
      ),
    )
    const hasTarget = cleaned[targetKey(next.kind)] !== undefined
    onChange(hasTarget ? cleaned : undefined)
  }

  return (
    <div className="grid gap-3 rounded-md border border-border p-3" aria-describedby={describedBy}>
      <div className="grid gap-3 sm:grid-cols-2">
        {kinds.length > 1 ? (
          <div className="grid gap-2">
            <Label htmlFor={`${id}-kind`}>Link to</Label>
            <NativeSelect
              id={`${id}-kind`}
              value={kind}
              onChange={(event) =>
                onChange(
                  link === undefined
                    ? undefined
                    : {
                        kind: event.target.value,
                        ...(link.text === undefined ? {} : { text: link.text }),
                      },
                )
              }
            >
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
        {kind === 'entry' ? (
          <div className="grid content-end gap-2">
            {link?.id === undefined ? null : (
              <p className="text-sm">
                {target.isError
                  ? 'Missing entry'
                  : target.data === undefined
                    ? 'Loading…'
                    : entryTitle(target.data, targetType, context.locale, context.defaultLocale)}
              </p>
            )}
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => setPicking(true)}>
                {link?.id === undefined ? 'Choose an entry' : 'Change entry'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor={`${id}-target`}>{KIND_LABEL[kind]}</Label>
            <Input
              id={`${id}-target`}
              type={kind === 'url' ? 'url' : kind === 'email' ? 'email' : 'tel'}
              value={(link?.[targetKey(kind)] as string | undefined) ?? ''}
              placeholder={kind === 'url' ? 'https://' : undefined}
              aria-invalid={invalid || undefined}
              onChange={(event) => update({ kind, [targetKey(kind)]: event.target.value })}
            />
          </div>
        )}
      </div>
      {settings.text === 'none' ? null : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${id}-text`}>
              Link text{settings.text === 'required' ? ' (required)' : ''}
            </Label>
            <Input
              id={`${id}-text`}
              value={link?.text ?? ''}
              maxLength={200}
              disabled={link === undefined}
              onChange={(event) => update({ text: event.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-title`}>Title (tooltip)</Label>
            <Input
              id={`${id}-title`}
              value={link?.title ?? ''}
              maxLength={200}
              disabled={link === undefined}
              onChange={(event) => update({ title: event.target.value })}
            />
          </div>
        </div>
      )}
      {settings.allowNewTab === false ? null : (
        <Checkbox
          label="Open in a new tab"
          checked={link?.newTab === true}
          disabled={link === undefined}
          onChange={(checked) => update({ newTab: checked || undefined })}
        />
      )}
      <EntryPickerDialog
        open={picking}
        onOpenChange={setPicking}
        context={context}
        contentTypeIds={settings.contentTypeIds ?? []}
        onPick={(entry) => {
          update({ kind: 'entry', id: entry.sys.id })
          setPicking(false)
        }}
      />
    </div>
  )
}

const targetKey = (kind: LinkKind): 'id' | 'url' | 'email' | 'phone' =>
  kind === 'entry' ? 'id' : kind
