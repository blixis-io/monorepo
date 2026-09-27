import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Joins class names, letting later Tailwind classes win (shadcn/ui convention). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
