import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { z } from 'zod'
import { describeError, type ErrorDescription } from '../lib/errors.ts'
import { organizationsQuery } from '../lib/queries.ts'
import { useClient } from '../lib/session.tsx'
import { SLUG_PATTERN, slugify } from '../lib/slug.ts'
import { toast } from '../lib/toast.ts'
import { ErrorAlert } from './error-view.tsx'
import { TextField } from './text-field.tsx'
import { Button } from './ui/button.tsx'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.tsx'

export const nameAndSlugSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(100, 'At most 100 characters'),
  slug: z.string().regex(SLUG_PATTERN, 'Use lower-case letters, digits, and hyphens (1–63)'),
})

/** Creates an organization; the creator becomes its owner. */
export function CreateOrganizationDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const client = useClient()
  const queryClient = useQueryClient()
  const [error, setError] = useState<ErrorDescription | null>(null)
  const create = useMutation({
    mutationFn: (body: { name: string; slug: string }) => client.organizations.create(body),
  })
  const form = useForm({
    defaultValues: { name: '', slug: '' },
    validators: { onSubmit: nameAndSlugSchema },
    onSubmit: async ({ value, formApi }) => {
      setError(null)
      try {
        const organization = await create.mutateAsync(value)
        await queryClient.invalidateQueries({ queryKey: organizationsQuery(client).queryKey })
        toast({ title: `Created ${organization.name}` })
        formApi.reset()
        onOpenChange(false)
      } catch (e) {
        setError(describeError(e))
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New organization</DialogTitle>
          <DialogDescription>
            Organizations own spaces and members. You become the owner.
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
                if (!fieldApi.form.getFieldMeta('slug')?.isDirty)
                  fieldApi.form.setFieldValue('slug', slugify(value), { dontUpdateMeta: true })
              },
            }}
          >
            {(field) => (
              <TextField field={field} label="Name" autoFocus autoComplete="organization" />
            )}
          </form.Field>
          <form.Field name="slug">
            {(field) => (
              <TextField
                field={field}
                label="Slug"
                hint="Used in URLs and the API."
                spellCheck={false}
              />
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
                  {submitting ? 'Creating…' : 'Create organization'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
