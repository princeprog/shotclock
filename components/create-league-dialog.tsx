'use client'

import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { leagueRequest } from '@/lib/league-client'

export function CreateLeagueDialog({ organizationId, first = false }: { organizationId: string; first?: boolean }) {
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [nameError, setNameError] = useState('')
  const createLeague = useMutation({
    mutationFn: (body: { name: string; location: string | null }) => leagueRequest(`organizations/${organizationId}/leagues`, client, 'POST', body),
    onSuccess: () => {
      setOpen(false)
      setName('')
      setLocation('')
      setNameError('')
      toast.success('League created.')
    },
  })

  function changeOpen(nextOpen: boolean) {
    if (createLeague.isPending) return
    setOpen(nextOpen)
    if (!nextOpen) { setName(''); setLocation(''); setNameError(''); createLeague.reset() }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) { setNameError('Enter a league name.'); return }
    setNameError('')
    createLeague.mutate({ name: trimmedName, location: location.trim() || null })
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger render={<Button />}><PlusIcon data-icon="inline-start" />{first ? 'Create your first league' : 'Create league'}</DialogTrigger>
    <DialogContent showCloseButton={!createLeague.isPending}>
      <DialogHeader><DialogTitle>{first ? 'Create your first league' : 'Create a league'}</DialogTitle><DialogDescription>Enter a name and an optional location. You can update these details later.</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="flex flex-col gap-6">
        <FieldGroup className="gap-4">
          <Field data-invalid={!!nameError}><FieldLabel htmlFor="create-league-name">League name</FieldLabel><Input id="create-league-name" value={name} onChange={(event) => { setName(event.target.value); setNameError('') }} maxLength={120} required disabled={createLeague.isPending} aria-invalid={!!nameError} />{nameError && <FieldError>{nameError}</FieldError>}</Field>
          <Field><FieldLabel htmlFor="create-league-location">Location (optional)</FieldLabel><Input id="create-league-location" value={location} onChange={(event) => setLocation(event.target.value)} maxLength={160} disabled={createLeague.isPending} /></Field>
        </FieldGroup>
        {createLeague.isError && <FieldError>{createLeague.error.message}</FieldError>}
        <DialogFooter><Button type="button" variant="outline" disabled={createLeague.isPending} onClick={() => changeOpen(false)}>Cancel</Button><Button type="submit" disabled={createLeague.isPending}>{createLeague.isPending ? 'Creating…' : 'Create league'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
