import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { LogOut, UserRound } from 'lucide-react'
import { describeError } from '../lib/errors.ts'
import { useSession, useUser } from '../lib/session.tsx'
import { toast } from '../lib/toast.ts'
import { Button } from './ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.tsx'

/** The signed-in user and sign-out. */
export function UserMenu() {
  const session = useSession()
  const user = useUser()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  if (user === null) return null

  async function signOut() {
    try {
      await session.signOut()
    } catch (error) {
      // The local session has ended anyway; the server session expires on its own.
      toast({ title: 'Signed out on this device only', description: describeError(error).message })
    }
    queryClient.clear()
    await navigate({ to: '/sign-in', search: {} })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Account: ${user.displayName}`}>
          <UserRound aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="grid text-foreground">
          <span className="text-sm font-medium">{user.displayName}</span>
          <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
