'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardListIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RestoreSession } from '@/components/session-actions'
import { leagueRequest } from '@/lib/league-client'
import { clearPendingInvitation, readPendingInvitation, savePendingInvitation } from '@/lib/pending-invitation'

type Invitation = { leagueName: string; organizationName: string; email: string; status: 'pending' | 'expired' | 'revoked' | 'accepted' }

const closedCopy = {
  expired: { title: 'This invitation has expired', body: 'Invitations last 7 days. Ask the league owner to send you a new one.' },
  revoked: { title: 'This invitation was cancelled', body: 'Ask the league owner to send you a new invitation.' },
  accepted: { title: 'This invitation was already accepted', body: 'Open scorekeeping to see the games you can score.' },
}

// A link that matches no invitation resolves to null; other failures are errors worth retrying.
async function lookup(token: string): Promise<Invitation | null> {
  const response = await fetch('/api/invitations/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Shotclock' }, body: JSON.stringify({ token }) })
  if (response.status === 404) return null
  const data = await response.json().catch(() => ({})) as Invitation & { error?: string }
  if (!response.ok) throw new Error(data.error || 'Couldn’t load this invitation.')
  return data
}

const noSubscription = () => () => {}

// A token in the link wins and is saved for after sign-in. Otherwise use the one saved earlier.
function takeInvitationToken() {
  if (typeof window === 'undefined') return null
  const fromLink = new URLSearchParams(window.location.hash.slice(1)).get('token')
  if (!fromLink) return readPendingInvitation()
  savePendingInvitation(fromLink)
  return fromLink
}

// Reads the token from the link (or from before sign-in), shows the league, and lets the invited account accept it.
export function InvitationAccept({ signedInEmail, restoring }: { signedInEmail: string | null; restoring: boolean }) {
  const router = useRouter()
  const client = useQueryClient()
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false)
  const [token] = useState(takeInvitationToken)
  // The token is saved, so remove it from the address bar where it could be copied or shared.
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname)
  }, [])
  const invitation = useQuery({ queryKey: ['invitation', token], queryFn: () => lookup(token!), enabled: !!token && !restoring, retry: false })
  const accept = useMutation({
    mutationFn: () => leagueRequest<{ leagueName: string }>('invitations/accept', client, 'POST', { token }),
    onSuccess: (result) => {
      clearPendingInvitation()
      toast.success(`You now keep score for ${result.leagueName}.`)
      router.replace('/scorekeeping')
    },
  })

  if (restoring) return <RestoreSession />
  if (!hydrated || (invitation.isPending && !!token)) return <div role="status" aria-label="Loading invitation" className="flex flex-col gap-3"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-24 w-full" /></div>
  if (invitation.isError) return <Closed title="Couldn’t load this invitation" body={invitation.error.message} signedIn={!!signedInEmail} keepToken />
  const data = invitation.data
  if (!token || !data) return <Closed title="This invitation link isn’t valid" body="Open the link from your invitation email again, or ask the league owner for a new one." signedIn={!!signedInEmail} />
  if (data.status !== 'pending') return <Closed {...closedCopy[data.status]} signedIn={!!signedInEmail} accepted={data.status === 'accepted'} />
  const wrongAccount = !!signedInEmail && signedInEmail.toLowerCase() !== data.email

  return <div className="flex flex-col gap-6">
    <div className="flex flex-col gap-3">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><ClipboardListIcon aria-hidden="true" /></span>
      <h1 className="text-2xl font-semibold tracking-tight">Keep score for {data.leagueName}</h1>
      <p className="text-sm text-muted-foreground">{data.organizationName} invited <span className="font-medium text-foreground">{data.email}</span> to keep score for its games. Scorekeepers can record live scores and player stats for this league only.</p>
    </div>
    {wrongAccount && <Alert><AlertTitle>You’re signed in as {signedInEmail}</AlertTitle><AlertDescription>Sign out and sign in with {data.email} to accept this invitation.</AlertDescription></Alert>}
    {accept.isError && <p role="alert" className="text-sm text-destructive">{accept.error.message}</p>}
    {signedInEmail
      ? <Button disabled={wrongAccount || accept.isPending} onClick={() => accept.mutate()}>{accept.isPending ? 'Accepting…' : 'Accept invitation'}</Button>
      : <div className="flex flex-col gap-3">
        <Button nativeButton={false} render={<Link href="/login" />}>Sign in to accept</Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/register" />}>Create an account</Button>
        <p className="text-xs text-muted-foreground">Use {data.email}. After you sign in, you’ll come back here to accept.</p>
      </div>}
  </div>
}

function Closed({ title, body, signedIn, accepted = false, keepToken = false }: { title: string; body: string; signedIn: boolean; accepted?: boolean; keepToken?: boolean }) {
  useEffect(() => { if (!keepToken) clearPendingInvitation() }, [keepToken])
  return <div className="flex flex-col gap-5">
    <Alert><AlertTitle>{title}</AlertTitle><AlertDescription>{body}</AlertDescription></Alert>
    <Button variant="outline" nativeButton={false} render={<Link href={accepted ? '/scorekeeping' : signedIn ? '/organizations' : '/login'} />}>{accepted ? 'Open scorekeeping' : signedIn ? 'Continue' : 'Sign in'}</Button>
  </div>
}

