import { redirect } from 'next/navigation'
import { ShotClockOperator } from '@/components/shot-clock-operator'
import { RestoreSession } from '@/components/session-actions'
import { sessionState } from '@/lib/auth-server'

export default async function ShotClockPage({ params }: { params: Promise<{ gameId: string }> }) {
  const session = await sessionState()
  if (session.state === 'anonymous') redirect('/login')
  if (session.state === 'restore') return <RestoreSession />
  if (session.state === 'unavailable') return <main className="p-6">Authentication is temporarily unavailable. Please try again later.</main>
  const { gameId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) redirect('/scorekeeping')
  return <ShotClockOperator gameId={gameId} />
}
