import type { ContentType } from '@blixis/sdk'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ErrorAlert } from '../../components/error-view.tsx'
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
import { describeError, type ErrorDescription } from '../../lib/errors.ts'
import { useClient } from '../../lib/session.tsx'
import { toast } from '../../lib/toast.ts'
import { contentTypesQuery } from './queries.ts'

/** Deletes a content type after confirmation; the API refuses while entries or other types use it. */
export function DeleteContentTypeDialog({
  spaceId,
  contentType,
  open,
  onOpenChange,
}: {
  spaceId: string
  contentType: ContentType
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const client = useClient()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [error, setError] = useState<ErrorDescription | null>(null)
  const remove = useMutation({
    mutationFn: () => client.contentTypes.delete(spaceId, contentType.id),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ['spaces', spaceId, 'content-types', contentType.id] })
      await queryClient.invalidateQueries({ queryKey: contentTypesQuery(client, spaceId).queryKey })
      toast({ title: `Deleted ${contentType.name}` })
      onOpenChange(false)
      await navigate({ to: '/spaces/$spaceId/content-types', params: { spaceId } })
    },
    onError: (e) => setError(describeError(e)),
  })
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null)
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {contentType.name}?</DialogTitle>
          <DialogDescription>
            This can’t be undone. A content type with entries, or one that other types reference,
            can’t be deleted.
          </DialogDescription>
        </DialogHeader>
        {error === null ? null : <ErrorAlert error={error} />}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {remove.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
