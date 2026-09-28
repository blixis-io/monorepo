import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { ErrorAlert } from '../../components/error-view.tsx'
import { fieldErrors, TextField } from '../../components/text-field.tsx'
import { Button } from '../../components/ui/button.tsx'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog.tsx'
import { Label } from '../../components/ui/label.tsx'
import { NativeSelect } from '../../components/ui/native-select.tsx'
import { describeError, type ErrorDescription } from '../../lib/errors.ts'
import { useClient } from '../../lib/session.tsx'
import { toast } from '../../lib/toast.ts'
import { toApiId } from './draft.ts'
import { contentTypesQuery } from './queries.ts'

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(100),
  apiId: z
    .string()
    .regex(
      /^[a-z][a-zA-Z0-9]{0,63}$/,
      'Use camelCase: a lowercase letter, then letters and digits',
    ),
  kind: z.enum(['entry', 'component']),
})

/** Creates a content type (or component) and opens it in the editor. */
export function CreateContentTypeDialog({
  spaceId,
  open,
  onOpenChange,
}: {
  spaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const client = useClient()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [error, setError] = useState<ErrorDescription | null>(null)
  const create = useMutation({
    mutationFn: (body: z.output<typeof schema>) => client.contentTypes.create(spaceId, body),
  })
  const form = useForm({
    defaultValues: { name: '', apiId: '', kind: 'entry' as 'entry' | 'component' },
    validators: { onSubmit: schema },
    onSubmit: async ({ value, formApi }) => {
      setError(null)
      try {
        const type = await create.mutateAsync(value)
        await queryClient.invalidateQueries({
          queryKey: contentTypesQuery(client, spaceId).queryKey,
        })
        toast({ title: `Created ${type.name}` })
        formApi.reset()
        onOpenChange(false)
        await navigate({
          to: '/spaces/$spaceId/content-types/$contentTypeId',
          params: { spaceId, contentTypeId: type.id },
        })
      } catch (e) {
        setError(describeError(e))
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New content type</DialogTitle>
          <DialogDescription>
            Content types describe entries; components are reusable parts for blocks fields.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          {error === null ? null : <ErrorAlert error={error} />}
          <form.Field
            name="name"
            listeners={{
              onChange: ({ value, fieldApi }) => {
                if (!fieldApi.form.getFieldMeta('apiId')?.isDirty)
                  fieldApi.form.setFieldValue('apiId', toApiId(value), { dontUpdateMeta: true })
              },
            }}
          >
            {(field) => <TextField field={field} label="Name" autoFocus autoComplete="off" />}
          </form.Field>
          <form.Field name="apiId">
            {(field) => (
              <TextField
                field={field}
                label="API ID"
                hint="Used in the APIs and GraphQL."
                spellCheck={false}
              />
            )}
          </form.Field>
          <form.Field name="kind">
            {(field) => (
              <div className="grid gap-2">
                <Label htmlFor="new-type-kind">Kind</Label>
                <NativeSelect
                  id="new-type-kind"
                  value={field.state.value}
                  onChange={(event) =>
                    field.handleChange(event.target.value as 'entry' | 'component')
                  }
                >
                  <option value="entry">Content type (entries)</option>
                  <option value="component">Component (for blocks)</option>
                </NativeSelect>
                {fieldErrors(field).length > 0 ? (
                  <p className="text-sm text-destructive">{fieldErrors(field).join(' ')}</p>
                ) : null}
              </div>
            )}
          </form.Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(submitting) => (
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
