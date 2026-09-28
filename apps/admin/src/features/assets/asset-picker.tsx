import type { Asset } from '@blixis/sdk'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { FileIcon, Upload } from 'lucide-react'
import { useId, useState } from 'react'
import { ErrorAlert, ErrorView } from '../../components/error-view.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Checkbox } from '../../components/ui/checkbox.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog.tsx'
import { API_URL } from '../../lib/config.ts'
import { describeError, type ErrorDescription } from '../../lib/errors.ts'
import { useClient } from '../../lib/session.tsx'
import { assetsQuery } from '../entries/queries.ts'
import { StatusBadge } from '../entries/status-badge.tsx'

/** Files up to this size go in one request; larger ones in parts (the API's limit is 90 MiB). */
const SINGLE_UPLOAD_MAX = 64 * 1024 * 1024

/** `image/*` or `application/pdf` against a MIME type. */
export const matchesMime = (patterns: readonly string[], mimeType: string) =>
  patterns.length === 0 ||
  patterns.some((p) => (p.endsWith('/*') ? mimeType.startsWith(p.slice(0, -1)) : p === mimeType))

export const assetUrl = (asset: Asset) =>
  asset.fields.url === null ? null : `${API_URL}${asset.fields.url}`

/** A thumbnail for images, an icon for other files. */
export function AssetPreview({ asset, className }: { asset: Asset; className?: string }) {
  const url = assetUrl(asset)
  if (
    url !== null &&
    asset.fields.mimeType.startsWith('image/') &&
    asset.fields.mimeType !== 'image/svg+xml'
  )
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        className={className ?? 'h-24 w-full rounded-sm object-cover'}
      />
    )
  return (
    <span
      className={className ?? 'flex h-24 w-full items-center justify-center rounded-sm bg-muted'}
    >
      <FileIcon aria-hidden className="size-8 text-muted-foreground" />
    </span>
  )
}

/** Picks an asset of the space, or uploads a new one (published right away by default). */
export function AssetPickerDialog({
  open,
  onOpenChange,
  spaceId,
  mimeTypes,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId: string
  mimeTypes: readonly string[]
  onPick: (asset: Asset) => void
}) {
  const id = useId()
  const client = useClient()
  const queryClient = useQueryClient()
  const assets = useInfiniteQuery({ ...assetsQuery(client, spaceId), enabled: open })
  const [publish, setPublish] = useState(true)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<ErrorDescription | null>(null)
  const list = (assets.data?.pages ?? [])
    .flatMap((p) => p.assets)
    .filter((a) => a.sys.status !== 'pending' && matchesMime(mimeTypes, a.fields.mimeType))

  async function upload(file: File) {
    setError(null)
    if (!matchesMime(mimeTypes, file.type)) {
      setError({
        title: 'File type not allowed',
        message: `This field accepts ${mimeTypes.join(', ')}.`,
      })
      return
    }
    try {
      setProgress(`Uploading ${file.name}…`)
      let asset =
        file.size <= SINGLE_UPLOAD_MAX
          ? await client.assets.upload(spaceId, file, {
              filename: file.name,
              contentType: file.type || 'application/octet-stream',
            })
          : await client.assets.uploadLarge(spaceId, file, {
              filename: file.name,
              contentType: file.type || 'application/octet-stream',
              onProgress: (done, total) =>
                setProgress(`Uploading ${file.name}: ${Math.round((done / total) * 100)}%`),
            })
      if (publish) {
        setProgress(`Publishing ${file.name}…`)
        asset = await client.assets.publish(asset.sys.id)
      }
      await queryClient.invalidateQueries({ queryKey: assetsQuery(client, spaceId).queryKey })
      onPick(asset)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setProgress(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choose an asset</DialogTitle>
          <DialogDescription>
            {mimeTypes.length === 0 ? 'Any file.' : `Allowed: ${mimeTypes.join(', ')}.`} Publishing
            an entry needs its assets published.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-4 rounded-md border border-dashed border-border p-3">
          <label
            htmlFor={`${id}-file`}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-within:ring-2 focus-within:ring-ring"
          >
            <Upload aria-hidden className="size-4" />
            Upload a file
            <input
              id={`${id}-file`}
              type="file"
              className="sr-only"
              disabled={progress !== null}
              accept={mimeTypes.join(',') || undefined}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file !== undefined) void upload(file)
              }}
            />
          </label>
          <Checkbox label="Publish after upload" checked={publish} onChange={setPublish} />
          {progress === null ? null : (
            <p role="status" className="text-sm text-muted-foreground">
              {progress}
            </p>
          )}
        </div>
        {error === null ? null : <ErrorAlert error={error} />}
        {assets.isPending ? <p role="status">Loading assets…</p> : null}
        {assets.isError ? (
          <ErrorView error={assets.error} reset={() => void assets.refetch()} />
        ) : null}
        <ul
          className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4"
          aria-label="Assets"
        >
          {list.map((asset) => (
            <li key={asset.sys.id}>
              <button
                type="button"
                onClick={() => onPick(asset)}
                className="grid w-full gap-1 rounded-md border border-border p-2 text-left text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <AssetPreview asset={asset} />
                <span className="truncate font-medium">{asset.fields.filename}</span>
                <StatusBadge status={asset.sys.status} />
              </button>
            </li>
          ))}
        </ul>
        {assets.data !== undefined && list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matching assets yet: upload one.</p>
        ) : null}
        {assets.hasNextPage ? (
          <Button
            type="button"
            variant="outline"
            disabled={assets.isFetchingNextPage}
            onClick={() => void assets.fetchNextPage()}
          >
            {assets.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
