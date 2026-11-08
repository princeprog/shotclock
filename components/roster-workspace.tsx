'use client'

import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon, MoreVerticalIcon, PencilIcon, PlusIcon, SearchIcon, UsersIcon } from 'lucide-react'
import { toast } from 'sonner'
import { leagueRequest } from '@/lib/league-client'
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
type RosterContext = { id: string; team_name: string; abbreviation: string | null; league_name: string; season_name: string; season_status: 'draft' | 'active' | 'completed'; organization_id: string }
type Player = { id: string; first_name: string; last_name: string; jersey_number: number | null }
type DialogState = { kind: 'add' } | { kind: 'edit'; player: Player }

function PlayerForm({ seasonTeamId, dialog, onDone, onCancel, onPendingChange }: { seasonTeamId: string; dialog: DialogState; onDone: () => void; onCancel: () => void; onPendingChange: (pending: boolean) => void }) {
  const client = useQueryClient()
  const [validationError, setValidationError] = useState('')
  const mutation = useMutation({
    mutationFn: (body: object) => dialog.kind === 'add'
      ? leagueRequest(`season-teams/${seasonTeamId}/roster`, client, 'POST', body)
      : leagueRequest(`rosters/${dialog.player.id}`, client, 'PATCH', body),
    onSuccess: () => {
      toast.success(dialog.kind === 'add' ? 'Player added to the roster.' : 'Jersey number updated.')
      onDone()
    },
    onSettled: () => onPendingChange(false),
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const firstName = String(data.get('firstName') ?? '').trim()
    const lastName = String(data.get('lastName') ?? '').trim()
    if (dialog.kind === 'add' && (!firstName || !lastName)) {
      setValidationError('Enter the player’s first and last name.')
      return
    }
    const jersey = String(data.get('jerseyNumber') ?? '').trim()
    const jerseyNumber = jersey === '' ? null : Number(jersey)
    setValidationError('')
    onPendingChange(true)
    mutation.mutate(dialog.kind === 'add' ? { firstName, lastName, jerseyNumber } : { jerseyNumber })
  }
  return <form onSubmit={submit} onChange={() => setValidationError('')} className="flex flex-col gap-6">
    <FieldGroup className="gap-4">
      {dialog.kind === 'add' && <>
        <Field className="gap-2"><FieldLabel htmlFor="roster-first-name">First name</FieldLabel><Input id="roster-first-name" name="firstName" required maxLength={80} disabled={mutation.isPending} autoComplete="given-name" aria-invalid={!!validationError} /></Field>
        <Field className="gap-2"><FieldLabel htmlFor="roster-last-name">Last name</FieldLabel><Input id="roster-last-name" name="lastName" required maxLength={80} disabled={mutation.isPending} autoComplete="family-name" aria-invalid={!!validationError} /></Field>
      </>}
      <Field className="gap-2"><FieldLabel htmlFor="roster-jersey">Jersey number <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><Input id="roster-jersey" name="jerseyNumber" type="number" min={0} max={999} step={1} defaultValue={dialog.kind === 'edit' ? dialog.player.jersey_number ?? '' : ''} disabled={mutation.isPending} aria-describedby="roster-jersey-help" /><FieldDescription id="roster-jersey-help">Use a unique number from 0 to 999.</FieldDescription></Field>
    </FieldGroup>
    {(validationError || mutation.isError) && <p role="alert" className="text-sm text-destructive">{validationError || mutation.error?.message}</p>}
    <DialogFooter><Button type="button" variant="outline" disabled={mutation.isPending} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : dialog.kind === 'add' ? 'Add player' : 'Save changes'}</Button></DialogFooter>
  </form>
}

export function RosterWorkspace({ seasonTeamId, backHref }: { seasonTeamId: string; backHref: string }) {
  const client = useQueryClient()
  const storedOrganization = useSyncExternalStore(subscribeOrganizationSelection, readOrganizationSelection, () => '')
  const selectedOrganization = useAppSelector((state) => state.ui.organizationId)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [pending, setPending] = useState(false)
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2"><p className="break-words text-sm text-muted-foreground">{context.data.league_name} · {context.data.season_name}</p><SeasonStatusBadge status={context.data.season_status} includeSeason /></div>
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
            <TableBody>{roster.data.map((player) => <TableRow key={player.id}><TableCell className="py-4 pl-5 whitespace-normal"><span className="break-words font-medium">{player.first_name} {player.last_name}</span></TableCell><TableCell className="text-muted-foreground tabular-nums">{player.jersey_number === null ? 'Not set' : `#${player.jersey_number}`}</TableCell>{editable && <TableCell className="pr-4 text-right"><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${player.first_name} ${player.last_name}`} />}><MoreVerticalIcon /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem onClick={() => setDialog({ kind: 'edit', player })}><PencilIcon />Edit jersey number</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></TableCell>}</TableRow>)}</TableBody>
          </Table></CardContent></Card> : <Card><CardContent><Empty className="px-4 py-10 sm:py-14"><EmptyHeader><EmptyMedia variant="icon"><UsersIcon aria-hidden="true" /></EmptyMedia><EmptyTitle><h4>{debouncedSearch ? 'No matching players' : 'No players yet'}</h4></EmptyTitle><EmptyDescription>{debouncedSearch ? 'Try a different player name.' : editable ? 'Add players to build this team’s roster for the season.' : 'No players were added to this roster.'}</EmptyDescription></EmptyHeader>{debouncedSearch ? <EmptyContent><Button variant="outline" onClick={() => { setSearch(''); setDebouncedSearch('') }}>Clear search</Button></EmptyContent> : editable && <EmptyContent><Button onClick={() => setDialog({ kind: 'add' })}><PlusIcon data-icon="inline-start" />Add your first player</Button></EmptyContent>}</Empty></CardContent></Card>}
        </section>
        <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open && !pending) setDialog(null) }}><DialogContent showCloseButton={!pending}><DialogHeader><DialogTitle>{dialog?.kind === 'edit' ? 'Edit jersey number' : 'Add a player'}</DialogTitle><DialogDescription>{dialog?.kind === 'edit' ? `Update the jersey number for ${dialog.player.first_name} ${dialog.player.last_name}.` : `Add a player to ${context.data.team_name} for ${context.data.season_name}.`}</DialogDescription></DialogHeader>{dialog && <PlayerForm key={dialog.kind === 'edit' ? dialog.player.id : 'add'} seasonTeamId={seasonTeamId} dialog={dialog} onDone={() => setDialog(null)} onCancel={() => setDialog(null)} onPendingChange={setPending} />}</DialogContent></Dialog>
      </>}
  </main>
}
