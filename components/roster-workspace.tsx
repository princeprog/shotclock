'use client'

import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon, CalendarDaysIcon, MoreVerticalIcon, PencilIcon, PlusIcon, SearchIcon, UserRoundMinusIcon, UsersIcon } from 'lucide-react'
import { toast } from 'sonner'
import { leagueRequest } from '@/lib/league-client'
import { ageAtSeasonStart } from '@/lib/player-age'
import { addRosterPlayer, playerCorrections, savePlayerAndJersey, updateOwnedPlayer, type PlayerDetails, type PlayerUpdate } from '@/lib/roster-player-flow'
import { readOrganizationSelection, resolveSelectedOrganization, subscribeOrganizationSelection } from '@/lib/organization-selection'
import { useAppSelector } from '@/lib/store-hooks'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { SeasonStatusBadge } from '@/components/season-status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Organization = { id: string; name: string }
type RosterContext = { id: string; team_name: string; abbreviation: string | null; league_name: string; season_id: string; season_name: string; season_status: 'draft' | 'active' | 'completed'; organization_id: string; division_id: string; division_name: string }
type OrganizationPlayer = { id: string; first_name: string; last_name: string; date_of_birth: string | null; position: string | null; requires_fork: boolean }
type Player = Omit<OrganizationPlayer, 'id'> & { id: string; player_id: string; jersey_number: number | null }
type DialogState = { kind: 'add' } | { kind: 'edit'; player: Player } | { kind: 'details'; player: Player }
const positions = [['point_guard', 'Point guard'], ['shooting_guard', 'Shooting guard'], ['small_forward', 'Small forward'], ['power_forward', 'Power forward'], ['center', 'Center']] as const
const playerName = (player: Pick<OrganizationPlayer, 'first_name' | 'last_name'>) => `${player.first_name} ${player.last_name}`
const birthDate = (date: string | null) => date ? date.slice(0, 10) : ''
const applyPlayerUpdate = (player: OrganizationPlayer, update: PlayerUpdate): OrganizationPlayer => ({ ...player, first_name: update.firstName ?? player.first_name, last_name: update.lastName ?? player.last_name, date_of_birth: update.dateOfBirth ?? player.date_of_birth, position: update.position === undefined ? player.position : update.position })

function BirthDatePicker({ id, name, initialValue, required, disabled, invalid, onChange }: { id: string; name: string; initialValue?: string; required: boolean; disabled: boolean; invalid: boolean; onChange: () => void }) {
  const [selected, setSelected] = useState<Date | undefined>(() => initialValue ? parseISO(initialValue) : undefined)
  const [open, setOpen] = useState(false)
  const today = new Date()
  const earliestYear = Math.min(1800, selected?.getFullYear() ?? 1800)

  return <>
    <input type="hidden" name={name} value={selected ? format(selected, 'yyyy-MM-dd') : ''} />
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button id={id} type="button" variant="outline" disabled={disabled} aria-label={`Date of birth: ${selected ? format(selected, 'PPP') : 'Choose a date'}`} aria-required={required || undefined} aria-invalid={invalid || undefined} aria-describedby={invalid ? 'player-form-error' : undefined} className="w-full justify-start font-normal" />}>
        <CalendarDaysIcon data-icon="inline-start" />{selected ? format(selected, 'PPP') : 'Choose a date'}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar mode="single" captionLayout="dropdown" startMonth={new Date(earliestYear, 0)} endMonth={today} disabled={{ after: today }} selected={selected} defaultMonth={selected} onSelect={(date) => { if (date) { setSelected(date); onChange(); setOpen(false) } }} autoFocus />
      </PopoverContent>
    </Popover>
  </>
}

