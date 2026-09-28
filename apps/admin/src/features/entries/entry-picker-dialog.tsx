import type { Entry } from '@blixis/sdk'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ErrorView } from '../../components/error-view.tsx'
import { Button } from '../../components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog.tsx'
import { Label } from '../../components/ui/label.tsx'
import { NativeSelect } from '../../components/ui/native-select.tsx'
import { useClient } from '../../lib/session.tsx'
import { entriesQuery } from './queries.ts'
import { StatusBadge } from './status-badge.tsx'
import { entryTitle } from './values.ts'
import type { WidgetContext } from './widgets/types.ts'

/** Picks an entry, limited to some content types (none given: any entry type). */
export function EntryPickerDialog({
  open,
  onOpenChange,
  context,
  contentTypeIds,
  exclude = [],
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  context: WidgetContext
  contentTypeIds: readonly string[]
  exclude?: readonly string[]
  onPick: (entry: Entry) => void
}) {
  const client = useClient()
  const types = context.contentTypes.filter(
    (t) => t.kind === 'entry' && (contentTypeIds.length === 0 || contentTypeIds.includes(t.id)),
  )
  const [typeId, setTypeId] = useState<string>(types[0]?.id ?? '')
  const entries = useInfiniteQuery({
    ...entriesQuery(client, context.spaceId, typeId || undefined),
    enabled: open && typeId !== '',
  })
  const type = types.find((t) => t.id === typeId)
  const list = (entries.data?.pages ?? [])
    .flatMap((p) => p.entries)
    .filter((e) => !exclude.includes(e.sys.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose an entry</DialogTitle>
          <DialogDescription>
            Drafts can be linked; publishing checks that linked entries are published.
          </DialogDescription>
        </DialogHeader>
        {types.length > 1 ? (
          <div className="grid gap-2">
            <Label htmlFor="entry-picker-type">Content type</Label>
            <NativeSelect
              id="entry-picker-type"
              value={typeId}
              onChange={(event) => setTypeId(event.target.value)}
            >
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
        {types.length === 0 ? (
          <p className="text-sm text-muted-foreground">No content types to choose from.</p>
        ) : null}
        {entries.isPending && typeId !== '' ? <p role="status">Loading entries…</p> : null}
        {entries.isError ? (
          <ErrorView error={entries.error} reset={() => void entries.refetch()} />
        ) : null}
        <ul className="grid max-h-[50vh] gap-1 overflow-y-auto" aria-label="Entries">
          {list.map((entry) => (
            <li key={entry.sys.id}>
              <button
                type="button"
                onClick={() => onPick(entry)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="truncate">
                  {entryTitle(entry, type, context.locale, context.defaultLocale)}
                </span>
                <StatusBadge status={entry.sys.status} />
              </button>
            </li>
          ))}
        </ul>
        {entries.data !== undefined && list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entries of this type yet.</p>
        ) : null}
        {entries.hasNextPage ? (
          <Button
            type="button"
            variant="outline"
            disabled={entries.isFetchingNextPage}
            onClick={() => void entries.fetchNextPage()}
          >
            {entries.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
