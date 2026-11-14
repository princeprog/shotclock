'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useWorkspace } from '@/components/workspace-context'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { leagueRequest } from '@/lib/league-client'
import { publishSessionChange } from '@/lib/league-cache'

type Me = { id: string; email: string; name: string | null }

// Calls the account gateway. An expired access token is refreshed once before giving up.
async function accountRequest<T>(action: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'POST', body?: object): Promise<T> {
  const send = () => fetch(`/api/auth/${action}`, { method, cache: 'no-store', headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json', 'X-Requested-With': 'Shotclock' }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) })
  let response = await send()
  if (response.status === 401) {
    const refresh = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Shotclock' }, body: '{}' })
    if (!refresh.ok) { window.location.assign('/login'); throw new Error('Please sign in again.') }
    response = await send()
  }
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(data.error || 'Unable to complete your request.')
  return data as T
}

function Section({ title, description, children, tone }: { title: string; description: string; children: ReactNode; tone?: 'danger' }) {
  return <Card className={tone === 'danger' ? 'border-destructive/30' : undefined}>
    <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
}

export function AccountSettings() {
  const client = useQueryClient()
  const router = useRouter()
  const { organizations } = useWorkspace()
  const me = useQuery({ queryKey: ['auth', 'me'], queryFn: async () => (await accountRequest<{ user: Me }>('me', 'GET')).user, retry: false })
  const archived = useQuery({ queryKey: ['league', 'organizations?archived=true'], queryFn: () => leagueRequest<{ id: string }[]>('organizations?archived=true', client), retry: false })
  const [name, setName] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState('')
  const [deletePassword, setDeletePassword] = useState('')

  const profile = useMutation({
    mutationFn: (value: string) => accountRequest<{ user: Me }>('me', 'PATCH', { name: value }),
    onSuccess: ({ user }) => { client.setQueryData(['auth', 'me'], user); setName(null); toast.success('Name saved.'); router.refresh() },
  })
  const email = useMutation({
    mutationFn: (body: { newEmail: string; currentPassword: string }) => accountRequest('change-email', 'POST', body),
    onSuccess: (_data, body) => setEmailSent(body.newEmail.trim()),
  })
  const password = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) => accountRequest('change-password', 'POST', body),
    onSuccess: () => toast.success('Password changed. Other devices were signed out.'),
  })
  const others = useMutation({
    mutationFn: () => accountRequest('sign-out-others'),
    onSuccess: () => toast.success('Signed out of other devices.'),
    onError: (error) => toast.error(error.message),
  })
  const removeAccount = useMutation({
    mutationFn: (value: string) => accountRequest('me', 'DELETE', { password: value }),
    onSuccess: () => { client.clear(); publishSessionChange(); router.replace('/login') },
  })

  if (me.isPending) return <div role="status" aria-label="Loading account" className="flex flex-col gap-6"><Skeleton className="h-40 w-full" /><Skeleton className="h-56 w-full" /></div>
  if (me.isError) return <Alert variant="destructive"><AlertTitle>Couldn’t load your account</AlertTitle><AlertDescription><p>{me.error.message}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void me.refetch()}>Try again</Button></AlertDescription></Alert>
  const user = me.data
  const ownedOrganizations = (organizations.data?.length ?? 0) + (archived.data?.length ?? 0)
  const ownershipKnown = organizations.isSuccess && archived.isSuccess
  const currentName = name ?? user.name ?? ''

  function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    email.mutate({ newEmail: String(form.get('newEmail') ?? ''), currentPassword: String(form.get('emailPassword') ?? '') })
  }
  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    password.mutate({ currentPassword: String(values.get('currentPassword') ?? ''), newPassword: String(values.get('newPassword') ?? '') }, { onSuccess: () => form.reset() })
  }

  return <div className="flex w-full max-w-3xl flex-col gap-6">
    <Section title="Profile" description="Your name appears in the sidebar.">
      <form className="flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); profile.mutate(currentName) }}>
        <Field className="flex-1"><FieldLabel htmlFor="account-name">Name</FieldLabel><Input id="account-name" value={currentName} maxLength={120} autoComplete="name" onChange={(event) => setName(event.target.value)} disabled={profile.isPending} /></Field>
        <Button type="submit" disabled={profile.isPending || currentName.trim() === (user.name ?? '')}>{profile.isPending ? 'Saving…' : 'Save name'}</Button>
      </form>
      {profile.isError && <p role="alert" className="mt-3 text-sm text-destructive">{profile.error.message}</p>}
    </Section>

    <Section title="Email" description={`You sign in with ${user.email}.`}>
      {emailSent ? <div role="status" className="flex flex-col items-start gap-3 text-sm"><p>Check <span className="font-medium">{emailSent}</span> for a confirmation link. Your email changes once you open it.</p><Button variant="outline" size="sm" onClick={() => { setEmailSent(''); email.reset() }}>Use a different email</Button></div>
        : <form className="flex flex-col gap-4" onSubmit={submitEmail}>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="account-new-email" required>New email</FieldLabel><Input id="account-new-email" name="newEmail" type="email" autoComplete="email" required maxLength={254} disabled={email.isPending} /></Field>
            <Field><FieldLabel htmlFor="account-email-password" required>Current password</FieldLabel><Input id="account-email-password" name="emailPassword" type="password" autoComplete="current-password" required maxLength={128} disabled={email.isPending} /></Field>
          </FieldGroup>
          {email.isError && <p role="alert" className="text-sm text-destructive">{email.error.message}</p>}
          <Button type="submit" className="self-start" disabled={email.isPending}>{email.isPending ? 'Sending…' : 'Send confirmation link'}</Button>
        </form>}
    </Section>

    <Section title="Password" description="Changing it signs you out on other devices.">
      <form className="flex flex-col gap-4" onSubmit={submitPassword}>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="account-current-password" required>Current password</FieldLabel><Input id="account-current-password" name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} disabled={password.isPending} /></Field>
          <Field><FieldLabel htmlFor="account-new-password" required>New password</FieldLabel><Input id="account-new-password" name="newPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={password.isPending} /><FieldDescription>Use at least 12 characters.</FieldDescription></Field>
        </FieldGroup>
        {password.isError && <p role="alert" className="text-sm text-destructive">{password.error.message}</p>}
        <Button type="submit" className="self-start" disabled={password.isPending}>{password.isPending ? 'Saving…' : 'Change password'}</Button>
      </form>
    </Section>

    <Section title="Devices" description="Sign out everywhere except this browser.">
      <Button variant="outline" className="w-fit" disabled={others.isPending} onClick={() => others.mutate()}>{others.isPending ? 'Signing out…' : 'Sign out of other devices'}</Button>
    </Section>

    <Section title="Delete account" description="This permanently removes your sign-in. It can’t be undone." tone="danger">
      {!ownershipKnown ? <Skeleton className="h-9 w-48" /> : ownedOrganizations > 0 ? <div className="flex flex-col items-start gap-3 text-sm"><p className="text-muted-foreground">Delete your {ownedOrganizations === 1 ? 'organization' : 'organizations'} first, including archived ones.</p><Button variant="outline" size="sm" nativeButton={false} render={<Link href="/organizations" />}>Manage organizations</Button></div>
        : <form className="flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); removeAccount.mutate(deletePassword) }}>
          <Field className="flex-1"><FieldLabel htmlFor="account-delete-password" required>Current password</FieldLabel><Input id="account-delete-password" type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => { setDeletePassword(event.target.value); removeAccount.reset() }} maxLength={128} disabled={removeAccount.isPending} /></Field>
          <Button type="submit" variant="destructive" disabled={!deletePassword || removeAccount.isPending}>{removeAccount.isPending ? 'Deleting…' : 'Delete account'}</Button>
        </form>}
      {removeAccount.isError && <p role="alert" className="mt-3 text-sm text-destructive">{removeAccount.error.message}</p>}
    </Section>
  </div>
}

