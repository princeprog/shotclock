'use client'

import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon, MoreVerticalIcon, PencilIcon, PlusIcon, SearchIcon, UsersIcon } from 'lucide-react'
import { toast } from 'sonner'
import { leagueRequest } from '@/lib/league-client'
import { applyLeagueMutation } from '@/lib/league-cache'
import { addRosterPlayer, correctionTeamsQueryKey, loadSeasonRegistrations, playerCorrections, updateOwnedPlayer, type PlayerDetails, type PlayerUpdate } from '@/lib/roster-player-flow'
import { readOrganizationSelection, resolveSelectedOrganization, subscribeOrganizationSelection } from '@/lib/organization-selection'
import { useAppSelector } from '@/lib/store-hooks'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { SeasonStatusBadge } from '@/components/season-status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Organization = { id: string; name: string }
type RosterContext = { id: string; team_name: string; abbreviation: string | null; league_name: string; season_id: string; season_name: string; season_status: 'draft' | 'active' | 'completed'; organization_id: string; division_id: string; division_name: string }
type OrganizationPlayer = { id: string; first_name: string; last_name: string; date_of_birth: string | null; position: string | null; requires_fork: boolean }
type Player = Omit<OrganizationPlayer, 'id'> & { id: string; player_id: string; jersey_number: number | null }
type SeasonTeam = { id: string; name: string; division_id: string; division_name: string }
type DialogState = { kind: 'add' } | { kind: 'edit'; player: Player } | { kind: 'details'; player: Player }
const positions = [['point_guard', 'Point guard'], ['shooting_guard', 'Shooting guard'], ['small_forward', 'Small forward'], ['power_forward', 'Power forward'], ['center', 'Center']] as const
const playerName = (player: Pick<OrganizationPlayer, 'first_name' | 'last_name'>) => `${player.first_name} ${player.last_name}`
const birthDate = (date: string | null) => date ? date.slice(0, 10) : ''
const selectClass = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'
const applyPlayerUpdate = (player: OrganizationPlayer, update: PlayerUpdate): OrganizationPlayer => ({ ...player, first_name: update.firstName ?? player.first_name, last_name: update.lastName ?? player.last_name, date_of_birth: update.dateOfBirth ?? player.date_of_birth, position: update.position === undefined ? player.position : update.position })

