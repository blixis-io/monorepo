import { cn } from '../../lib/utils.ts'

const LABEL = {
  draft: 'Draft',
  published: 'Published',
  changed: 'Changed',
  pending: 'Uploading',
} as const

/** The publishing state of an entry or asset. `changed`: published, with a newer draft. */
export function StatusBadge({ status }: { status: keyof typeof LABEL }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        status === 'published' && 'border-primary/40 bg-primary/10 text-foreground',
        status === 'changed' && 'border-chart-3/50 bg-chart-3/10 text-foreground',
        (status === 'draft' || status === 'pending') && 'border-border text-muted-foreground',
      )}
    >
      {LABEL[status]}
    </span>
  )
}