function PositionSelect({ id, name, initialValue, disabled }: { id: string; name: string; initialValue?: string | null; disabled: boolean }) {
  const [value, setValue] = useState(initialValue ?? '')
  const items = [{ value: null, label: 'Not set' }, ...positions.map(([position, label]) => ({ value: position, label }))]
  return <>
    <input type="hidden" name={name} value={value} />
    <Select value={value || null} onValueChange={(next) => setValue(next ?? '')} items={items} disabled={disabled}>
      <SelectTrigger id={id} className="w-full"><SelectValue placeholder="Not set" /></SelectTrigger>
      <SelectContent alignItemWithTrigger={false}><SelectGroup><SelectItem value={null}>Not set</SelectItem>{positions.map(([position, label]) => <SelectItem key={position} value={position}>{label}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
  </>
}

function PlayerForm({ seasonTeamId, context, dialog, onDone, onCancel, onPendingChange }: { seasonTeamId: string; context: RosterContext; dialog: DialogState; onDone: () => void; onCancel: () => void; onPendingChange: (pending: boolean) => void }) {
  const client = useQueryClient()
  const [validationError, setValidationError] = useState('')
  const [firstName, setFirstName] = useState(dialog.kind === 'details' ? dialog.player.first_name : '')
  const [lastName, setLastName] = useState(dialog.kind === 'details' ? dialog.player.last_name : '')
  const [createdPlayer, setCreatedPlayer] = useState<OrganizationPlayer | null>(null)
  const [detailsIdentity, setDetailsIdentity] = useState(() => dialog.kind === 'details' ? { id: dialog.player.player_id, requires_fork: dialog.player.requires_fork } : null)
  const [savedJerseyNumber, setSavedJerseyNumber] = useState(() => dialog.kind === 'details' ? dialog.player.jersey_number : null)
  const [editingSavedPlayer, setEditingSavedPlayer] = useState(false)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const lookup = `${firstName.trim()} ${lastName.trim()}`.trim()
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(lookup), 300)
    return () => window.clearTimeout(timer)
  }, [lookup])
  const playerPath = `organizations/${context.organization_id}/players?${new URLSearchParams({ search: debouncedSearch })}`
  const players = useQuery({ queryKey: ['league', playerPath], queryFn: () => leagueRequest<OrganizationPlayer[]>(playerPath, client), enabled: dialog.kind === 'add' && !createdPlayer && !!debouncedSearch && !!firstName.trim() && !!lastName.trim(), retry: false })
  const duplicatePlayers = lookup === debouncedSearch ? (players.data ?? []).filter((player) => playerName(player).toLocaleLowerCase() === `${firstName.trim()} ${lastName.trim()}`.toLocaleLowerCase()) : []
  const checkingDuplicates = dialog.kind === 'add' && !createdPlayer && !!firstName.trim() && !!lastName.trim() && (lookup !== debouncedSearch || players.isFetching)
  const savedPlayer = createdPlayer
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
        ) : undefined
        await addRosterPlayer(savedPlayer ? { playerId: savedPlayer.id, requiresFork: savedPlayer.requires_fork, jerseyNumber, ...(playerUpdate ? { playerUpdate } : {}) } : { player, jerseyNumber }, {
          create: (body) => leagueRequest<{ id: string }>(`organizations/${context.organization_id}/players`, client, 'POST', body),
          update: (id, body) => leagueRequest(`players/${id}`, client, 'PATCH', body),
          register: async (body) => { try { return await leagueRequest(`season-teams/${seasonTeamId}/roster`, client, 'POST', body) } catch (error) { setEditingSavedPlayer(true); throw error } },
          onCreated: (id) => setCreatedPlayer({ id, first_name: player.firstName, last_name: player.lastName, date_of_birth: player.dateOfBirth, position: player.position ?? null, requires_fork: false }),
          onUpdated: (update) => setCreatedPlayer((current) => current ? applyPlayerUpdate(current, update) : current),
        })
      } else if (dialog.kind === 'details') {
        const dateOfBirth = String(data.get('dateOfBirth') ?? '')
        if (!detailsIdentity) throw new Error('Player is unavailable.')
        const changes = playerCorrections(
          { firstName: dialog.player.first_name, lastName: dialog.player.last_name, dateOfBirth: birthDate(dialog.player.date_of_birth) || null, position: dialog.player.position },
          { firstName: firstName.trim(), lastName: lastName.trim(), dateOfBirth: dateOfBirth || null, position: String(data.get('position') ?? '') || null },
        )
        await savePlayerAndJersey({ jerseyChanged: jerseyNumber !== savedJerseyNumber, playerChanged: !!changes }, {
          saveJersey: async () => { await leagueRequest(`rosters/${dialog.player.id}`, client, 'PATCH', { jerseyNumber }); setSavedJerseyNumber(jerseyNumber) },
          savePlayer: () => updateOwnedPlayer(detailsIdentity.id, detailsIdentity.requires_fork, changes!, {
            fork: forkPlayer,
            onForked: (player) => setDetailsIdentity({ id: player.id, requires_fork: player.requires_fork }),
            update: (id, body) => leagueRequest(`players/${id}`, client, 'PATCH', body),
          }),
        })
      } else {
        await leagueRequest(`rosters/${dialog.player.id}`, client, 'PATCH', { jerseyNumber })
      }
    },
    onSuccess: () => {
      toast.success(dialog.kind === 'add' ? 'Player added to the roster.' : dialog.kind === 'details' ? 'Player updated.' : 'Roster updated.')
      onDone()
    },
    onSettled: () => onPendingChange(false),
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (checkingDuplicates) return
    const data = new FormData(event.currentTarget)
    if ((dialog.kind === 'details' || (dialog.kind === 'add' && !createdPlayer)) && (!firstName.trim() || !lastName.trim())) {
      setValidationError('Enter the player’s first and last name.')
      return
    }
    if (dialog.kind === 'add' && editingSavedPlayer && (!String(data.get('retryFirstName') ?? '').trim() || !String(data.get('retryLastName') ?? '').trim())) { setValidationError('Enter the player’s first and last name.'); return }
    if (dialog.kind === 'add' && !String(data.get(editingSavedPlayer ? 'retryDateOfBirth' : 'dateOfBirth') ?? '')) { setValidationError('Enter the player’s date of birth.'); return }
    setValidationError('')
    onPendingChange(true)
    mutation.mutate(data)
  }
  return <form onSubmit={submit} onChange={() => setValidationError('')} className="flex flex-col gap-6">
    <FieldGroup className="gap-5">
      {dialog.kind === 'add' && createdPlayer && <p className="text-sm">Player created. You can correct their details and retry adding them to this roster.</p>}
      {dialog.kind === 'add' && editingSavedPlayer && savedPlayer && <>
        <p className="text-sm text-muted-foreground">Correct this player’s details before retrying. Changes update their organization player record.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="min-w-0 gap-2"><FieldLabel htmlFor="retry-first-name" required>First name</FieldLabel><Input id="retry-first-name" name="retryFirstName" defaultValue={savedPlayer.first_name} required maxLength={80} disabled={mutation.isPending} /></Field>
          <Field className="min-w-0 gap-2"><FieldLabel htmlFor="retry-last-name" required>Last name</FieldLabel><Input id="retry-last-name" name="retryLastName" defaultValue={savedPlayer.last_name} required maxLength={80} disabled={mutation.isPending} /></Field>
          <Field className="min-w-0 gap-2"><FieldLabel htmlFor="retry-date-of-birth" required>Date of birth</FieldLabel><BirthDatePicker id="retry-date-of-birth" name="retryDateOfBirth" initialValue={birthDate(savedPlayer.date_of_birth)} required disabled={mutation.isPending} invalid={validationError === 'Enter the player’s date of birth.'} onChange={() => setValidationError('')} /></Field>
          <Field className="min-w-0 gap-2"><FieldLabel htmlFor="retry-position">Position <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><PositionSelect id="retry-position" name="retryPosition" initialValue={savedPlayer.position} disabled={mutation.isPending} /></Field>
        </div>
      </>}
      {(dialog.kind === 'details' || (dialog.kind === 'add' && !createdPlayer)) && <>
        <h3 className="font-medium">Player details</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="min-w-0 gap-2"><FieldLabel htmlFor="roster-first-name" required>First name</FieldLabel><Input id="roster-first-name" name="firstName" required maxLength={80} value={firstName} onChange={(event) => setFirstName(event.target.value)} disabled={mutation.isPending} autoComplete="given-name" /></Field>
          <Field className="min-w-0 gap-2"><FieldLabel htmlFor="roster-last-name" required>Last name</FieldLabel><Input id="roster-last-name" name="lastName" required maxLength={80} value={lastName} onChange={(event) => setLastName(event.target.value)} disabled={mutation.isPending} autoComplete="family-name" /></Field>
        </div>
        {dialog.kind === 'add' && duplicatePlayers.length > 0 && <Alert><AlertTitle>Possible duplicate</AlertTitle><AlertDescription>An organization player already has this name: {duplicatePlayers.map((player) => `${playerName(player)}${player.date_of_birth ? ` (${birthDate(player.date_of_birth)})` : ''}`).join(', ')}. You can still create a separate player record.</AlertDescription></Alert>}
        {dialog.kind === 'add' && checkingDuplicates && <p role="status" className="text-sm text-muted-foreground">Checking for matching players…</p>}
        {dialog.kind === 'add' && !checkingDuplicates && players.isError && <p role="status" className="text-sm text-muted-foreground">Couldn’t check for matching players. You can still create this player.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="min-w-0 gap-2"><FieldLabel htmlFor="player-date-of-birth" required={dialog.kind === 'add'}>Date of birth{dialog.kind === 'details' && <span className="font-normal text-muted-foreground"> (optional)</span>}</FieldLabel><BirthDatePicker id="player-date-of-birth" name="dateOfBirth" initialValue={dialog.kind === 'details' ? birthDate(dialog.player.date_of_birth) : ''} required={dialog.kind === 'add'} disabled={mutation.isPending} invalid={validationError === 'Enter the player’s date of birth.'} onChange={() => setValidationError('')} /></Field>
          <Field className="min-w-0 gap-2"><FieldLabel htmlFor="player-position">Position <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><PositionSelect id="player-position" name="position" initialValue={dialog.kind === 'details' ? dialog.player.position : null} disabled={mutation.isPending} /></Field>
        </div>
      </>}
      {dialog.kind !== 'edit' && <div className="border-t pt-5"><h3 className="font-medium">Roster details</h3></div>}
      <Field className={dialog.kind !== 'edit' ? 'gap-2 sm:max-w-64' : 'gap-2'}><FieldLabel htmlFor="roster-jersey">Jersey number <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><Input id="roster-jersey" name="jerseyNumber" type="number" min={0} max={999} step={1} defaultValue={dialog.kind !== 'add' ? dialog.player.jersey_number ?? '' : ''} disabled={mutation.isPending} aria-describedby="roster-jersey-help" /><FieldDescription id="roster-jersey-help" className={dialog.kind !== 'edit' ? 'sr-only' : undefined}>Use a unique number from 0 to 999.</FieldDescription></Field>
    </FieldGroup>
    {(validationError || mutation.isError) && <p id="player-form-error" role="alert" className="text-sm text-destructive">{validationError || mutation.error?.message}</p>}
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
  const rosterSeasonId = context.data?.season_id ?? ''
  const rosterSeason = useQuery({ queryKey: ['league', `seasons/${rosterSeasonId}`], queryFn: () => leagueRequest<{ start_date: string | null }>(`seasons/${rosterSeasonId}`, client), enabled: !!organization && !!rosterSeasonId && context.data?.organization_id === organization.id, retry: false })
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
        <div className="flex flex-col gap-5 border-b pb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2"><h2 className="break-words text-2xl font-semibold tracking-tight">{context.data.team_name} roster</h2><SeasonStatusBadge status={context.data.season_status} includeSeason /></div>
            {editable && <Button onClick={() => setDialog({ kind: 'add' })}><PlusIcon data-icon="inline-start" />Add player</Button>}
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <div className="min-w-0"><dt className="text-xs text-muted-foreground">League</dt><dd className="mt-1 break-words text-sm font-medium">{context.data.league_name}</dd></div>
            <div className="min-w-0"><dt className="text-xs text-muted-foreground">Season</dt><dd className="mt-1 break-words text-sm font-medium">{context.data.season_name}</dd></div>
            <div className="min-w-0"><dt className="text-xs text-muted-foreground">Division</dt><dd className="mt-1 break-words text-sm font-medium">{context.data.division_name}</dd></div>
          </dl>
        </div>
        {!editable && <Alert><AlertTitle>Season completed</AlertTitle><AlertDescription>This roster is read-only because the season has been completed.</AlertDescription></Alert>}
        <section aria-label="Players" className="flex flex-col gap-5">
        <div className="flex justify-end">
          <Field className="w-full gap-2 sm:w-64"><FieldLabel htmlFor="roster-search" className="sr-only">Search players</FieldLabel><InputGroup><InputGroupAddon><SearchIcon aria-hidden="true" /></InputGroupAddon><InputGroupInput id="roster-search" type="search" placeholder="Search players" maxLength={161} value={search} onChange={(event) => setSearch(event.target.value)} /></InputGroup></Field>
        </div>
        {rosterSeason.isError && <Alert variant="destructive"><AlertTitle>Couldn’t load season details</AlertTitle><AlertDescription><p>Player ages are unavailable.</p><Button size="sm" variant="outline" className="mt-3" onClick={() => void rosterSeason.refetch()}>Try again</Button></AlertDescription></Alert>}
        {searchPending || roster.isLoading ? <div role="status" aria-label="Loading players"><Skeleton className="h-32 w-full" /></div>
          : roster.isError ? <Alert variant="destructive"><AlertTitle>Couldn’t load players</AlertTitle><AlertDescription><p>{roster.error.message}</p><Button size="sm" variant="outline" className="mt-3" onClick={() => void roster.refetch()}>Try again</Button></AlertDescription></Alert>
          : roster.data?.length ? <Card className="gap-0 py-0"><CardContent className="px-0"><Table className="table-fixed"><caption className="sr-only">Players in {context.data.team_name} for {context.data.season_name}</caption><TableHeader className="bg-muted/30"><TableRow><TableHead scope="col" className="pl-5 text-muted-foreground">Player</TableHead><TableHead scope="col" className="hidden w-40 text-muted-foreground md:table-cell">Position</TableHead><TableHead scope="col" className="hidden w-36 whitespace-normal text-muted-foreground md:table-cell">Age</TableHead><TableHead scope="col" className="w-28 text-muted-foreground sm:w-36">Jersey number</TableHead>{editable && <TableHead scope="col" className="w-14 pr-4 text-right"><span className="sr-only">Actions</span></TableHead>}</TableRow></TableHeader>
            <TableBody>{roster.data.map((player) => {
              const position = positions.find(([value]) => value === player.position)?.[1] ?? player.position ?? 'Not set'
              const age = ageAtSeasonStart(player.date_of_birth, rosterSeason.data?.start_date)
              const ageLabel = rosterSeason.isLoading ? 'Loading…' : age === null ? '—' : String(age)
              return <TableRow key={player.id}>
                <TableCell className="py-4 pl-5 whitespace-normal"><span className="break-words font-medium">{player.first_name} {player.last_name}</span><span className="mt-1 block text-sm text-muted-foreground md:hidden">{position} · Age: {ageLabel}</span></TableCell>
                <TableCell className="hidden whitespace-normal text-muted-foreground md:table-cell">{position}</TableCell>
                <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">{ageLabel}</TableCell>
                <TableCell className="text-muted-foreground tabular-nums">{player.jersey_number === null ? 'Not set' : `#${player.jersey_number}`}</TableCell>
                {editable && <TableCell className="pr-4 text-right"><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${player.first_name} ${player.last_name}`} />}><MoreVerticalIcon /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52 max-w-[calc(100vw-2rem)]"><DropdownMenuGroup>{context.data.season_status === 'active' && <DropdownMenuItem className="py-2" onClick={() => setDialog({ kind: 'edit', player })}><PencilIcon />Edit jersey number</DropdownMenuItem>}<DropdownMenuItem className="py-2" onClick={() => setDialog({ kind: 'details', player })}><PencilIcon />Edit player details</DropdownMenuItem></DropdownMenuGroup>{context.data.season_status === 'draft' && <><DropdownMenuSeparator /><DropdownMenuGroup><DropdownMenuItem variant="destructive" className="py-2" onClick={() => { removal.reset(); setPlayerToRemove(player) }}><UserRoundMinusIcon />Remove from roster</DropdownMenuItem></DropdownMenuGroup></>}</DropdownMenuContent></DropdownMenu></TableCell>}
              </TableRow>
            })}</TableBody>
          </Table></CardContent></Card> : <Card><CardContent><Empty className="px-4 py-10 sm:py-14"><EmptyHeader><EmptyMedia variant="icon"><UsersIcon aria-hidden="true" /></EmptyMedia><EmptyTitle><h3>{debouncedSearch ? 'No matching players' : 'No players yet'}</h3></EmptyTitle><EmptyDescription>{debouncedSearch ? 'Try a different player name.' : editable ? 'Add players to build this team’s roster for the season.' : 'No players were added to this roster.'}</EmptyDescription></EmptyHeader>{debouncedSearch ? <EmptyContent><Button variant="outline" onClick={() => { setSearch(''); setDebouncedSearch('') }}>Clear search</Button></EmptyContent> : editable && <EmptyContent><Button onClick={() => setDialog({ kind: 'add' })}><PlusIcon data-icon="inline-start" />Add your first player</Button></EmptyContent>}</Empty></CardContent></Card>}
        </section>
        <Dialog open={playerToRemove !== null} onOpenChange={(open) => { if (!open && !removal.isPending) setPlayerToRemove(null) }}><DialogContent showCloseButton={!removal.isPending}><DialogHeader><DialogTitle>Remove from roster</DialogTitle><DialogDescription>Remove {playerToRemove ? playerName(playerToRemove) : 'this player'} from this draft roster? Their player record will remain available.</DialogDescription></DialogHeader>{removal.isError && <p role="alert" className="text-sm text-destructive">{removal.error.message}</p>}<DialogFooter><Button variant="outline" disabled={removal.isPending} onClick={() => setPlayerToRemove(null)}>Cancel</Button><Button variant="destructive" disabled={removal.isPending} onClick={() => { if (playerToRemove) removal.mutate(playerToRemove.id) }}>{removal.isPending ? 'Removing…' : 'Remove player'}</Button></DialogFooter></DialogContent></Dialog>
        <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open && !pending) setDialog(null) }}><DialogContent showCloseButton={!pending} className={dialog?.kind !== 'edit' ? 'max-h-[90vh] overflow-y-auto sm:max-w-xl' : 'max-h-[90vh] overflow-y-auto'}><DialogHeader className="pr-8"><DialogTitle>{dialog?.kind === 'details' ? 'Edit player details' : dialog?.kind === 'edit' ? 'Edit jersey number' : 'Add a player'}</DialogTitle><DialogDescription className={dialog?.kind !== 'edit' ? 'sr-only' : undefined}>{dialog?.kind === 'details' ? `Update ${playerName(dialog.player)}’s details across the organization.` : dialog?.kind === 'edit' ? `Update the jersey number for ${playerName(dialog.player)}.` : `Add a player to ${context.data.team_name} · ${context.data.division_name} for ${context.data.season_name}.`}</DialogDescription></DialogHeader>{dialog && <PlayerForm key={dialog.kind === 'add' ? 'add' : `${dialog.kind}-${dialog.player.id}`} seasonTeamId={seasonTeamId} context={context.data} dialog={dialog} onDone={() => setDialog(null)} onCancel={() => setDialog(null)} onPendingChange={setPending} />}</DialogContent></Dialog>
      </>}
  </main>
}
