'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClockIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { leagueRequest } from '@/lib/league-client'

type DeleteTarget = { path: string; title: string; description: string; confirmName?: string; submitLabel?: string; success: string }

// Confirms a delete. Records that remove everything inside them ask for the name to be typed first.
export function DeleteRecordDialog({ target, onClose, onDeleted }: { target: DeleteTarget | null; onClose: () => void; onDeleted?: () => void }) {
  const client = useQueryClient()
  const [typed, setTyped] = useState('')
  const mutation = useMutation({
    mutationFn: (value: DeleteTarget) => leagueRequest(value.path, client, 'DELETE', value.confirmName ? { confirmName: typed } : undefined),
    onSuccess: (_data, value) => { toast.success(value.success); close(); onDeleted?.() },
  })
  const ready = !target?.confirmName || typed.trim() === target.confirmName.trim()
  function close() { setTyped(''); mutation.reset(); onClose() }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (target && ready && !mutation.isPending) mutation.mutate(target)
  }
  return <Dialog open={!!target} onOpenChange={(open) => { if (!open && !mutation.isPending) close() }}>
    <DialogContent showCloseButton={!mutation.isPending}>
      <DialogHeader><DialogTitle>{target?.title}</DialogTitle><DialogDescription>{target?.description}</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="flex flex-col gap-5">
        {target?.confirmName && <Field><FieldLabel htmlFor="confirm-delete-name">Type <span className="font-semibold">{target.confirmName}</span> to confirm</FieldLabel><Input id="confirm-delete-name" value={typed} onChange={(event) => { setTyped(event.target.value); if (mutation.isError) mutation.reset() }} autoComplete="off" disabled={mutation.isPending} /></Field>}
        {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={mutation.isPending} onClick={close}>Cancel</Button><Button type="submit" variant="destructive" disabled={!ready || mutation.isPending}>{mutation.isPending ? 'Deleting…' : target?.submitLabel ?? 'Delete'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}

export type { DeleteTarget }

// Archives or restores a record, offering an undo in the confirmation toast.
export function useArchiveAction() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ path }: { path: string; message: string; undoPath?: string }) => leagueRequest(path, client, 'POST', {}),
    onSuccess: (_data, { message, undoPath }) => {
      toast.success(message, undoPath ? { action: { label: 'Undo', onClick: () => { void leagueRequest(undoPath, client, 'POST', {}).catch((error: Error) => toast.error(error.message)) } } } : undefined)
    },
    onError: (error) => toast.error(error.message),
  })
}



type ActiveSeason = { id: string; name: string; league_name?: string }
type GuardedArchive = { kind: 'league' | 'organization'; name: string; path: string; undoPath: string; message: string; activeSeasonsPath: string }

// Archives straight away unless active seasons would go with it; then a confirmation names them first.
export function useGuardedArchive() {
  const client = useQueryClient()
  const archive = useArchiveAction()
  const [checking, setChecking] = useState(false)
  const [confirm, setConfirm] = useState<{ request: GuardedArchive; seasons: ActiveSeason[] } | null>(null)

  async function request(value: GuardedArchive) {
    setChecking(true)
    try {
      const data = await leagueRequest<ActiveSeason[] | { items: ActiveSeason[] }>(value.activeSeasonsPath, client)
      const seasons = Array.isArray(data) ? data : data.items
      if (seasons.length) setConfirm({ request: value, seasons })
      else archive.mutate(value)
    } catch (error) {
      toast.error(error instanceof Error ? `Couldn’t check for active seasons. ${error.message}` : 'Couldn’t check for active seasons.')
    } finally { setChecking(false) }
  }

  const close = () => { if (!archive.isPending) setConfirm(null) }
  const target = confirm?.request
  const many = (confirm?.seasons.length ?? 0) > 1
  const dialog: ReactNode = <Dialog open={!!confirm} onOpenChange={(open) => { if (!open) close() }}>
    <DialogContent showCloseButton={!archive.isPending} className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Archive {target?.name} mid-season?</DialogTitle>
        <DialogDescription>{target?.kind === 'organization' ? 'This organization has' : 'This league has'} {many ? 'active seasons' : 'an active season'}. Archiving takes {many ? 'them' : 'it'} out of your workspace and off the public website, and {many ? 'their' : 'its'} unplayed games won’t be played.</DialogDescription>
      </DialogHeader>
      <ul aria-label="Active seasons" className="flex flex-col divide-y rounded-lg border">
        {confirm?.seasons.map((season) => <li key={season.id} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
          <CalendarClockIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium">{season.name}{season.league_name && <span className="font-normal text-muted-foreground"> · {season.league_name}</span>}</span>
          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">Active</span>
        </li>)}
      </ul>
      <p className="text-sm text-muted-foreground">You can restore {target?.kind === 'organization' ? 'it' : 'the league'} later from Archived.</p>
      {archive.isError && <p role="alert" className="text-sm text-destructive">{archive.error.message}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={archive.isPending} onClick={close}>Cancel</Button>
        <Button type="button" variant="destructive" disabled={archive.isPending} onClick={() => { if (target) archive.mutate(target, { onSuccess: () => setConfirm(null) }) }}>{archive.isPending ? 'Archiving…' : `Archive ${target?.kind ?? 'league'} anyway`}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  return { archive: request, pending: checking || archive.isPending, dialog }
}
