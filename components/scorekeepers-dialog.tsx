'use client'

import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MailIcon, RotateCwIcon, UserRoundIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { leagueRequest } from '@/lib/league-client'

type Member = { id: string; email: string; name: string | null; createdAt: string }
type Invitation = { id: string; email: string; createdAt: string; expiresAt: string }
type ScorekeepersLeague = { id: string; name: string }

const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

// Owners invite people by email to keep score for one league, and manage who has access.
export function ScorekeepersDialog({ league, onClose }: { league: ScorekeepersLeague | null; onClose: () => void }) {
  return <Dialog open={league !== null} onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
      {league && <ScorekeepersPanel key={league.id} league={league} />}
    </DialogContent>
  </Dialog>
}

function ScorekeepersPanel({ league }: { league: ScorekeepersLeague }) {
  const client = useQueryClient()
  const path = `leagues/${league.id}/scorekeepers`
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [confirmRemove, setConfirmRemove] = useState('')
  const list = useQuery({ queryKey: ['league', path], queryFn: () => leagueRequest<{ members: Member[]; invitations: Invitation[] }>(path, client), retry: false })
  const invite = useMutation({
    mutationFn: (address: string) => leagueRequest<Invitation>(`leagues/${league.id}/invitations`, client, 'POST', { email: address }),
    onSuccess: (invitation) => { setEmail(''); toast.success(`Invitation sent to ${invitation.email}.`) },
  })
  const revoke = useMutation({
    mutationFn: (id: string) => leagueRequest(`invitations/${id}`, client, 'DELETE'),
    onSuccess: () => toast.success('Invitation cancelled.'),
  })
  const remove = useMutation({
    mutationFn: (id: string) => leagueRequest(`league-members/${id}`, client, 'DELETE'),
    onSuccess: () => { setConfirmRemove(''); toast.success('Scorekeeper removed.') },
  })
  const busy = invite.isPending || revoke.isPending || remove.isPending

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const address = email.trim()
    if (!validEmail(address)) { setEmailError('Enter a valid email address.'); return }
    setEmailError('')
    invite.mutate(address)
  }

  return <>
    <DialogHeader>
      <DialogTitle>Scorekeepers for {league.name}</DialogTitle>
      <DialogDescription>Scorekeepers can record live scores and player stats for this league’s games. They can’t change teams, schedules or settings.</DialogDescription>
    </DialogHeader>
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <Field data-invalid={!!emailError || invite.isError}>
        <FieldLabel htmlFor="scorekeeper-email">Invite by email</FieldLabel>
        <div className="flex gap-2">
          <Input id="scorekeeper-email" type="email" autoComplete="off" value={email} maxLength={320} placeholder="name@example.com" aria-invalid={!!emailError || invite.isError} onChange={(event) => { setEmail(event.target.value); setEmailError(''); if (invite.isError) invite.reset() }} />
          <Button type="submit" disabled={busy}><MailIcon data-icon="inline-start" />{invite.isPending ? 'Sending…' : 'Invite'}</Button>
        </div>
        {emailError ? <FieldError>{emailError}</FieldError> : invite.isError ? <FieldError>{invite.error.message}</FieldError> : <FieldDescription>The link in the email expires after 7 days.</FieldDescription>}
      </Field>
    </form>
    {list.isPending ? <div role="status" aria-label="Loading scorekeepers" className="flex flex-col gap-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
      : list.isError ? <p role="alert" className="text-sm text-destructive">{list.error.message}</p>
      : <div className="flex flex-col gap-5">
        <section aria-labelledby="scorekeepers-members" className="flex flex-col gap-2">
          <h3 id="scorekeepers-members" className="text-sm font-medium">Scorekeepers</h3>
          {list.data.members.length ? <ul className="divide-y rounded-lg border">{list.data.members.map((member) => <li key={member.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><UserRoundIcon aria-hidden="true" className="size-4" /></span>
            <div className="flex min-w-0 flex-1 flex-col"><span className="truncate text-sm font-medium">{member.name?.trim() || member.email}</span><span className="truncate text-xs text-muted-foreground">{member.name?.trim() ? `${member.email} · ` : ''}Since {shortDate.format(new Date(member.createdAt))}</span></div>
            {confirmRemove === member.id
              ? <div className="flex gap-1"><Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmRemove('')}>Cancel</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => remove.mutate(member.id)}>{remove.isPending ? 'Removing…' : 'Remove'}</Button></div>
              : <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmRemove(member.id)}>Remove</Button>}
          </li>)}</ul> : <p className="text-sm text-muted-foreground">No scorekeepers yet.</p>}
        </section>
        {list.data.invitations.length > 0 && <section aria-labelledby="scorekeepers-pending" className="flex flex-col gap-2">
          <h3 id="scorekeepers-pending" className="text-sm font-medium">Pending invitations</h3>
          <ul className="divide-y rounded-lg border">{list.data.invitations.map((invitation) => {
            const expired = new Date(invitation.expiresAt).getTime() <= list.dataUpdatedAt
            return <li key={invitation.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col"><span className="truncate text-sm font-medium">{invitation.email}</span><span className={expired ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>{expired ? 'Expired' : `Expires ${shortDate.format(new Date(invitation.expiresAt))}`}</span></div>
              <Button size="icon-sm" variant="ghost" aria-label={`Resend invitation to ${invitation.email}`} title="Resend" disabled={busy} onClick={() => invite.mutate(invitation.email)}><RotateCwIcon /></Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Cancel invitation to ${invitation.email}`} title="Cancel invitation" disabled={busy} onClick={() => revoke.mutate(invitation.id)}><XIcon /></Button>
            </li>
          })}</ul>
        </section>}
        {(revoke.isError || remove.isError) && <p role="alert" className="text-sm text-destructive">{(revoke.error ?? remove.error)?.message}</p>}
      </div>}
  </>
}

