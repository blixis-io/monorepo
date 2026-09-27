import type { AnyFieldApi } from '@tanstack/react-form'
import { type ComponentProps, useId } from 'react'
import { Input } from './ui/input.tsx'
import { Label } from './ui/label.tsx'

/** The field's error messages (Standard Schema issues or strings). */
export function fieldErrors(field: AnyFieldApi): string[] {
  return (field.state.meta.errors as unknown[])
    .map((e) => (typeof e === 'string' ? e : (e as { message?: unknown } | undefined)?.message))
    .filter((m): m is string => typeof m === 'string' && m !== '')
}

/** A labelled text input bound to a TanStack Form field, with its errors announced. */
export function TextField({
  field,
  label,
  hint,
  ...props
}: { field: AnyFieldApi; label: string; hint?: string } & Omit<
  ComponentProps<'input'>,
  'id' | 'name' | 'value' | 'onChange' | 'onBlur'
>) {
  const id = useId()
  const errors = fieldErrors(field)
  const invalid = errors.length > 0
  const describedBy = [hint === undefined ? '' : `${id}-hint`, invalid ? `${id}-error` : '']
    .filter(Boolean)
    .join(' ')
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={field.name}
        value={String(field.state.value ?? '')}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        {...props}
      />
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {invalid ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {errors.join(' ')}
        </p>
      ) : null}
    </div>
  )
}
