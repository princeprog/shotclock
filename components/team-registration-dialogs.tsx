'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { leagueRequest } from '@/lib/league-client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

type Team = { id: string; name: string; abbreviation: string | null }
type Division = { id: string; name: string }
const selectClass = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'

export function RegisterExistingTeamDialog({ open, onOpenChange, leagueId, seasonId, divisions, initialDivisionId }: { open: boolean; onOpenChange: (open: boolean) => void; leagueId: string; seasonId: string; divisions: Division[]; initialDivisionId?: string }) {
  const client = useQueryClient()
  const [search, setSearch] = useState('')
  const [teamId, setTeamId] = useState('')
  const [divisionId, setDivisionId] = useState(divisions.some((division) => division.id === initialDivisionId) ? initialDivisionId! : divisions.length === 1 ? divisions[0].id : '')
  const teams = useQuery({ queryKey: ['league', `leagues/${leagueId}/teams`], queryFn: () => leagueRequest<Team[]>(`leagues/${leagueId}/teams`, client), enabled: open, retry: false })
  const registrations = useQuery({ queryKey: ['league', `seasons/${seasonId}/teams?divisionId=${divisionId}`], queryFn: () => leagueRequest<{ team_id: string }[]>(`seasons/${seasonId}/teams?divisionId=${divisionId}`, client), enabled: open && !!divisionId, retry: false })
  const available = (teams.data ?? []).filter((team) => !(registrations.data ?? []).some((row) => row.team_id === team.id) && team.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const mutation = useMutation({
    mutationFn: () => leagueRequest(`seasons/${seasonId}/teams`, client, 'POST', { teamId, divisionId }),
    onSuccess: () => { toast.success('Team registered for the division.'); setSearch(''); setTeamId(''); onOpenChange(false) },
  })
  return <Dialog open={open} onOpenChange={(next) => { if (!mutation.isPending) { if (!next) { setSearch(''); setTeamId(''); mutation.reset() } onOpenChange(next) } }}><DialogContent showCloseButton={!mutation.isPending}>
    <DialogHeader><DialogTitle>Register existing team</DialogTitle><DialogDescription>Choose a division and an existing team from this league.</DialogDescription></DialogHeader>
    <Field><FieldLabel htmlFor="existing-team-division">Division</FieldLabel><select id="existing-team-division" className={selectClass} value={divisionId} onChange={(event) => { setDivisionId(event.target.value); setTeamId('') }} disabled={mutation.isPending}><option value="">Select a division</option>{divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}</select></Field>
    <Field><FieldLabel htmlFor="existing-team-search">Search teams</FieldLabel><Input id="existing-team-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setTeamId('') }} disabled={mutation.isPending} /></Field>
    {!divisionId ? <p className="text-sm text-muted-foreground">Choose a division to see available teams.</p> : teams.isLoading || registrations.isLoading ? <p role="status" className="text-sm text-muted-foreground">Loading teams…</p> : teams.isError || registrations.isError ? <div role="alert" className="text-sm text-destructive">Couldn’t load teams. <Button type="button" variant="outline" size="sm" onClick={() => { void teams.refetch(); void registrations.refetch() }}>Try again</Button></div> : available.length ? <Field><FieldLabel htmlFor="existing-team">Team</FieldLabel><select id="existing-team" className={selectClass} value={teamId} onChange={(event) => setTeamId(event.target.value)} disabled={mutation.isPending}><option value="">Select a team</option>{available.map((team) => <option key={team.id} value={team.id}>{team.name}{team.abbreviation ? ` (${team.abbreviation})` : ''}</option>)}</select></Field> : <p className="text-sm text-muted-foreground">{search ? 'No available teams match your search.' : 'All teams in this league are already registered in this division, or no teams exist yet.'}</p>}
    {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
    <DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!divisionId || !available.some((team) => team.id === teamId) || teams.isLoading || registrations.isLoading || teams.isError || registrations.isError || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Registering…' : 'Register team'}</Button></DialogFooter>
  </DialogContent></Dialog>
}

export function CorrectTeamRegistrationDialog({ team, divisions, onClose }: { team: { id: string; name: string; divisionId: string }; divisions: Division[]; onClose: () => void }) {
  const client = useQueryClient()
  const [divisionId, setDivisionId] = useState('')
  const [removing, setRemoving] = useState(false)
  const mutation = useMutation({
    mutationFn: () => leagueRequest(`season-teams/${team.id}`, client, removing ? 'DELETE' : 'PATCH', removing ? undefined : { divisionId }),
    onSuccess: () => { toast.success(removing ? 'Team registration removed.' : 'Team registration moved.'); onClose() },
  })
  return <Dialog open onOpenChange={(open) => { if (!open && !mutation.isPending) onClose() }}><DialogContent showCloseButton={!mutation.isPending}>
    <DialogHeader><DialogTitle>{removing ? 'Remove team registration' : 'Correct team registration'}</DialogTitle><DialogDescription>{removing ? `Remove ${team.name} from this division? The team record will remain available.` : `Move ${team.name} to another division in this draft season.`}</DialogDescription></DialogHeader>
    {removing ? <p className="text-sm text-muted-foreground">The registration must have no players or games. Move or remove its players and reschedule its games first.</p> : <><Field><FieldLabel htmlFor="team-correction-division">New division</FieldLabel><select id="team-correction-division" className={selectClass} value={divisionId} onChange={(event) => setDivisionId(event.target.value)} disabled={mutation.isPending}><option value="">Select a division</option>{divisions.filter((division) => division.id !== team.divisionId).map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}</select></Field><p className="text-sm text-muted-foreground">Roster players must be eligible for the new division. Games must be rescheduled first.</p></>}
    {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
    <DialogFooter>{removing ? <Button variant="outline" disabled={mutation.isPending} onClick={() => { setRemoving(false); mutation.reset() }}>Back</Button> : <Button variant="outline" disabled={mutation.isPending} onClick={() => { setRemoving(true); mutation.reset() }}>Remove registration</Button>}<Button variant={removing ? 'destructive' : 'default'} disabled={mutation.isPending || (!removing && !divisionId)} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Saving…' : removing ? 'Remove registration' : 'Move team'}</Button></DialogFooter>
  </DialogContent></Dialog>
}
