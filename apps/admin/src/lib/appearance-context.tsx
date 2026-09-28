import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { type Appearance, applyAppearance, cachedAppearance } from './appearance.ts'
import { describeError } from './errors.ts'
import { useSession, useUser } from './session.tsx'
import { toast } from './toast.ts'

interface AppearanceContextValue {
  readonly appearance: Appearance
  /** Applies at once and saves to the user's preferences (when signed in). */
  update(next: Appearance): void
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null)

/**
 * The user's appearance (color scheme and theme). The API's preferences are the source of truth;
 * this device keeps a copy to paint the right theme before they load.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const session = useSession()
  const user = useUser()
  const [appearance, setAppearance] = useState(cachedAppearance)
  const saves = useRef(0)

  useEffect(() => applyAppearance(appearance), [appearance])

  // Follow the OS while the scheme is `system`.
  useEffect(() => {
    if (appearance.colorScheme !== 'system') return
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (media === undefined) return
    const onChange = () => applyAppearance(appearance)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [appearance])

  // Load the signed-in user's preferences (another device may have changed them).
  const userId = user?.id
  useEffect(() => {
    if (userId === undefined) return
    let active = true
    const started = saves.current
    session.client.me
      .preferences()
      .then((preferences) => {
        // A change made meanwhile wins.
        if (active && saves.current === started) setAppearance(preferences)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [session, userId])

  const update = useCallback(
    (next: Appearance) => {
      setAppearance(next)
      if (session.user === null) return
      const save = ++saves.current
      session.client.me.updatePreferences(next).catch((error: unknown) => {
        if (save !== saves.current) return
        toast({
          title: 'Couldn’t save your appearance',
          description: describeError(error).message,
          variant: 'destructive',
        })
      })
    },
    [session],
  )

  return (
    <AppearanceContext.Provider value={{ appearance, update }}>
      {children}
    </AppearanceContext.Provider>
  )
}

export function useAppearance(): AppearanceContextValue {
  const value = useContext(AppearanceContext)
  if (value === null) throw new Error('useAppearance outside <AppearanceProvider>')
  return value
}
