import { useSyncExternalStore } from 'react'

export interface ToastMessage {
  readonly id: number
  readonly title: string
  readonly description?: string | undefined
  readonly variant: 'default' | 'destructive'
}

let toasts: readonly ToastMessage[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => {
  for (const listener of listeners) listener()
}

/** Shows a short notification (rendered by `<Toaster />`). */
export function toast(
  message: Omit<ToastMessage, 'id' | 'variant'> & Partial<Pick<ToastMessage, 'variant'>>,
): void {
  toasts = [...toasts, { variant: 'default', ...message, id: nextId++ }]
  emit()
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function useToasts(): readonly ToastMessage[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => toasts,
  )
}
