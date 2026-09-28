import { BlixisApiError, type ContentType, type FieldType } from '@blixis-io/sdk'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createRoute, Link, useBlocker } from '@tanstack/react-router'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { ErrorAlert } from '../components/error-view.tsx'
import { Alert } from '../components/ui/alert.tsx'
import { Button } from '../components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.tsx'
import { Input } from '../components/ui/input.tsx'
import { Label } from '../components/ui/label.tsx'
import { NativeSelect } from '../components/ui/native-select.tsx'
import { Textarea } from '../components/ui/textarea.tsx'
import { AddFieldDialog } from '../features/content-types/add-field-dialog.tsx'
import { DeleteContentTypeDialog } from '../features/content-types/delete-content-type-dialog.tsx'
import {
  type ContentTypeDraft,
  DISPLAY_FIELD_TYPES,
  draftFromApi,
  issuesByField,
  moveField,
  newField,
  removeField,
  renameApiId,
  renameField,
  toApiId,
  toUpdateBody,
  uniqueApiId,
} from '../features/content-types/draft.ts'
import { FieldCard } from '../features/content-types/field-card.tsx'
import {
  contentTypeQuery,
  contentTypesQuery,
  fieldTypesQuery,
} from '../features/content-types/queries.ts'
import { describeError, type ErrorDescription } from '../lib/errors.ts'
import { useClient } from '../lib/session.tsx'
import { toast } from '../lib/toast.ts'
import { spaceRoute } from './space.tsx'

export const contentTypeRoute = createRoute({
  getParentRoute: () => spaceRoute,
  path: '/content-types/$contentTypeId',
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(
        contentTypeQuery(context.session.client, params.spaceId, params.contentTypeId),
      ),
      context.queryClient.ensureQueryData(fieldTypesQuery(context.session.client)),
    ]),
  pendingComponent: () => <p role="status">Loading content type…</p>,
  component: ContentTypePage,
})

function ContentTypePage() {
  const client = useClient()
  const { spaceId, contentTypeId } = contentTypeRoute.useParams()
  const { data: type } = useSuspenseQuery(contentTypeQuery(client, spaceId, contentTypeId))
  // Remount the editor when another version arrives (a save, or "load the latest").
  return <Editor key={`${type.id}:${type.version}`} spaceId={spaceId} type={type} />
}

type SaveProblem =
  | { kind: 'stale' }
  | { kind: 'unsafe'; problems: string[] }
  | { kind: 'other'; error: ErrorDescription }

