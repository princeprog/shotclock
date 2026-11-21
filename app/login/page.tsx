import { redirect } from 'next/navigation'
import { AuthLayout } from '@/components/auth-layout'
import { LoginForm } from '@/components/login-form'
import { ResumeSession } from '@/components/session-actions'
import { sessionState } from '@/lib/auth-server'

// Signed-in users skip the form; an expired session that can be refreshed is restored first.
export default async function LoginPage() {
  const session = await sessionState()
  if (session.state === 'authenticated') redirect('/organizations')
  return <AuthLayout>{session.state === 'restore' ? <ResumeSession><LoginForm /></ResumeSession> : <LoginForm />}</AuthLayout>
}
