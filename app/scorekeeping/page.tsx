import { redirect } from 'next/navigation'
import { ScorekeepingGames } from '@/components/scorekeeping-games'
import { RestoreSession, SignOut } from '@/components/session-actions'
import { ShotclockLogo } from '@/components/shotclock-logo'
import { sessionState } from '@/lib/auth-server'

// Scorekeepers land here; owners can open it too. It lists the games they can score.
export default async function ScorekeepingPage() {
  const session = await sessionState()
  if (session.state === 'anonymous') redirect('/login')
  if (session.state === 'restore') return <RestoreSession />
  if (session.state === 'unavailable') return <main className="flex min-h-svh items-center justify-center p-6">Authentication is temporarily unavailable. Please try again later.</main>
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-4 px-4 sm:h-20 sm:px-8">
          <ShotclockLogo />
          <div className="flex min-w-0 items-center gap-4">
            <span className="hidden max-w-56 truncate text-sm text-muted-foreground sm:block" title={session.user.email}>{session.user.email}</span>
            <SignOut />
          </div>
        </div>
      </header>
      <ScorekeepingGames />
    </div>
  )
}

