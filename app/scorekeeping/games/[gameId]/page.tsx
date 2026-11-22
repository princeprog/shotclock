import { redirect } from 'next/navigation'
import { ScorekeeperConsole } from '@/components/scorekeeper-console'
import { RestoreSession } from '@/components/session-actions'
import { sessionState } from '@/lib/auth-server'

export default async function ScorekeeperConsolePage({ params }: { params: Promise<{ gameId: string }> }) {
  const session = await sessionState()
  if (session.state === 'anonymous') redirect('/login')
  if (session.state === 'restore') return <RestoreSession />
  if (session.state === 'unavailable') return <main className="flex min-h-svh items-center justify-center p-6">Authentication is temporarily unavailable. Please try again later.</main>
  const { gameId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) redirect('/scorekeeping')
  return <ScorekeeperConsole gameId={gameId} />
}

