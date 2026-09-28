import { BlixisApiError, type ContentType, type Entry, type Locale } from '@blixis-io/sdk'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useBlocker, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, History, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ErrorAlert } from '../../components/error-view.tsx'
import { Alert } from '../../components/ui/alert.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog.tsx'
import { describeError, type ErrorDescription } from '../../lib/errors.ts'
import { useClient } from '../../lib/session.tsx'
import { toast } from '../../lib/toast.ts'
import { cn } from '../../lib/utils.ts'
import { FieldsForm } from './fields-form.tsx'
import { entriesQuery, entryQuery, versionsQuery } from './queries.ts'
import { StatusBadge } from './status-badge.tsx'
import { entryTitle, type Fields, groupIssues } from './values.ts'
import type { WidgetContext } from './widgets/types.ts'

type Problem =
  | { kind: 'stale' }
  | { kind: 'referrers'; message: string }
  | { kind: 'error'; error: ErrorDescription }

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/**
 * Edits one entry (or a new one, before its first save). Saves are explicit (button or ⌘/Ctrl+S):
 * there is no autosave, because every save is a new immutable version (plan 011).
 */
export function EntryEditor({
  spaceId,
  entry,
  type,
  contentTypes,
  locales,
}: {
  spaceId: string
  entry: Entry | null
  type: ContentType
  contentTypes: readonly ContentType[]
  locales: readonly Locale[]
}) {
  const client = useClient()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const defaultLocale = locales.find((l) => l.isDefault)?.code ?? locales[0]?.code ?? 'en-US'
  const [locale, setLocale] = useState(defaultLocale)
  const [fields, setFields] = useState<Fields>(() => entry?.fields ?? {})
  const [issues, setIssues] = useState<ReturnType<typeof groupIssues>>({
    general: [],
    byKey: new Map(),
  })
  const [problem, setProblem] = useState<Problem | null>(null)
  const [deleting, setDeleting] = useState(false)
  // A ref, not state: navigating right after setting it must already see it.
  const allowLeave = useRef(false)

  const original = useMemo(() => JSON.stringify(entry?.fields ?? {}), [entry])
  const dirty = JSON.stringify(fields) !== original
  const blocker = useBlocker({
    shouldBlockFn: () => dirty && !allowLeave.current,
    enableBeforeUnload: dirty,
    withResolver: true,
  })

  const refresh = useCallback(
    async (updated: Entry) => {
      queryClient.setQueryData(entryQuery(client, updated.sys.id).queryKey, updated)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['spaces', spaceId, 'entries'] }),
        queryClient.invalidateQueries({ queryKey: versionsQuery(client, updated.sys.id).queryKey }),
      ])
    },
    [client, queryClient, spaceId],
  )

  const fail = (error: unknown) => {
    setIssues({ general: [], byKey: new Map() })
    if (error instanceof BlixisApiError && error.code === 'VALIDATION_FAILED') {
      const grouped = groupIssues(type, error.errors)
      setIssues(grouped)
      // Show the first locale with a problem.
      const first = [...grouped.byKey.keys()][0]?.split('.')[1]
      if (first !== undefined && locales.some((l) => l.code === first)) setLocale(first)
      setProblem({
        kind: 'error',
        error: {
          ...describeError(error),
          message:
            grouped.general.length > 0
              ? grouped.general.join(' ')
              : `${error.message}: see the highlighted fields.`,
        },
      })
      return
    }
    if (error instanceof BlixisApiError && error.code === 'CONFLICT') {
      if (/changed since you loaded/.test(error.message)) setProblem({ kind: 'stale' })
      else if (/Published entries link to this entry/.test(error.message))
        setProblem({ kind: 'referrers', message: error.message })
      else setProblem({ kind: 'error', error: describeError(error) })
      return
    }
    setProblem({ kind: 'error', error: describeError(error) })
  }

  /** Saves when needed; returns the entry as saved (or as it was). */
  const saveIfNeeded = async (): Promise<Entry> => {
    if (entry === null) {
      const created = await client.entries.create(spaceId, type.apiId, fields)
      await refresh(created)
      return created
    }
    if (!dirty) return entry
    const updated = await client.entries.update(
      entry.sys.id,
      fields as Record<string, unknown>,
      entry.sys.version,
    )
    await refresh(updated)
    return updated
  }

  const afterCreate = async (saved: Entry) => {
    if (entry !== null) return
    allowLeave.current = true
    await navigate({
      to: '/spaces/$spaceId/entries/$entryId',
      params: { spaceId, entryId: saved.sys.id },
      replace: true,
    })
  }

  const save = useMutation({
    mutationFn: saveIfNeeded,
    onSuccess: async (saved) => {
      setProblem(null)
      setIssues({ general: [], byKey: new Map() })
      toast({ title: 'Saved' })
      await afterCreate(saved)
    },
    onError: fail,
  })

  const publish = useMutation({
    mutationFn: async () => {
      const saved = await saveIfNeeded()
      return client.entries.publish(saved.sys.id, { version: saved.sys.version })
    },
    onSuccess: async (published) => {
      setProblem(null)
      setIssues({ general: [], byKey: new Map() })
      await refresh(published)
      toast({ title: 'Published' })
      await afterCreate(published)
    },
    onError: fail,
  })

  const unpublish = useMutation({
    mutationFn: (force: boolean) => {
      if (entry === null) throw new Error('Nothing to unpublish')
      return client.entries.unpublish(entry.sys.id, { force })
    },
    onSuccess: async (updated) => {
      setProblem(null)
      await refresh(updated)
      toast({ title: 'Unpublished' })
    },
    onError: fail,
  })

  const busy = save.isPending || publish.isPending || unpublish.isPending

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (!busy && (dirty || entry === null)) save.mutate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, dirty, entry, save])

  const context: WidgetContext = useMemo(
    () => ({
      spaceId,
      contentTypes,
      locale,
      defaultLocale,
      renderFields: ({ type: component, fields: values, onChange }) => (
        <FieldsForm
          type={component}
          fields={values}
          onChange={onChange}
          localizable={false}
          issues={new Map()}
          context={{ spaceId, contentTypes, locale, defaultLocale, renderFields: () => null }}
        />
      ),
    }),
    [spaceId, contentTypes, locale, defaultLocale],
  )
  // Nested blocks need the same renderer (blocks within blocks).
  const nested: WidgetContext = useMemo(() => {
    const self: WidgetContext = {
      ...context,
      renderFields: (props) => (
        <FieldsForm {...props} localizable={false} issues={new Map()} context={self} />
      ),
    }
    return self
  }, [context])

  const status = entry?.sys.status
  const title = entryTitle({ fields }, type, locale, defaultLocale)
  const localizedFields = type.fields.some((f) => f.localized)
  const localeIssues = (code: string) =>
    [...issues.byKey.entries()]
      .filter(([key]) => key.endsWith(`.${code}`))
      .reduce((n, [, list]) => n + list.length, 0)

  return (
    <div className="grid gap-6">
      <Link
        to="/spaces/$spaceId/entries"
        params={{ spaceId }}
        aria-label="Back to entries"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Entries
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-xl font-semibold">
            {entry === null && title === 'Untitled' ? `New ${type.name}` : title}
          </h2>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {type.name}
            {status === undefined ? null : <StatusBadge status={status} />}
            {entry === null ? null : <span>version {entry.sys.version}</span>}
            {dirty ? <span role="status">· Unsaved changes</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={busy || (!dirty && entry !== null)}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save draft'}
          </Button>
          <Button
            disabled={busy || (status === 'published' && !dirty)}
            onClick={() => publish.mutate()}
          >
            {publish.isPending
              ? 'Publishing…'
              : status === 'changed' || dirty
                ? 'Publish changes'
                : 'Publish'}
          </Button>
          {status === 'published' || status === 'changed' ? (
            <Button variant="outline" disabled={busy} onClick={() => unpublish.mutate(false)}>
              {unpublish.isPending ? 'Unpublishing…' : 'Unpublish'}
            </Button>
          ) : null}
          {entry !== null && status === 'draft' ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete entry"
              disabled={busy}
              onClick={() => setDeleting(true)}
            >
              <Trash2 aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>

      {problem?.kind === 'stale' ? (
        <Alert variant="destructive">
          <p className="font-medium">Someone else saved this entry meanwhile</p>
          <p>Load their version (your unsaved changes are lost), or copy your changes first.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              setProblem(null)
              if (entry !== null)
                void queryClient.invalidateQueries({
                  queryKey: entryQuery(client, entry.sys.id).queryKey,
                })
            }}
          >
            Load the latest version
          </Button>
        </Alert>
      ) : null}
      {problem?.kind === 'referrers' ? (
        <Alert variant="destructive">
          <p className="font-medium">Other published entries link to this one</p>
          <p>{problem.message}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => unpublish.mutate(true)}
          >
            Unpublish anyway
          </Button>
        </Alert>
      ) : null}
      {problem?.kind === 'error' ? <ErrorAlert error={problem.error} /> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="grid content-start gap-4">
          {localizedFields && locales.length > 1 ? (
            <div
              role="tablist"
              aria-label="Locale"
              className="flex flex-wrap gap-1 border-b border-border pb-2"
            >
              {locales.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  role="tab"
                  aria-selected={l.code === locale}
                  onClick={() => setLocale(l.code)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm',
                    l.code === locale
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-accent',
                  )}
                >
                  {l.name === l.code ? l.code : `${l.name} (${l.code})`}
                  {l.isDefault ? ' · default' : ''}
                  {localeIssues(l.code) > 0 ? (
                    <span className="ml-1 rounded-full bg-destructive px-1.5 text-xs text-destructive-foreground">
                      {localeIssues(l.code)}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
          {localizedFields && locales.length > 1 ? (
            <p className="text-xs text-muted-foreground">
              Fields marked with a locale are translated; the others are shared by all locales.
            </p>
          ) : null}
          <Card>
            <CardContent className="pt-6">
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  save.mutate()
                }}
              >
                <FieldsForm
                  type={type}
                  fields={fields}
                  onChange={setFields}
                  context={nested}
                  issues={issues.byKey}
                />
              </form>
            </CardContent>
          </Card>
        </div>
        {entry === null ? null : (
          <Versions entry={entry} dirty={dirty} onRestored={refresh} onError={fail} />
        )}
      </div>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this entry?</DialogTitle>
            <DialogDescription>
              The entry and all its versions are deleted. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (entry === null) return
                try {
                  await client.entries.delete(entry.sys.id, entry.sys.version)
                  setDeleting(false)
                  allowLeave.current = true
                  queryClient.removeQueries({ queryKey: entryQuery(client, entry.sys.id).queryKey })
                  await queryClient.invalidateQueries({
                    queryKey: entriesQuery(client, spaceId, undefined).queryKey.slice(0, 3),
                  })
                  toast({ title: 'Deleted' })
                  await navigate({ to: '/spaces/$spaceId/entries', params: { spaceId } })
                } catch (error) {
                  setDeleting(false)
                  fail(error)
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={blocker.status === 'blocked'}
        onOpenChange={(open) => (open ? undefined : blocker.reset?.())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave without saving?</DialogTitle>
            <DialogDescription>Your changes to this entry will be lost.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => blocker.reset?.()}>
              Stay
            </Button>
            <Button variant="destructive" onClick={() => blocker.proceed?.()}>
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Version history with restore (a restore saves the old fields as a new version). */
function Versions({
  entry,
  dirty,
  onRestored,
  onError,
}: {
  entry: Entry
  dirty: boolean
  onRestored: (entry: Entry) => Promise<void>
  onError: (error: unknown) => void
}) {
  const client = useClient()
  const versions = useQuery(versionsQuery(client, entry.sys.id))
  const restore = useMutation({
    mutationFn: (versionId: string) =>
      client.entries.restore(entry.sys.id, versionId, entry.sys.version),
    onSuccess: async (restored) => {
      await onRestored(restored)
      toast({ title: `Restored as version ${restored.sys.version}` })
    },
    onError,
  })
  return (
    <Card className="content-start self-start">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History aria-hidden className="size-4" />
          Versions
        </CardTitle>
      </CardHeader>
      <CardContent>
        {versions.isPending ? (
          <p role="status" className="text-sm">
            Loading…
          </p>
        ) : null}
        {dirty ? (
          <p className="mb-2 text-xs text-muted-foreground">
            Save or discard your changes to restore a version.
          </p>
        ) : null}
        <ol className="grid gap-2" aria-label="Versions">
          {(versions.data?.versions ?? []).map((v) => (
            <li key={v.sys.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="grid">
                <span className="font-medium">
                  Version {v.sys.number}
                  {v.sys.isCurrent ? ' · current' : ''}
                  {v.sys.isPublished ? ' · published' : ''}
                </span>
                <span className="text-xs text-muted-foreground">
                  {dateFormat.format(new Date(v.sys.createdAt))}
                  {v.sys.restoredFrom === null ? '' : ' · restored'}
                </span>
              </span>
              {v.sys.isCurrent ? null : (
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Restore version ${v.sys.number}`}
                  disabled={dirty || restore.isPending}
                  onClick={() => restore.mutate(v.sys.id)}
                >
                  Restore
                </Button>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
