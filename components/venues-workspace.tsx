'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPinIcon, MoreVerticalIcon, PencilIcon, PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import { leagueRequest } from '@/lib/league-client'
import { useWorkspace } from '@/components/workspace-context'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type League = { id: string; name: string }
type Venue = { id: string; name: string; address: string | null; league_id: string; league_name: string }

function VenueForm({ venue, leagues, initialLeague, onClose, onSaved, onPendingChange }: { venue: Venue | null; leagues: League[]; initialLeague: string; onClose: () => void; onSaved: (leagueId: string) => void; onPendingChange: (pending: boolean) => void }) {
  const client = useQueryClient()
  const [leagueId, setLeagueId] = useState(venue?.league_id ?? initialLeague)
  const [name, setName] = useState(venue?.name ?? '')
  const [address, setAddress] = useState(venue?.address ?? '')
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: (body: { name: string; address: string | null }) => leagueRequest(venue ? `venues/${venue.id}` : `leagues/${leagueId}/venues`, client, venue ? 'PATCH' : 'POST', body),
    onSuccess: () => { onSaved(leagueId); onClose(); toast.success(venue ? 'Venue updated.' : 'Venue added.') },
    onSettled: () => onPendingChange(false),
  })
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!leagueId || !name.trim()) { setError(!leagueId ? 'Choose a league.' : 'Enter a venue name.'); return }
    setError('')
    onPendingChange(true)
    try { await mutation.mutateAsync({ name: name.trim(), address: address.trim() || null }) } catch { /* The request error is shown below. */ }
  }
  return <form onSubmit={submit} className="flex flex-col gap-5">
    <FieldGroup className="gap-4">
      <Field><FieldLabel htmlFor="venue-league" required>League</FieldLabel><Select value={leagueId || null} onValueChange={(value) => { setLeagueId(value ?? ''); setError('') }} disabled={!!venue || mutation.isPending} items={[{ value: null, label: 'Select a league' }, ...leagues.map((league) => ({ value: league.id, label: league.name }))]}><SelectTrigger id="venue-league" aria-required="true" className="w-full" aria-invalid={!!error && !leagueId}><SelectValue /></SelectTrigger><SelectContent alignItemWithTrigger={false}><SelectGroup>{leagues.map((league) => <SelectItem key={league.id} value={league.id}>{league.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      <Field><FieldLabel htmlFor="venue-name" required>Venue name</FieldLabel><Input id="venue-name" value={name} onChange={(event) => { setName(event.target.value); setError('') }} maxLength={120} required disabled={mutation.isPending} aria-invalid={!!error && !!leagueId} /></Field>
      <Field><FieldLabel htmlFor="venue-address">Address <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><Input id="venue-address" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={250} disabled={mutation.isPending} /></Field>
    </FieldGroup>
    {(error || mutation.isError) && <p role="alert" className="text-sm text-destructive">{error || mutation.error?.message}</p>}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : venue ? 'Save changes' : 'Add venue'}</Button></div>
  </form>
}

export function VenuesWorkspace({ organizationId, leagues, selectedLeagueId }: { organizationId: string; leagues: League[]; selectedLeagueId: string }) {
  const client = useQueryClient()
  const { changeLeague } = useWorkspace()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const leagueFilter = selectedLeagueId
  const [dialog, setDialog] = useState<'create' | Venue | null>(null)
  const [pending, setPending] = useState(false)
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300); return () => window.clearTimeout(timer) }, [search])
  const params = new URLSearchParams()
  if (debouncedSearch) params.set('search', debouncedSearch)
  if (leagueFilter) params.set('leagueId', leagueFilter)
  const path = `organizations/${organizationId}/venues?${params}`
  const searchPending = search.trim() !== debouncedSearch
  const venues = useQuery({ queryKey: ['league', path], queryFn: () => leagueRequest<Venue[]>(path, client), enabled: !!leagueFilter && !searchPending, retry: false })
  const filtered = !!search.trim()
  const close = () => setDialog(null)

  if (!leagues.length) return <Card><CardContent className="flex flex-col items-start gap-4"><div><h3 className="font-medium">A league is needed</h3><p className="mt-1 text-sm text-muted-foreground">Create a league before adding venues.</p></div><Button nativeButton={false} render={<Link href="/manage/leagues" />}>Set up a league</Button></CardContent></Card>
  if (!leagueFilter) return <Card><CardContent><h3 className="font-medium">Choose a league</h3><p className="mt-1 text-sm text-muted-foreground">Select a league in the workspace control at the top of the page.</p></CardContent></Card>

  return <div className="flex flex-col gap-8">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <Field className="w-full sm:w-64"><FieldLabel htmlFor="venue-search">Search venues</FieldLabel><Input id="venue-search" type="search" placeholder="Search by venue name" maxLength={120} value={search} onChange={(event) => setSearch(event.target.value)} /></Field>
    </div>
    {searchPending || venues.isLoading ? <div className="flex flex-col gap-3" aria-label="Loading venues"><Skeleton className="h-8 w-40" /><Skeleton className="h-40 w-full" /></div> : venues.isError ? <Alert variant="destructive"><AlertTitle>Couldn’t load venues</AlertTitle><AlertDescription><p>{venues.error.message}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void venues.refetch()}>Try again</Button></AlertDescription></Alert> : venues.data?.length ? <section aria-label="Venues" className="flex flex-col gap-4">
      <div className="flex justify-end"><Button onClick={() => setDialog('create')}><PlusIcon data-icon="inline-start" />Add venue</Button></div>
      <Card className="gap-0 py-0"><CardContent className="px-0"><Table className="table-fixed"><caption className="sr-only">Venues in this organization</caption><TableHeader className="bg-muted/30"><TableRow><TableHead scope="col" className="pl-5">Venue</TableHead><TableHead scope="col" className="hidden sm:table-cell">League</TableHead><TableHead scope="col" className="hidden md:table-cell">Address</TableHead><TableHead scope="col" className="w-14 pr-3 text-right"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{venues.data.map((venue) => <TableRow key={venue.id}><TableCell className="max-w-0 py-3 pl-5 whitespace-normal"><span className="break-words font-medium">{venue.name}</span><div className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground sm:hidden"><span>{venue.league_name}</span><span>{venue.address || 'No address'}</span></div><span className="mt-1 hidden text-xs text-muted-foreground sm:block md:hidden">{venue.address || 'No address'}</span></TableCell><TableCell className="hidden break-words whitespace-normal text-muted-foreground sm:table-cell">{venue.league_name}</TableCell><TableCell className="hidden break-words whitespace-normal text-muted-foreground md:table-cell">{venue.address || '—'}</TableCell><TableCell className="pr-3 text-right"><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${venue.name}`} />}><MoreVerticalIcon /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem onClick={() => setDialog(venue)}><PencilIcon />Edit venue</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    </section> : <Card className="mx-auto w-full max-w-3xl"><CardContent><Empty className="px-4 py-10 sm:py-14"><EmptyHeader><EmptyMedia variant="icon"><MapPinIcon aria-hidden="true" /></EmptyMedia><EmptyTitle><h3>{filtered ? 'No matching venues' : 'No venues yet'}</h3></EmptyTitle><EmptyDescription>{filtered ? 'Try a different search.' : 'Add a venue to use it when scheduling league games.'}</EmptyDescription></EmptyHeader><EmptyContent><div className="flex flex-wrap justify-center gap-2">{filtered && <Button variant="outline" onClick={() => { setSearch(''); setDebouncedSearch('') }}>Clear search</Button>}<Button onClick={() => setDialog('create')}><PlusIcon data-icon="inline-start" />{filtered ? 'Add venue' : 'Add your first venue'}</Button></div></EmptyContent></Empty></CardContent></Card>}
    <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open && !pending) close() }}><DialogContent showCloseButton={!pending} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{dialog === 'create' ? 'Add a venue' : 'Edit venue'}</DialogTitle><DialogDescription>{dialog === 'create' ? 'Choose a league and add a venue for its games.' : 'Update the venue details for this league.'}</DialogDescription></DialogHeader>{dialog && <VenueForm key={dialog === 'create' ? 'create' : dialog.id} venue={dialog === 'create' ? null : dialog} leagues={leagues} initialLeague={leagueFilter} onClose={close} onSaved={changeLeague} onPendingChange={setPending} />}</DialogContent></Dialog>
  </div>
}