function PlayerForm({ seasonTeamId, context, dialog, onDone, onCancel, onPendingChange }: { seasonTeamId: string; context: RosterContext; dialog: DialogState; onDone: () => void; onCancel: () => void; onPendingChange: (pending: boolean) => void }) {
  const client = useQueryClient()
  const [validationError, setValidationError] = useState('')
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [search, setSearch] = useState('')
  const [firstName, setFirstName] = useState(dialog.kind === 'details' ? dialog.player.first_name : '')
  const [lastName, setLastName] = useState(dialog.kind === 'details' ? dialog.player.last_name : '')
  const [selectedPlayer, setSelectedPlayer] = useState<OrganizationPlayer | null>(null)
  const [createdPlayer, setCreatedPlayer] = useState<OrganizationPlayer | null>(null)
  const [detailsIdentity, setDetailsIdentity] = useState(() => dialog.kind === 'details' ? { id: dialog.player.player_id, requires_fork: dialog.player.requires_fork } : null)
  const [editingSavedPlayer, setEditingSavedPlayer] = useState(false)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const lookup = mode === 'new' ? `${firstName.trim()} ${lastName.trim()}`.trim() : search.trim()
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(lookup), 300)
    return () => window.clearTimeout(timer)
  }, [lookup])
  const playerPath = `organizations/${context.organization_id}/players?${new URLSearchParams({ search: debouncedSearch })}`
  const players = useQuery({ queryKey: ['league', playerPath], queryFn: () => leagueRequest<OrganizationPlayer[]>(playerPath, client), enabled: dialog.kind === 'add' && !createdPlayer && !!debouncedSearch && (mode === 'existing' || (!!firstName.trim() && !!lastName.trim())), retry: false })
  const teamPath = `seasons/${context.season_id}/teams`
  const teams = useQuery({ queryKey: correctionTeamsQueryKey(context.season_id), queryFn: () => loadSeasonRegistrations(
    () => leagueRequest<{ id: string }[]>(`seasons/${context.season_id}/divisions`, client),
    (id) => leagueRequest<SeasonTeam[]>(`${teamPath}?${new URLSearchParams({ divisionId: id })}`, client),
  ), enabled: dialog.kind === 'edit' && context.season_status === 'draft', retry: false })
  const duplicatePlayers = lookup === debouncedSearch ? (players.data ?? []).filter((player) => playerName(player).toLocaleLowerCase() === `${firstName.trim()} ${lastName.trim()}`.toLocaleLowerCase()) : []
  const checkingDuplicates = dialog.kind === 'add' && mode === 'new' && !createdPlayer && !!firstName.trim() && !!lastName.trim() && (lookup !== debouncedSearch || players.isFetching)
  const savedPlayer = selectedPlayer ?? createdPlayer
  const forkPlayer = (id: string) => leagueRequest<OrganizationPlayer>(`organizations/${context.organization_id}/players/${id}/fork`, client, 'POST', {})
  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const jersey = String(data.get('jerseyNumber') ?? '').trim()
      const jerseyNumber = jersey === '' ? null : Number(jersey)
      if (dialog.kind === 'add') {
        const player: PlayerDetails = { firstName: firstName.trim(), lastName: lastName.trim(), dateOfBirth: String(data.get('dateOfBirth') ?? ''), ...(data.get('position') ? { position: String(data.get('position')) } : {}) }
        const playerUpdate = savedPlayer && editingSavedPlayer ? playerCorrections(
          { firstName: savedPlayer.first_name, lastName: savedPlayer.last_name, dateOfBirth: birthDate(savedPlayer.date_of_birth) || null, position: savedPlayer.position },
          { firstName: String(data.get('retryFirstName') ?? '').trim(), lastName: String(data.get('retryLastName') ?? '').trim(), dateOfBirth: String(data.get('retryDateOfBirth') ?? ''), position: String(data.get('retryPosition') ?? '') || null },
        ) : selectedPlayer && !selectedPlayer.date_of_birth ? { dateOfBirth: String(data.get('existingDateOfBirth') ?? '') } : undefined
        await addRosterPlayer(savedPlayer ? { playerId: savedPlayer.id, requiresFork: savedPlayer.requires_fork, jerseyNumber, ...(playerUpdate ? { playerUpdate } : {}) } : { player, jerseyNumber }, {
          create: (body) => leagueRequest<{ id: string }>(`organizations/${context.organization_id}/players`, client, 'POST', body),
          fork: forkPlayer,
          onForked: setSelectedPlayer,
          update: (id, body) => leagueRequest(`players/${id}`, client, 'PATCH', body),
          register: async (body) => { try { return await leagueRequest(`season-teams/${seasonTeamId}/roster`, client, 'POST', body) } catch (error) { setEditingSavedPlayer(true); throw error } },
          onCreated: (id) => setCreatedPlayer({ id, first_name: player.firstName, last_name: player.lastName, date_of_birth: player.dateOfBirth, position: player.position ?? null, requires_fork: false }),
          onUpdated: (update) => { setSelectedPlayer((current) => current ? applyPlayerUpdate(current, update) : current); setCreatedPlayer((current) => current ? applyPlayerUpdate(current, update) : current) },
        })
      } else if (dialog.kind === 'details') {
        const dateOfBirth = String(data.get('dateOfBirth') ?? '')
        if (!detailsIdentity) throw new Error('Player is unavailable.')
        await updateOwnedPlayer(detailsIdentity.id, detailsIdentity.requires_fork, { firstName: firstName.trim(), lastName: lastName.trim(), ...(dateOfBirth ? { dateOfBirth } : {}), position: String(data.get('position') ?? '') || null }, {
          fork: forkPlayer,
          onForked: (player) => setDetailsIdentity({ id: player.id, requires_fork: player.requires_fork }),
          update: (id, body) => leagueRequest(`players/${id}`, client, 'PATCH', body),
        })
      } else {
        const destination = String(data.get('seasonTeamId') ?? seasonTeamId)
        await leagueRequest(`rosters/${dialog.player.id}`, client, 'PATCH', { jerseyNumber, ...(context.season_status === 'draft' && destination !== seasonTeamId ? { seasonTeamId: destination } : {}) })
        if (destination !== seasonTeamId) await applyLeagueMutation(client, `season-teams/${seasonTeamId}/roster`, 'POST', {}, {})
      }
    },
    onSuccess: () => {
      toast.success(dialog.kind === 'add' ? 'Player added to the roster.' : dialog.kind === 'details' ? 'Player details updated.' : 'Roster updated.')
      onDone()
    },
    onSettled: () => onPendingChange(false),
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (checkingDuplicates) return
    const data = new FormData(event.currentTarget)
    if ((dialog.kind === 'details' || (dialog.kind === 'add' && mode === 'new' && !createdPlayer)) && (!firstName.trim() || !lastName.trim())) {
      setValidationError('Enter the player’s first and last name.')
      return
    }
    if (dialog.kind === 'add' && mode === 'existing' && !selectedPlayer && !createdPlayer) { setValidationError('Select an existing player or create a new player.'); return }
    if (dialog.kind === 'add' && editingSavedPlayer && (!String(data.get('retryFirstName') ?? '').trim() || !String(data.get('retryLastName') ?? '').trim())) { setValidationError('Enter the player’s first and last name.'); return }
    setValidationError('')
    onPendingChange(true)
    mutation.mutate(data)
  }
  return <form onSubmit={submit} onChange={() => setValidationError('')} className="flex flex-col gap-6">
    <FieldGroup className="gap-4">
      {dialog.kind === 'add' && !createdPlayer && <div className="flex flex-wrap gap-2"><Button type="button" variant={mode === 'existing' ? 'default' : 'outline'} onClick={() => { setMode('existing'); setSelectedPlayer(null); setEditingSavedPlayer(false); mutation.reset() }} disabled={mutation.isPending}>Find existing player</Button><Button type="button" variant={mode === 'new' ? 'default' : 'outline'} onClick={() => { setMode('new'); setSelectedPlayer(null); setEditingSavedPlayer(false); mutation.reset() }} disabled={mutation.isPending}>Create new player</Button></div>}
      {dialog.kind === 'add' && createdPlayer && <p className="text-sm">Player created. You can correct their details and retry adding them to this roster.</p>}
      {dialog.kind === 'add' && mode === 'existing' && !createdPlayer && <>
        <Field className="gap-2"><FieldLabel htmlFor="organization-player-search">Search organization players</FieldLabel><Input id="organization-player-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setSelectedPlayer(null); setEditingSavedPlayer(false); mutation.reset() }} disabled={mutation.isPending} placeholder="Search by name" /></Field>
        {selectedPlayer ? <p className="text-sm">Selected: <strong>{playerName(selectedPlayer)}</strong>{selectedPlayer.date_of_birth ? ` · ${birthDate(selectedPlayer.date_of_birth)}` : ''}</p> : search.trim() && (lookup !== debouncedSearch || players.isFetching) ? <p role="status" className="text-sm text-muted-foreground">Searching players…</p> : search.trim() && players.isError ? <p role="alert" className="text-sm text-destructive">Couldn’t search players. <button type="button" className="underline" onClick={() => void players.refetch()}>Try again</button></p> : debouncedSearch && <div className="max-h-40 overflow-y-auto rounded-md border">{players.data?.length ? players.data.map((player) => <button key={player.id} type="button" className="block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted focus-visible:outline focus-visible:outline-2" onClick={() => setSelectedPlayer(player)}><span className="font-medium">{playerName(player)}</span><span className="ml-2 text-muted-foreground">{player.date_of_birth ? birthDate(player.date_of_birth) : 'Date of birth not set'}</span></button>) : <p className="p-3 text-sm text-muted-foreground">No players found. You can create a new player.</p>}</div>}
        {selectedPlayer && !selectedPlayer.date_of_birth && !editingSavedPlayer && <Field className="gap-2"><FieldLabel htmlFor="existing-player-date-of-birth">Date of birth</FieldLabel><Input id="existing-player-date-of-birth" name="existingDateOfBirth" type="date" required disabled={mutation.isPending} aria-describedby="existing-player-birth-help" /><FieldDescription id="existing-player-birth-help">Required to add this player. Their player record will be updated.</FieldDescription></Field>}
      </>}
      {dialog.kind === 'add' && editingSavedPlayer && savedPlayer && <>
        <p className="text-sm text-muted-foreground">Correct this player’s details before retrying. Changes update their organization player record.</p>
        <Field className="gap-2"><FieldLabel htmlFor="retry-first-name">First name</FieldLabel><Input id="retry-first-name" name="retryFirstName" defaultValue={savedPlayer.first_name} required maxLength={80} disabled={mutation.isPending} /></Field>
        <Field className="gap-2"><FieldLabel htmlFor="retry-last-name">Last name</FieldLabel><Input id="retry-last-name" name="retryLastName" defaultValue={savedPlayer.last_name} required maxLength={80} disabled={mutation.isPending} /></Field>
        <Field className="gap-2"><FieldLabel htmlFor="retry-date-of-birth">Date of birth</FieldLabel><Input id="retry-date-of-birth" name="retryDateOfBirth" type="date" defaultValue={birthDate(savedPlayer.date_of_birth)} required disabled={mutation.isPending} /></Field>
        <Field className="gap-2"><FieldLabel htmlFor="retry-position">Position <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><select id="retry-position" name="retryPosition" className={selectClass} defaultValue={savedPlayer.position ?? ''} disabled={mutation.isPending}><option value="">Not set</option>{positions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      </>}
      {(dialog.kind === 'details' || (dialog.kind === 'add' && mode === 'new' && !createdPlayer)) && <>
        <Field className="gap-2"><FieldLabel htmlFor="roster-first-name">First name</FieldLabel><Input id="roster-first-name" name="firstName" required maxLength={80} value={firstName} onChange={(event) => setFirstName(event.target.value)} disabled={mutation.isPending} autoComplete="given-name" /></Field>
        <Field className="gap-2"><FieldLabel htmlFor="roster-last-name">Last name</FieldLabel><Input id="roster-last-name" name="lastName" required maxLength={80} value={lastName} onChange={(event) => setLastName(event.target.value)} disabled={mutation.isPending} autoComplete="family-name" /></Field>
        {dialog.kind === 'add' && duplicatePlayers.length > 0 && <Alert><AlertTitle>Possible duplicate</AlertTitle><AlertDescription>An organization player already has this name: {duplicatePlayers.map((player) => `${playerName(player)}${player.date_of_birth ? ` (${birthDate(player.date_of_birth)})` : ''}`).join(', ')}. You can select them or continue creating a new player.</AlertDescription></Alert>}
        {dialog.kind === 'add' && checkingDuplicates && <p role="status" className="text-sm text-muted-foreground">Checking for matching players…</p>}
        {dialog.kind === 'add' && !checkingDuplicates && players.isError && <p role="status" className="text-sm text-muted-foreground">Couldn’t check for matching players. You can still create this player.</p>}
        <Field className="gap-2"><FieldLabel htmlFor="player-date-of-birth">Date of birth{dialog.kind === 'details' && <span className="font-normal text-muted-foreground"> (optional)</span>}</FieldLabel><Input id="player-date-of-birth" name="dateOfBirth" type="date" required={dialog.kind === 'add'} defaultValue={dialog.kind === 'details' ? birthDate(dialog.player.date_of_birth) : ''} disabled={mutation.isPending} /></Field>
        <Field className="gap-2"><FieldLabel htmlFor="player-position">Position <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><select id="player-position" name="position" className={selectClass} defaultValue={dialog.kind === 'details' ? dialog.player.position ?? '' : ''} disabled={mutation.isPending}><option value="">Not set</option>{positions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      </>}
      {dialog.kind === 'edit' && context.season_status === 'draft' && <Field className="gap-2"><FieldLabel htmlFor="roster-team">Team and division</FieldLabel><select id="roster-team" name="seasonTeamId" className={selectClass} defaultValue={seasonTeamId} disabled={mutation.isPending || teams.isLoading || teams.isError}><option value={seasonTeamId}>{context.team_name} · {context.division_name}</option>{teams.data?.filter((team) => team.id !== seasonTeamId).map((team) => <option key={team.id} value={team.id}>{team.name} · {team.division_name}</option>)}</select>{teams.isError ? <FieldDescription>Couldn’t load other teams. <button type="button" className="underline" onClick={() => void teams.refetch()}>Try again</button></FieldDescription> : <FieldDescription>Correct the registration while the season is in draft.</FieldDescription>}</Field>}
      {dialog.kind !== 'details' && <Field className="gap-2"><FieldLabel htmlFor="roster-jersey">Jersey number <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><Input id="roster-jersey" name="jerseyNumber" type="number" min={0} max={999} step={1} defaultValue={dialog.kind === 'edit' ? dialog.player.jersey_number ?? '' : ''} disabled={mutation.isPending} aria-describedby="roster-jersey-help" /><FieldDescription id="roster-jersey-help">Use a unique number from 0 to 999.</FieldDescription></Field>}
    </FieldGroup>
    {(validationError || mutation.isError) && <p role="alert" className="text-sm text-destructive">{validationError || mutation.error?.message}</p>}
    <DialogFooter><Button type="button" variant="outline" disabled={mutation.isPending} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={mutation.isPending || checkingDuplicates}>{mutation.isPending ? 'Saving…' : dialog.kind === 'add' ? 'Add player' : 'Save changes'}</Button></DialogFooter>
  </form>
}

export function RosterWorkspace({ seasonTeamId, backHref }: { seasonTeamId: string; backHref: string }) {
  const client = useQueryClient()
  const storedOrganization = useSyncExternalStore(subscribeOrganizationSelection, readOrganizationSelection, () => '')
  const selectedOrganization = useAppSelector((state) => state.ui.organizationId)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [pending, setPending] = useState(false)
  const [playerToRemove, setPlayerToRemove] = useState<Player | null>(null)
  const removal = useMutation({ mutationFn: (id: string) => leagueRequest(`rosters/${id}`, client, 'DELETE'), onSuccess: () => { toast.success('Player removed from the roster.'); setPlayerToRemove(null) } })
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])
  const searchPending = search.trim() !== debouncedSearch
  const searchQuery = new URLSearchParams()
  if (debouncedSearch) searchQuery.set('search', debouncedSearch)
  const rosterPath = `season-teams/${seasonTeamId}/roster${searchQuery.size ? `?${searchQuery}` : ''}`
  const organizations = useQuery({ queryKey: ['league', 'organizations'], queryFn: () => leagueRequest<Organization[]>('organizations', client), retry: false })
  const organization = resolveSelectedOrganization(organizations.data ?? [], selectedOrganization, storedOrganization)
  const context = useQuery({ queryKey: ['league', `season-teams/${seasonTeamId}`], queryFn: () => leagueRequest<RosterContext>(`season-teams/${seasonTeamId}`, client), enabled: !!organization, retry: false })
  const roster = useQuery({ queryKey: ['league', rosterPath], queryFn: () => leagueRequest<Player[]>(rosterPath, client), enabled: !!organization && context.data?.organization_id === organization.id && !searchPending, retry: false })
  const editable = context.data?.season_status !== 'completed'

  return <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 p-4 md:p-8">
    <div><Button variant="ghost" size="sm" nativeButton={false} className="-ml-2" render={<Link href={backHref} />}><ArrowLeftIcon data-icon="inline-start" />Teams &amp; rosters</Button></div>
    {organizations.isLoading ? <div role="status" aria-label="Loading roster"><Skeleton className="h-9 w-52" /><Skeleton className="mt-6 h-32 w-full" /></div>
      : organizations.isError ? <Alert variant="destructive"><AlertTitle>Couldn’t load your organization</AlertTitle><AlertDescription><p>{organizations.error.message}</p><Button size="sm" variant="outline" className="mt-3" onClick={() => void organizations.refetch()}>Try again</Button></AlertDescription></Alert>
      : !organization ? <Alert><AlertTitle>Choose an organization</AlertTitle><AlertDescription><p>Select an organization to view its teams.</p><Button size="sm" variant="outline" className="mt-3" nativeButton={false} render={<Link href="/organizations" />}>Choose organization</Button></AlertDescription></Alert>
      : context.isLoading ? <div role="status" aria-label="Loading roster"><Skeleton className="h-9 w-52" /><Skeleton className="mt-6 h-32 w-full" /></div>
      : context.isError ? <Alert variant="destructive"><AlertTitle>Couldn’t load this roster</AlertTitle><AlertDescription><p>{context.error.message}</p><Button size="sm" variant="outline" className="mt-3" onClick={() => void context.refetch()}>Try again</Button></AlertDescription></Alert>
      : context.data && context.data.organization_id !== organization.id ? <Alert><AlertTitle>Choose the roster’s organization</AlertTitle><AlertDescription><p>This roster belongs to a different organization.</p><Button size="sm" variant="outline" className="mt-3" nativeButton={false} render={<Link href="/organizations" />}>Switch organization</Button></AlertDescription></Alert>
      : context.data && <>
        <div className="flex flex-wrap items-start justify-between gap-5 border-b pb-6">
          <div className="flex min-w-0 flex-col gap-3">
            <h2 className="break-words text-2xl font-semibold tracking-tight">{context.data.team_name} roster</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2"><p className="break-words text-sm text-muted-foreground">{context.data.league_name} · {context.data.season_name} · {context.data.division_name}</p><SeasonStatusBadge status={context.data.season_status} includeSeason /></div>
          </div>
          {editable && <Button onClick={() => setDialog({ kind: 'add' })}><PlusIcon data-icon="inline-start" />Add player</Button>}
        </div>
        {!editable && <Alert><AlertTitle>Season completed</AlertTitle><AlertDescription>This roster is read-only because the season has been completed.</AlertDescription></Alert>}
        <section aria-labelledby="roster-players-title" className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1"><h3 id="roster-players-title" className="font-medium">Players</h3>{!searchPending && !roster.isLoading && !roster.isError && roster.data && <p role="status" className="text-sm text-muted-foreground">{roster.data.length} {roster.data.length === 1 ? 'player' : 'players'} {debouncedSearch ? 'matching your search' : 'on this roster'}</p>}</div>
          <Field className="w-full gap-2 sm:w-64"><FieldLabel htmlFor="roster-search" className="sr-only">Search players</FieldLabel><InputGroup><InputGroupAddon><SearchIcon aria-hidden="true" /></InputGroupAddon><InputGroupInput id="roster-search" type="search" placeholder="Search players" maxLength={161} value={search} onChange={(event) => setSearch(event.target.value)} /></InputGroup></Field>
        </div>
        {searchPending || roster.isLoading ? <div role="status" aria-label="Loading players"><Skeleton className="h-32 w-full" /></div>
          : roster.isError ? <Alert variant="destructive"><AlertTitle>Couldn’t load players</AlertTitle><AlertDescription><p>{roster.error.message}</p><Button size="sm" variant="outline" className="mt-3" onClick={() => void roster.refetch()}>Try again</Button></AlertDescription></Alert>
          : roster.data?.length ? <Card className="gap-0 py-0"><CardContent className="px-0"><Table className="table-fixed"><caption className="sr-only">Players in {context.data.team_name} for {context.data.season_name}</caption><TableHeader className="bg-muted/30"><TableRow><TableHead scope="col" className="pl-5 text-muted-foreground">Player</TableHead><TableHead scope="col" className="w-28 text-muted-foreground sm:w-36">Jersey number</TableHead>{editable && <TableHead scope="col" className="w-14 pr-4 text-right"><span className="sr-only">Actions</span></TableHead>}</TableRow></TableHeader>
            <TableBody>{roster.data.map((player) => <TableRow key={player.id}><TableCell className="py-4 pl-5 whitespace-normal"><span className="break-words font-medium">{player.first_name} {player.last_name}</span>{player.position && <span className="block text-sm text-muted-foreground">{positions.find(([value]) => value === player.position)?.[1] ?? player.position}</span>}</TableCell><TableCell className="text-muted-foreground tabular-nums">{player.jersey_number === null ? 'Not set' : `#${player.jersey_number}`}</TableCell>{editable && <TableCell className="pr-4 text-right"><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${player.first_name} ${player.last_name}`} />}><MoreVerticalIcon /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem onClick={() => setDialog({ kind: 'edit', player })}><PencilIcon />{context.data.season_status === 'draft' ? 'Edit roster registration' : 'Edit jersey number'}</DropdownMenuItem><DropdownMenuItem onClick={() => setDialog({ kind: 'details', player })}><PencilIcon />Edit player details</DropdownMenuItem>{context.data.season_status === 'draft' && <DropdownMenuItem onClick={() => { removal.reset(); setPlayerToRemove(player) }}>Remove from roster</DropdownMenuItem>}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu></TableCell>}</TableRow>)}</TableBody>
          </Table></CardContent></Card> : <Card><CardContent><Empty className="px-4 py-10 sm:py-14"><EmptyHeader><EmptyMedia variant="icon"><UsersIcon aria-hidden="true" /></EmptyMedia><EmptyTitle><h4>{debouncedSearch ? 'No matching players' : 'No players yet'}</h4></EmptyTitle><EmptyDescription>{debouncedSearch ? 'Try a different player name.' : editable ? 'Add players to build this team’s roster for the season.' : 'No players were added to this roster.'}</EmptyDescription></EmptyHeader>{debouncedSearch ? <EmptyContent><Button variant="outline" onClick={() => { setSearch(''); setDebouncedSearch('') }}>Clear search</Button></EmptyContent> : editable && <EmptyContent><Button onClick={() => setDialog({ kind: 'add' })}><PlusIcon data-icon="inline-start" />Add your first player</Button></EmptyContent>}</Empty></CardContent></Card>}
        </section>
        <Dialog open={playerToRemove !== null} onOpenChange={(open) => { if (!open && !removal.isPending) setPlayerToRemove(null) }}><DialogContent showCloseButton={!removal.isPending}><DialogHeader><DialogTitle>Remove from roster</DialogTitle><DialogDescription>Remove {playerToRemove ? playerName(playerToRemove) : 'this player'} from this draft roster? Their player record will remain available.</DialogDescription></DialogHeader>{removal.isError && <p role="alert" className="text-sm text-destructive">{removal.error.message}</p>}<DialogFooter><Button variant="outline" disabled={removal.isPending} onClick={() => setPlayerToRemove(null)}>Cancel</Button><Button variant="destructive" disabled={removal.isPending} onClick={() => { if (playerToRemove) removal.mutate(playerToRemove.id) }}>{removal.isPending ? 'Removing…' : 'Remove player'}</Button></DialogFooter></DialogContent></Dialog>
        <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open && !pending) setDialog(null) }}><DialogContent showCloseButton={!pending} className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{dialog?.kind === 'details' ? 'Edit player details' : dialog?.kind === 'edit' ? context.data.season_status === 'draft' ? 'Edit roster registration' : 'Edit jersey number' : 'Add a player'}</DialogTitle><DialogDescription>{dialog?.kind === 'details' ? `Update ${playerName(dialog.player)}’s details across the organization.` : dialog?.kind === 'edit' ? `Update the roster registration for ${playerName(dialog.player)}.` : `Add a player to ${context.data.team_name} for ${context.data.season_name}.`}</DialogDescription></DialogHeader>{dialog && <PlayerForm key={dialog.kind === 'add' ? 'add' : `${dialog.kind}-${dialog.player.id}`} seasonTeamId={seasonTeamId} context={context.data} dialog={dialog} onDone={() => setDialog(null)} onCancel={() => setDialog(null)} onPendingChange={setPending} />}</DialogContent></Dialog>
      </>}
  </main>
}
