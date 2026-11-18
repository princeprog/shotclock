'use client'

import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { leagueRequest } from '@/lib/league-client'
import { browserTimeZone } from '@/lib/league-time'
import { TimeZonePicker } from '@/components/time-zone-picker'

export type EditableLeague = { id: string; name: string; location: string | null; time_zone?: string | null }

// Edits a league's name, location and time zone. Render with key={league.id} so each league starts from its saved values.
export function EditLeagueDialog({ league, onClose }: { league: EditableLeague | null; onClose: () => void }) {
  const client = useQueryClient()
  const [name, setName] = useState(league?.name ?? '')
  const [location, setLocation] = useState(league?.location ?? '')
  const [timeZone, setTimeZone] = useState(league?.time_zone ?? browserTimeZone())
  const [nameError, setNameError] = useState('')
  const save = useMutation({
    mutationFn: (body: { name: string; location: string | null; timeZone: string | null }) => leagueRequest(`leagues/${league!.id}`, client, 'PATCH', body),
    onSuccess: () => { toast.success('League updated.'); onClose() },
  })
  const changed = !!league && (name.trim() !== league.name || (location.trim() || null) !== (league.location || null) || (timeZone || null) !== (league.time_zone ?? null))

  function close(open: boolean) { if (!open && !save.isPending) onClose() }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) { setNameError('Enter a league name.'); return }
    setNameError('')
    save.mutate({ name: trimmedName, location: location.trim() || null, timeZone: timeZone || null })
  }

  return <Dialog open={!!league} onOpenChange={close}>
    <DialogContent showCloseButton={!save.isPending}>
      <DialogHeader><DialogTitle>Edit league</DialogTitle><DialogDescription>Update {league?.name ?? 'this league'}’s details. Changes apply everywhere the league appears.</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="flex flex-col gap-6">
        <FieldGroup className="gap-4">
          <Field data-invalid={!!nameError}><FieldLabel htmlFor="edit-league-name" required>League name</FieldLabel><Input id="edit-league-name" value={name} onChange={(event) => { setName(event.target.value); setNameError('') }} maxLength={120} required disabled={save.isPending} aria-invalid={!!nameError} autoFocus />{nameError && <FieldError>{nameError}</FieldError>}</Field>
          <Field><FieldLabel htmlFor="edit-league-location">Location (optional)</FieldLabel><Input id="edit-league-location" value={location} onChange={(event) => setLocation(event.target.value)} maxLength={160} placeholder="City or venue area" disabled={save.isPending} /></Field>
          <Field><FieldLabel htmlFor="edit-league-time-zone">Time zone</FieldLabel><TimeZonePicker id="edit-league-time-zone" value={timeZone} onChange={setTimeZone} disabled={save.isPending} /><FieldDescription>Game times show in this zone for organizers and on the public website.</FieldDescription></Field>
        </FieldGroup>
        {save.isError && <FieldError>{save.error.message}</FieldError>}
        <DialogFooter><Button type="button" variant="outline" disabled={save.isPending} onClick={() => close(false)}>Cancel</Button><Button type="submit" disabled={save.isPending || !changed}>{save.isPending ? 'Saving…' : 'Save changes'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
