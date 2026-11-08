import { notFound } from 'next/navigation'
import { AuthLayout } from '@/components/auth-layout'
import { LoginForm } from '@/components/login-form'

const pages = ['register', 'forgot-password', 'resend-verification', 'verify-email', 'reset-password'] as const
type Page = typeof pages[number]

export default async function AuthPage({ params }: { params: Promise<{ 'auth-page': string }> }) {
  const page = (await params)['auth-page']
  if (!pages.includes(page as Page)) notFound()
  return <AuthLayout><LoginForm mode={page as Page} /></AuthLayout>
}
