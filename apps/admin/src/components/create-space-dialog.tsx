import type { Organization } from '@blixis-io/sdk'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { describeError, type ErrorDescription } from '../lib/errors.ts'
import { spacesQuery } from '../lib/queries.ts'
import { useClient } from '../lib/session.tsx'
import { slugify } from '../lib/slug.ts'
import { toast } from '../lib/toast.ts'
import { nameAndSlugSchema } from './create-organization-dialog.tsx'
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

const spaceSchema = nameAndSlugSchema.extend({
  defaultLocale: z
    .string()
    .trim()
    .refine((code) => {
      try {
        return Intl.getCanonicalLocales(code).length === 1
      } catch {
        return false
      }
    }, 'Enter a locale code such as en-US or nl-NL'),
})

/** Creates a space in an organization (with its `main` environment and default locale). */
export function CreateSpaceDialog({
  organization,
  onOpenChange,
}: {
  /** The organization to create the space in; `null` closes the dialog. */
  organization: Organization | null
  onOpenChange: (open: boolean) => void
}) {
  const client = useClient()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [error, setError] = useState<ErrorDescription | null>(null)
  const create = useMutation({
    mutationFn: (input: { orgId: string; name: string; slug: string; defaultLocale: string }) =>
      client.spaces.create(input.orgId, {
        name: input.name,
        slug: input.slug,
        defaultLocale: input.defaultLocale,
      }),
  })
  const form = useForm({
    defaultValues: { name: '', slug: '', defaultLocale: 'en-US' },
    validators: { onSubmit: spaceSchema },
    onSubmit: async ({ value, formApi }) => {
      if (organization === null) return
      setError(null)
      try {
        const space = await create.mutateAsync({ orgId: organization.id, ...value })
        await queryClient.invalidateQueries({
          queryKey: spacesQuery(client, organization.id).queryKey,
        })
        toast({ title: `Created ${space.name}` })
        formApi.reset()
        onOpenChange(false)
        await navigate({ to: '/spaces/$spaceId', params: { spaceId: space.id } })
      } catch (e) {
        setError(describeError(e))
      }
    },
  })

  return (
    <Dialog open={organization !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New space</DialogTitle>
          <DialogDescription>
            A space holds content models, entries, and assets
            {organization === null ? '' : ` in ${organization.name}`}.
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
            {(field) => <TextField field={field} label="Name" autoFocus autoComplete="off" />}
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
          <form.Field name="defaultLocale">
            {(field) => (
              <TextField
                field={field}
                label="Default locale"
                hint="A BCP 47 code, e.g. en-US. More locales can be added later."
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
                  {submitting ? 'Creating…' : 'Create space'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
