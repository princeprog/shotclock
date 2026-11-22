import { AuthLayout } from '@/components/auth-layout'
import { InvitationAccept } from '@/components/invitation-accept'
import { sessionState } from '@/lib/auth-server'

// Opened from an invitation email. Signed-out visitors see which league invited them and can sign in or sign up first.
export default async function AcceptInvitationPage() {
  const session = await sessionState()
  if (session.state === 'unavailable') return <main className="flex min-h-svh items-center justify-center p-6">Authentication is temporarily unavailable. Please try again later.</main>
  return <AuthLayout><InvitationAccept signedInEmail={session.state === 'authenticated' ? session.user.email : null} restoring={session.state === 'restore'} /></AuthLayout>
}