function Editor({ spaceId, type }: { spaceId: string; type: ContentType }) {
  const id = useId()
  const client = useClient()
  const queryClient = useQueryClient()
  const fieldTypes = useSuspenseQuery(fieldTypesQuery(client)).data
  const allTypes = useQuery(contentTypesQuery(client, spaceId)).data ?? []
  const [draft, setDraft] = useState<ContentTypeDraft>(() => draftFromApi(type))
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [problem, setProblem] = useState<SaveProblem | null>(null)
  const [issues, setIssues] = useState<ReturnType<typeof issuesByField>>({
    general: [],
    byField: new Map(),
  })

  const original = useMemo(() => JSON.stringify(toUpdateBody(draftFromApi(type), 0)), [type])
  const dirty = JSON.stringify(toUpdateBody(draft, 0)) !== original
  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: dirty,
    withResolver: true,
  })

  const typeById = useMemo(() => new Map(fieldTypes.map((t) => [t.id, t])), [fieldTypes])
  // Entries may reference their own type; a component can't contain itself.
  const pickable = allTypes.filter((t) => !(t.id === type.id && t.kind === 'component'))

  const save = useMutation({
    mutationFn: () =>
      client.contentTypes.update(spaceId, type.id, toUpdateBody(draft, type.version)),
    onSuccess: async (updated) => {
      setProblem(null)
      queryClient.setQueryData(contentTypeQuery(client, spaceId, type.id).queryKey, updated)
      await queryClient.invalidateQueries({ queryKey: contentTypesQuery(client, spaceId).queryKey })
      toast({ title: `Saved ${updated.name}` })
    },
    onError: (error) => {
      setIssues({ general: [], byField: new Map() })
      if (error instanceof BlixisApiError && error.code === 'VALIDATION_FAILED') {
        const grouped = issuesByField(draft, error.errors)
        setIssues(grouped)
        setOpen((current) => new Set([...current, ...grouped.byField.keys()]))
        setProblem(
          grouped.general.length > 0
            ? {
                kind: 'other',
                error: { ...describeError(error), message: grouped.general.join(' ') },
              }
            : {
                kind: 'other',
                error: { ...describeError(error), message: 'See the highlighted fields.' },
              },
        )
        return
      }
      if (error instanceof BlixisApiError && error.code === 'CONFLICT') {
        if (/changed since you loaded/.test(error.message)) setProblem({ kind: 'stale' })
        else if (error.message.startsWith('Unsafe content type change:'))
          setProblem({
            kind: 'unsafe',
            problems: error.message
              .replace('Unsafe content type change:', '')
              .split(';')
              .map((p) => p.trim()),
          })
        else setProblem({ kind: 'other', error: describeError(error) })
        return
      }
      setProblem({ kind: 'other', error: describeError(error) })
    },
  })

  const update = (next: Partial<ContentTypeDraft>) => setDraft((d) => ({ ...d, ...next }))
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const addField = (fieldType: FieldType) => {
    const field = newField(fieldType, draft.fields)
    setDraft((d) => ({ ...d, fields: [...d.fields, field] }))
    setOpen((current) => new Set([...current, field.key]))
    setAdding(false)
  }

  const displayCandidates = draft.fields.filter((f) => DISPLAY_FIELD_TYPES.includes(f.type))

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/spaces/$spaceId/content-types"
          params={{ spaceId }}
          aria-label="Back to the content model"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Content model
        </Link>
      </div>

      <form
        className="grid gap-6"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">
            {draft.name || type.name}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {type.kind === 'component' ? 'Component' : 'Content type'} · version {type.version}
            </span>
          </h2>
          <div className="flex items-center gap-2">
            {dirty ? (
              <span className="text-sm text-muted-foreground" role="status">
                Unsaved changes
              </span>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setDeleting(true)}>
              <Trash2 aria-hidden />
              Delete
            </Button>
            <Button type="submit" disabled={!dirty || save.isPending}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        {problem?.kind === 'stale' ? (
          <Alert variant="destructive">
            <p className="font-medium">Someone else changed this content type</p>
            <p>Load the latest version and apply your changes again.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                setProblem(null)
                void queryClient.invalidateQueries({
                  queryKey: contentTypeQuery(client, spaceId, type.id).queryKey,
                })
              }}
            >
              Load the latest version
            </Button>
          </Alert>
        ) : null}
        {problem?.kind === 'unsafe' ? (
          <Alert variant="destructive">
            <p className="font-medium">This change would break existing entries</p>
            <ul className="list-disc pl-5">
              {problem.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p className="mt-2 text-muted-foreground">
              Fields with values in entries keep their type and localization. To remove such a
              field, mark it Disabled, save, and remove it later; or add a new field instead of
              changing one.
            </p>
          </Alert>
        ) : null}
        {problem?.kind === 'other' ? <ErrorAlert error={problem.error} /> : null}

        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${id}-name`}>Name</Label>
              <Input
                id={`${id}-name`}
                value={draft.name}
                maxLength={100}
                onChange={(event) => update({ name: event.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-api`}>API ID</Label>
              <Input
                id={`${id}-api`}
                value={draft.apiId}
                maxLength={64}
                spellCheck={false}
                onChange={(event) => update({ apiId: event.target.value })}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor={`${id}-description`}>Description</Label>
              <Textarea
                id={`${id}-description`}
                value={draft.description}
                maxLength={1000}
                rows={2}
                onChange={(event) => update({ description: event.target.value })}
              />
            </div>
            {type.kind === 'entry' ? (
              <div className="grid gap-2">
                <Label htmlFor={`${id}-display`}>Display field</Label>
                <NativeSelect
                  id={`${id}-display`}
                  value={draft.displayField ?? ''}
                  aria-describedby={`${id}-display-hint`}
                  onChange={(event) => update({ displayField: event.target.value || null })}
                >
                  <option value="">None</option>
                  {displayCandidates.map((f) => (
                    <option key={f.key} value={f.apiId}>
                      {f.name}
                    </option>
                  ))}
                </NativeSelect>
                <p id={`${id}-display-hint`} className="text-xs text-muted-foreground">
                  The text field that names an entry in lists.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Groups draft={draft} onChange={(groups) => update({ groups })} />

        <section className="grid gap-3" aria-labelledby={`${id}-fields`}>
          <div className="flex items-center justify-between">
            <h3 id={`${id}-fields`} className="text-lg font-semibold">
              Fields
            </h3>
            <Button type="button" variant="outline" onClick={() => setAdding(true)}>
              <Plus aria-hidden />
              Add field
            </Button>
          </div>
          {draft.fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">No fields yet.</p>
          ) : null}
          <ul className="grid gap-2" aria-label="Fields">
            {draft.fields.map((field, index) => (
              <FieldCard
                key={field.key}
                field={field}
                draft={draft}
                fieldType={typeById.get(field.type)}
                contentTypes={pickable}
                index={index}
                count={draft.fields.length}
                open={open.has(field.key)}
                issues={issues.byField.get(field.key) ?? []}
                onToggle={() => toggle(field.key)}
                onChange={(next) =>
                  setDraft((d) => ({
                    ...d,
                    fields: d.fields.map((f) => (f.key === next.key ? next : f)),
                  }))
                }
                onApiIdChange={(apiId) =>
                  setDraft((d) => {
                    const next = renameApiId(d, field.key, apiId)
                    return {
                      ...next,
                      fields: next.fields.map((f) =>
                        f.key === field.key ? { ...f, autoApiId: false } : f,
                      ),
                    }
                  })
                }
                onNameChange={(name) => setDraft((d) => renameField(d, field.key, name))}
                onMove={(by) =>
                  setDraft((d) => ({ ...d, fields: moveField(d.fields, field.key, by) }))
                }
                onRemove={() => setDraft((d) => removeField(d, field.key))}
              />
            ))}
          </ul>
        </section>
      </form>

      <AddFieldDialog
        open={adding}
        onOpenChange={setAdding}
        fieldTypes={fieldTypes}
        onPick={addField}
      />
      <DeleteContentTypeDialog
        spaceId={spaceId}
        contentType={type}
        open={deleting}
        onOpenChange={setDeleting}
      />
      <Dialog
        open={blocker.status === 'blocked'}
        onOpenChange={(next) => {
          if (!next) blocker.reset?.()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave without saving?</DialogTitle>
            <DialogDescription>
              Your changes to {draft.name || type.name} will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => blocker.reset?.()}>
              Stay
            </Button>
            <Button type="button" variant="destructive" onClick={() => blocker.proceed?.()}>
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Field groups (tabs or sections in the entry editor). */
function Groups({
  draft,
  onChange,
}: {
  draft: ContentTypeDraft
  onChange: (groups: ContentTypeDraft['groups']) => void
}) {
  const id = useId()
  const [name, setName] = useState('')
  const add = () => {
    const trimmed = name.trim()
    if (trimmed === '') return
    const groupId = uniqueApiId(
      toApiId(trimmed) || 'group',
      draft.groups.map((g) => g.id),
    )
    onChange([...draft.groups, { id: groupId, name: trimmed }])
    setName('')
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Groups</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm text-muted-foreground">
          Optional: group fields into sections of the entry editor, such as Content and SEO.
        </p>
        {draft.groups.length > 0 ? (
          <ul className="grid gap-2">
            {draft.groups.map((group, index) => (
              <li key={group.id} className="flex items-center gap-2">
                <Input
                  aria-label={`Group ${index + 1} name`}
                  value={group.name}
                  maxLength={100}
                  onChange={(event) =>
                    onChange(
                      draft.groups.map((g) =>
                        g.id === group.id ? { ...g, name: event.target.value } : g,
                      ),
                    )
                  }
                />
                <code className="text-xs text-muted-foreground">{group.id}</code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove group ${group.name}`}
                  disabled={draft.fields.some((f) => f.group === group.id)}
                  title={
                    draft.fields.some((f) => f.group === group.id)
                      ? 'Move its fields out first'
                      : undefined
                  }
                  onClick={() => onChange(draft.groups.filter((g) => g.id !== group.id))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex gap-2">
          <Input
            id={`${id}-new`}
            aria-label="New group name"
            placeholder="New group name"
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                add()
              }
            }}
          />
          <Button type="button" variant="outline" disabled={name.trim() === ''} onClick={add}>
            Add group
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
