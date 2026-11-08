'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { publishSessionChange } from '@/lib/league-cache'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useAppDispatch } from '@/lib/store-hooks'
import { resetUi } from '@/lib/ui-slice'
import { clearOrganizationSelection } from '@/lib/organization-selection'

type Mode = 'login' | 'register' | 'forgot-password' | 'resend-verification' | 'reset-password' | 'verify-email'

const copy: Record<Mode, { title: string; description: string; button: string; success: string }> = {
  login: { title: 'Welcome back', description: 'Sign in to your Shotclock account.', button: 'Sign in', success: '' },
  register: { title: 'Create your account', description: 'Get started with your email and a password.', button: 'Create account', success: 'If this address can be registered, check your email for a verification link.' },
  'forgot-password': { title: 'Reset your password', description: 'Enter your email and we’ll send you a reset link.', button: 'Send reset link', success: 'If an account exists for this address, check your email for a reset link.' },
  'resend-verification': { title: 'Verify your email', description: 'Enter your email to receive another verification link.', button: 'Send verification link', success: 'If this address needs verification, check your email for a link.' },
  'reset-password': { title: 'Choose a new password', description: 'Enter a new password for your account.', button: 'Update password', success: 'Your password was updated. You can now sign in.' },
  'verify-email': { title: 'Verify your email', description: 'Confirm your email address to activate your account.', button: 'Verify email', success: 'Your email is verified. You can now sign in.' },
}

function subscribeToHash(callback: () => void) {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}

export function LoginForm({ mode = 'login' }: { mode?: Mode }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const dispatch = useAppDispatch()
  const token = useSyncExternalStore(subscribeToHash, () => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '', () => '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const hasEmail = ['login', 'register', 'forgot-password', 'resend-verification'].includes(mode)
  const hasPassword = ['login', 'register', 'reset-password'].includes(mode)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const body = { ...(hasEmail ? { email: form.get('email') } : {}), ...(hasPassword ? { password: form.get('password') } : {}), ...(mode === 'verify-email' || mode === 'reset-password' ? { token: token ?? '' } : {}) }
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Shotclock' }, body: JSON.stringify(body) })
      if (!response.ok) {
        const message = response.status === 429 ? 'Too many attempts. Please try again later.' : response.status >= 500 ? 'The service is unavailable. Please try again.' : mode === 'login' ? 'Unable to sign in. Check your credentials and verify your email.' : 'Unable to complete this request. Please check your details and try again.'
        setError(message)
      } else if (mode === 'login') {
        queryClient.clear()
        publishSessionChange()
        dispatch(resetUi())
        clearOrganizationSelection()
        router.replace('/organizations')
        router.refresh()
      } else {
        if (mode === 'reset-password') { queryClient.clear(); publishSessionChange() }
        if (mode === 'verify-email' || mode === 'reset-password') window.history.replaceState(null, '', window.location.pathname)
        setSuccess(copy[mode].success)
      }
    } catch { setError('The service is unavailable. Please try again.') }
    finally { setPending(false) }
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={submit}>
      <FieldGroup>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{copy[mode].title}</h1>
          <p className="text-sm text-muted-foreground">{copy[mode].description}</p>
        </div>
        {success ? <p role="status" className="text-sm">{success}</p> : <>
          {hasEmail && <Field><FieldLabel htmlFor="email">Email</FieldLabel><Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} /></Field>}
          {hasPassword && <Field><div className="flex items-center"><FieldLabel htmlFor="password">Password</FieldLabel>{mode === 'login' && <Link href="/forgot-password" className="ml-auto text-sm underline-offset-4 hover:underline">Forgot password?</Link>}</div><Input id="password" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? undefined : 12} maxLength={128} />{mode !== 'login' && <FieldDescription>Use at least 12 characters.</FieldDescription>}</Field>}
          {(mode === 'verify-email' || mode === 'reset-password') && !token && <FieldError>This link is missing its token. Request a new link.</FieldError>}
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" disabled={pending || ((mode === 'verify-email' || mode === 'reset-password') && !token)}>{pending ? 'Please wait…' : copy[mode].button}</Button>
        </>}
        <FieldDescription className="text-center">{mode === 'login' ? <>New to Shotclock? <Link href="/register">Create an account</Link><br /><Link href="/resend-verification">Resend verification email</Link></> : <Link href="/login">Back to sign in</Link>}</FieldDescription>
      </FieldGroup>
    </form>
  )
}
