'use client'

import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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

