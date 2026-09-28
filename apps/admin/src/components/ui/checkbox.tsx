import { type ReactNode, useId } from 'react'
import { cn } from '../../lib/utils.ts'

/** A native checkbox with its label (and an optional hint). */
export function Checkbox({
  label,
  hint,
  checked,
  onChange,
  disabled,
  className,
}: {
  label: ReactNode
  hint?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn('flex items-start gap-2', className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-primary disabled:opacity-50"
        checked={checked}
        disabled={disabled}
        aria-describedby={hint === undefined ? undefined : `${id}-hint`}
        onChange={(event) => onChange(event.target.checked)}
      />
      <div className="grid gap-0.5">
        <label htmlFor={id} className={cn('text-sm leading-none', disabled && 'opacity-50')}>
          {label}
        </label>
        {hint === undefined ? null : (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
    </div>
  )
}
