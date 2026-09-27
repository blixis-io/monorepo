import type * as React from 'react'
import { cn } from '../../lib/utils.ts'

/** An inline message; `role="alert"` so screen readers announce it when it appears. */
export function Alert({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'div'> & { variant?: 'default' | 'destructive' }) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-md border px-4 py-3 text-sm',
        variant === 'destructive'
          ? 'border-destructive/50 text-destructive'
          : 'border-border text-foreground',
        className,
      )}
      {...props}
    />
  )
}
