'use client'

import { Fragment, useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format, parseISO, startOfDay } from 'date-fns'
import { CalendarDaysIcon, CircleCheckIcon, InfoIcon, LayoutGridIcon, ListIcon, MapPinIcon, MoreVerticalIcon, PencilIcon, PlayIcon, PlusIcon, TrophyIcon, UsersIcon } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { toast } from 'sonner'
import { CreateLeagueDialog } from '@/components/create-league-dialog'
import { VenuesWorkspace } from '@/components/venues-workspace'
import { DivisionsWorkspace } from '@/components/divisions-workspace'
import { SeasonStatusBadge } from '@/components/season-status-badge'
import { DataPagination } from '@/components/data-pagination'
import { requirePaginatedResult } from '@/lib/pagination'
import { leagueRequest } from '@/lib/league-client'
import { joinGameTime, splitGameTime } from '@/lib/game-time'
import { teamListHref, type TeamFilters } from '@/lib/team-filter-links'
import { readTeamView, saveTeamView, subscribeTeamView, selectSeasonTeamRegistrations } from '@/lib/team-view'
import { useWorkspace } from '@/components/workspace-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { RegisterExistingTeamDialog, CorrectTeamRegistrationDialog } from '@/components/team-registration-dialogs'
import { Separator } from '@/components/ui/separator'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export type Section = 'dashboard' | 'leagues' | 'seasons' | 'divisions' | 'teams' | 'venues' | 'games' | 'standings'
type Item = { id: string; name: string }
type League = Item & { location: string | null }
type Season = Item & { status: 'draft' | 'active' | 'completed'; start_date: string | null; end_date: string | null }
type SeasonListItem = Season & { league_name: string }
type Team = Item & { abbreviation: string | null }
type OrganizationTeamRow = Team & { league_id: string; league_name: string; season_team_id: string | null; season_id: string | null; season_name: string | null; season_status: 'draft' | 'active' | 'completed' | null; division_id: string | null; division_name: string | null }
type Division = Item & { season_id: string; max_age: number | null }
type TeamSeasonOption = Item & { league_id: string; league_name: string; status: 'draft' | 'active' | 'completed' }
type SeasonTeam = Item & { team_id: string; division_id: string }
type Game = { id: string; home_name: string; away_name: string; home_season_team_id: string; away_season_team_id: string; scheduled_at: string | null; venue_id: string | null; venue_name: string | null; status: string; home_score: number | null; away_score: number | null }
type Standing = Item & { wins: number; losses: number; pointDifference: number }
type Dashboard = { teamCount: number; upcoming: Game[]; recent: Game[]; standings: Standing[] }
type Option = { value: string; label: string }
type InputField = { name: string; label: string; type?: string; required?: boolean; value?: string | number | null; options?: Option[] }

const pageCopy: Record<Section, { title: string; description: string }> = {
  dashboard: { title: 'Season overview', description: 'Follow your season, upcoming games, and standings in one place.' },
  leagues: { title: 'Leagues', description: 'Create and manage the leagues in your organization.' },
  seasons: { title: 'Seasons', description: 'Set up seasons and manage their progress from draft to completion.' },
  divisions: { title: 'Divisions', description: 'Manage divisions for the selected season.' },
  teams: { title: 'Teams & rosters', description: 'Manage league teams and register their players for the season.' },
  venues: { title: 'Venues', description: 'Manage the places where your league games are played.' },
  games: { title: 'Games', description: 'Schedule matchups, record final scores, and review results.' },
  standings: { title: 'Standings', description: 'Follow how teams rank in the selected season.' },
}

function useLeagueQuery<T>(path: string, enabled = true) {
  const client = useQueryClient()
  return useQuery({ queryKey: ['league', path], queryFn: () => leagueRequest<T>(path, client), enabled, retry: false })
}

function DatePicker({ id, name, label, value, invalid, required = false, disabled = false, onChange }: { id: string; name: string; label: string; value?: string | number | null; invalid: boolean; required?: boolean; disabled?: boolean; onChange?: () => void }) {
  const [selected, setSelected] = useState<Date | undefined>(() => value ? parseISO(String(value)) : undefined)
  const [open, setOpen] = useState(false)

  return <>
    <input type="hidden" name={name} value={selected ? format(selected, 'yyyy-MM-dd') : ''} />
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button id={id} type="button" variant="outline" disabled={disabled} aria-label={`${label}: ${selected ? format(selected, 'PPP') : 'Choose a date'}`} aria-required={required || undefined} aria-invalid={invalid} aria-describedby={invalid && required ? `${id}-error` : undefined} className="w-full justify-start font-normal" />}>
        <CalendarDaysIcon data-icon="inline-start" />{selected ? format(selected, 'PPP') : 'Choose a date'}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar mode="single" selected={selected} defaultMonth={selected} onSelect={(date) => { if (date || !required) { setSelected(date); onChange?.(); setOpen(false) } }} autoFocus />
        {selected && !required && <Button type="button" variant="ghost" className="mx-3 mb-3" onClick={() => { setSelected(undefined); onChange?.(); setOpen(false) }}>Clear date</Button>}
      </PopoverContent>
    </Popover>
  </>
}

function TimePicker({ id, name, value, invalid, required, disabled, onChange }: { id: string; name: string; value: string; invalid: boolean; required?: boolean; disabled: boolean; onChange: () => void }) {
  const initial = splitGameTime(value)
  const [hour, setHour] = useState(initial.hour)
  const [minute, setMinute] = useState(initial.minute)
  const [period, setPeriod] = useState(initial.period)
  const hours = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))
  const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'))
  return <FieldSet className="gap-2">
    <FieldLegend variant="label" className="mb-0">Time</FieldLegend>
    <input type="hidden" name={name} value={joinGameTime(hour, minute, period)} />
    <div className="grid grid-cols-3 gap-2">
      {([
        { label: 'Hour', values: hours, value: hour, set: setHour },
        { label: 'Minute', values: minutes, value: minute, set: setMinute },
        { label: 'AM or PM', values: ['AM', 'PM'], value: period, set: setPeriod },
      ]).map(({ label, values, value: selected, set }) => <Field key={label} data-invalid={invalid || undefined}>
        <FieldLabel className="sr-only" htmlFor={`${id}-${label === 'AM or PM' ? 'period' : label.toLowerCase()}`}>{label}</FieldLabel>
        <Select value={selected || null} onValueChange={(next) => { set(next ?? ''); onChange() }} disabled={disabled} items={[{ value: null, label: label === 'AM or PM' ? 'AM/PM' : label }, ...values.map((item) => ({ value: item, label: item }))]}>
          <SelectTrigger id={`${id}-${label === 'AM or PM' ? 'period' : label.toLowerCase()}`} className="w-full" aria-required={required || undefined} aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined}><SelectValue /></SelectTrigger>
          <SelectContent alignItemWithTrigger={false}><SelectGroup>{values.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>)}
    </div>
    {invalid && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">Choose an hour, minute, and AM or PM.</p>}
  </FieldSet>
}

function Editor({ title, path, method = 'POST', fields, submitLabel = 'Save', transform, onSaved, onCancel, onPendingChange, alignActions = 'start' }: { title: string; path: string; method?: 'POST' | 'PATCH'; fields: InputField[]; submitLabel?: string; transform?: (data: Record<string, string>) => object; onSaved?: () => void; onCancel?: () => void; onPendingChange?: (pending: boolean) => void; alignActions?: 'start' | 'end' }) {
  const client = useQueryClient()
  const [resetCount, setResetCount] = useState(0)
  const [missingDate, setMissingDate] = useState('')
  const [missingTime, setMissingTime] = useState('')
  const mutation = useMutation({ mutationFn: (body: object) => leagueRequest(path, client, method, body), onSuccess: () => onSaved?.(), onSettled: () => onPendingChange?.(false) })
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form).entries()) as Record<string, string>
    for (const field of fields) {
      if (field.type !== 'datetime-local') continue
      const date = values[`${field.name}Date`]
      const time = values[`${field.name}Time`]
      if (field.required && !date) { setMissingDate(field.name); document.getElementById(`${path}-${field.name}`)?.focus(); return }
      if (field.required && !time) { setMissingTime(field.name); document.getElementById(`${path}-${field.name}-time-hour`)?.focus(); return }
      values[field.name] = date && time ? `${date}T${time}` : ''
      delete values[`${field.name}Date`]
      delete values[`${field.name}Time`]
    }
    try { const body = transform ? transform(values) : values; onPendingChange?.(true); await mutation.mutateAsync(body); if (method === 'POST') form.reset() } catch { onPendingChange?.(false) /* shown below */ }
  }
  return <form onSubmit={submit} onReset={() => setResetCount((count) => count + 1)} className="flex flex-col gap-4">
    <h3 className="font-medium">{title}</h3>
    <FieldGroup className="gap-3">
      {fields.map((field) => field.type === 'datetime-local' ? <Fragment key={field.name}>
        <Field data-invalid={missingDate === field.name || undefined}>
          <FieldLabel htmlFor={`${path}-${field.name}`}>Date</FieldLabel>
          <DatePicker key={resetCount} id={`${path}-${field.name}`} name={`${field.name}Date`} label="Date" value={field.value ? String(field.value).slice(0, 10) : ''} required={field.required} disabled={mutation.isPending} invalid={missingDate === field.name} onChange={() => setMissingDate('')} />
          {missingDate === field.name && <p id={`${path}-${field.name}-error`} role="alert" className="text-sm text-destructive">Choose a date for the game.</p>}
        </Field>
        <TimePicker key={resetCount} id={`${path}-${field.name}-time`} name={`${field.name}Time`} value={field.value ? String(field.value).slice(11, 16) : ''} required={field.required} disabled={mutation.isPending} invalid={missingTime === field.name} onChange={() => setMissingTime('')} />
      </Fragment> : <Field key={field.name}>
        <FieldLabel htmlFor={`${path}-${field.name}`}>{field.label}</FieldLabel>
        {field.options ? <Select key={resetCount} name={field.name} defaultValue={field.value ? String(field.value) : null} required={field.required} disabled={mutation.isPending} items={[{ value: null, label: `Select ${field.label.toLowerCase()}` }, ...field.options]}>
          <SelectTrigger id={`${path}-${field.name}`} aria-invalid={mutation.isError} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent alignItemWithTrigger={false}><SelectGroup>
            {!field.required && <SelectItem value={null}>No {field.label.toLowerCase()} selected</SelectItem>}
            {field.options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectGroup></SelectContent>
        </Select> : field.type === 'date' ? <DatePicker key={resetCount} id={`${path}-${field.name}`} name={field.name} label={field.label} value={field.value} invalid={mutation.isError} /> : <Input id={`${path}-${field.name}`} name={field.name} type={field.type ?? 'text'} defaultValue={field.value ?? ''} required={field.required} min={field.type === 'number' ? 0 : undefined} disabled={mutation.isPending} aria-invalid={mutation.isError} />}
      </Field>)}
    </FieldGroup>
    {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
    {mutation.isSuccess && <p role="status" className="text-sm text-muted-foreground">Saved successfully.</p>}
    <div className={alignActions === 'end' ? 'flex flex-wrap justify-end gap-2' : 'flex flex-wrap gap-2'}>{onCancel && <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onCancel}>Cancel</Button>}<Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : submitLabel}</Button></div>
  </form>
}

function SeasonActions({ season, onEdit }: { season: Season; onEdit: () => void }) {
  const client = useQueryClient()
  const nextStatus = season.status === 'draft' ? 'active' : 'completed'
  const mutation = useMutation({
    mutationFn: () => leagueRequest(`seasons/${season.id}/status`, client, 'POST', { status: nextStatus }),
    onSuccess: () => { toast.success(nextStatus === 'active' ? 'Season started.' : 'Season completed.') },
    onError: (error) => toast.error(error.message),
  })
  if (season.status === 'completed') return null
  return <DropdownMenu><DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`Actions for ${season.name}`} disabled={mutation.isPending} />}><MoreVerticalIcon /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup>
    <DropdownMenuItem onClick={onEdit}><PencilIcon />Edit season</DropdownMenuItem>
    <DropdownMenuItem disabled={mutation.isPending} onClick={() => mutation.mutate()}>{season.status === 'draft' ? <><PlayIcon />Start season</> : <><CircleCheckIcon />Complete season</>}</DropdownMenuItem>
  </DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
}

function TeamActions({ team, onEdit, onRegister, onCorrect, canRegister }: { team: Team; onEdit: () => void; onRegister: () => void; onCorrect?: () => void; canRegister: boolean }) {
  return <DropdownMenu><DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`Actions for ${team.name}`} />}><MoreVerticalIcon /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup>
    <DropdownMenuItem onClick={onEdit}><PencilIcon />Edit team</DropdownMenuItem>
    {canRegister && <DropdownMenuItem onClick={onRegister}><PlusIcon />Register for season</DropdownMenuItem>}
    {onCorrect && <DropdownMenuItem onClick={onCorrect}><PencilIcon />Correct registration</DropdownMenuItem>}
  </DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
}

function RegisterTeamForm({ team, organizationId, seasons, onClose }: { team: Team; organizationId: string; seasons: TeamSeasonOption[]; onClose: () => void }) {
  const client = useQueryClient()
  const [seasonId, setSeasonId] = useState('')
  const [divisionId, setDivisionId] = useState('')
  const divisions = useLeagueQuery<Division[]>(`seasons/${seasonId}/divisions`, !!seasonId)
  const registrations = useLeagueQuery<OrganizationTeamRow[]>(`organizations/${organizationId}/teams?seasonId=${seasonId}`, !!seasonId)
  const available = (divisions.data ?? []).filter((division) => !registrations.data?.some((row) => row.id === team.id && row.season_id === seasonId && row.division_id === division.id))
  const registration = useMutation({
    mutationFn: () => leagueRequest(`seasons/${seasonId}/teams`, client, 'POST', { teamId: team.id, divisionId }),
    onSuccess: () => { toast.success(`${team.name} registered for the division.`); onClose() },
    onError: (error) => toast.error(error.message),
  })
  return <form onSubmit={(event) => { event.preventDefault(); if (seasonId && available.some((item) => item.id === divisionId) && !registration.isPending) registration.mutate() }} className="flex flex-col gap-6">
    <Choice label="Season" value={seasonId} options={seasons} emptyLabel="Select a season" onChange={(value) => { setSeasonId(value); setDivisionId('') }} />
    {seasonId && <><Choice label="Division" value={divisionId} options={available} emptyLabel="Select a division" onChange={setDivisionId} />
      {divisions.isLoading || registrations.isLoading ? <p role="status" className="text-sm text-muted-foreground">Loading divisions…</p> : divisions.isError || registrations.isError ? <p role="alert" className="text-sm text-destructive">Could not load divisions and registrations. Close and try again.</p> : !available.length ? <p className="text-sm text-muted-foreground">No divisions are available for registration in this season.</p> : null}</>}
    <DialogFooter><Button type="button" variant="outline" disabled={registration.isPending} onClick={onClose}>Cancel</Button><Button type="submit" disabled={!seasonId || !available.some((item) => item.id === divisionId) || divisions.isLoading || registrations.isLoading || divisions.isError || registrations.isError || registration.isPending}>{registration.isPending ? 'Registering…' : 'Register team'}</Button></DialogFooter>
  </form>
}

function CreateTeamForm({ initialLeagueId, initialSeasonId, initialDivisionId, leagues, onClose, onCreated, onPendingChange }: { initialLeagueId: string; initialSeasonId: string; initialDivisionId: string; leagues: League[]; onClose: () => void; onCreated: (leagueId: string, seasonId: string, divisionId: string) => void; onPendingChange: (pending: boolean) => void }) {
  const client = useQueryClient()
  const [leagueId, setLeagueId] = useState(initialLeagueId)
  const [seasonId, setSeasonId] = useState(initialSeasonId)
  const [divisionId, setDivisionId] = useState(initialDivisionId)
  const availableDivisions = useLeagueQuery<Division[]>(`seasons/${seasonId}/divisions`, !!seasonId)
  const chosenDivision = availableDivisions.data?.find((item) => item.id === divisionId)
  const availableSeasons = useLeagueQuery<Season[]>(`leagues/${leagueId}/seasons`, !!leagueId)
  const eligibleSeasons = (availableSeasons.data ?? []).filter((item) => item.status !== 'completed')
  const chosenSeason = eligibleSeasons.find((item) => item.id === seasonId)
  const mutation = useMutation({
    mutationFn: (body: { name: string; abbreviation: string | null; seasonId: string; divisionId: string }) => leagueRequest(`leagues/${leagueId}/teams`, client, 'POST', body),
    onSuccess: (_result, submitted) => { const registeredSeason = availableSeasons.data?.find((item) => item.id === submitted.seasonId); toast.success(`Team created and registered for ${registeredSeason?.name ?? 'the selected season'}.`); onCreated(leagueId, submitted.seasonId, submitted.divisionId) },
    onSettled: () => onPendingChange(false),
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!chosenSeason || !chosenDivision || availableDivisions.isLoading || availableDivisions.isError || availableSeasons.isLoading || availableSeasons.isError || mutation.isPending) return
    const data = new FormData(event.currentTarget)
    onPendingChange(true)
    mutation.mutate({ name: String(data.get('name') ?? '').trim(), abbreviation: optional(String(data.get('abbreviation') ?? '')), seasonId: chosenSeason.id, divisionId: chosenDivision.id })
  }
  return <form onSubmit={submit} className="flex flex-col gap-6">
    <FieldSet className="gap-3">
      <FieldLegend variant="label" className="mb-1">League and season</FieldLegend>
      <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field className="min-w-0 gap-2">
          <FieldLabel htmlFor="create-team-league">League</FieldLabel>
          <Select value={leagueId} onValueChange={(value) => { setLeagueId(value ?? ''); setSeasonId(''); setDivisionId('') }} items={leagues.map((item) => ({ value: item.id, label: item.name }))} disabled={mutation.isPending}>
            <SelectTrigger id="create-team-league" className="w-full min-w-0"><SelectValue placeholder="Select a league" /></SelectTrigger>
            <SelectContent alignItemWithTrigger={false}><SelectGroup>{leagues.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field className="min-w-0 gap-2">
          <FieldLabel htmlFor="create-team-season">Season</FieldLabel>
          <Select value={seasonId || null} onValueChange={(value) => { setSeasonId(value ?? ''); setDivisionId('') }} items={eligibleSeasons.map((item) => ({ value: item.id, label: item.name }))} disabled={!leagueId || availableSeasons.isLoading || availableSeasons.isError || eligibleSeasons.length === 0 || mutation.isPending}>
            <SelectTrigger id="create-team-season" className="w-full min-w-0" aria-required="true" aria-describedby="create-team-season-description"><SelectValue placeholder="Select a season" /></SelectTrigger>
            <SelectContent alignItemWithTrigger={false}><SelectGroup>{eligibleSeasons.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field className="min-w-0 gap-2 sm:col-span-2"><FieldLabel htmlFor="create-team-division">Division</FieldLabel><Select value={divisionId || null} onValueChange={(value) => setDivisionId(value ?? '')} items={(availableDivisions.data ?? []).map((item) => ({ value: item.id, label: item.name }))} disabled={!seasonId || availableDivisions.isLoading || availableDivisions.isError || mutation.isPending}><SelectTrigger id="create-team-division" className="w-full" aria-required="true"><SelectValue placeholder="Select a division" /></SelectTrigger><SelectContent alignItemWithTrigger={false}><SelectGroup>{availableDivisions.data?.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select>{seasonId && (availableDivisions.isLoading ? <FieldDescription>Loading divisions…</FieldDescription> : availableDivisions.isError ? <FieldDescription>Could not load divisions. Try again.</FieldDescription> : !availableDivisions.data?.length ? <FieldDescription>No divisions are available in this season.</FieldDescription> : null)}{availableDivisions.isError && <Button type="button" size="sm" variant="outline" onClick={() => void availableDivisions.refetch()}>Try again</Button>}</Field>
        <FieldDescription id="create-team-season-description" aria-live="polite" className="sm:col-span-2">{!leagueId ? 'Choose a league to see its seasons.' : availableSeasons.isLoading ? 'Loading seasons…' : availableSeasons.isError ? 'Could not load seasons. Try again before creating a team.' : eligibleSeasons.length === 0 ? <>No draft or active seasons are available in this league. <Link href="/manage/seasons">Create a season</Link> first.</> : chosenSeason ? `The team will be registered for ${chosenSeason.name}.` : 'Choose the season this team will play in.'}</FieldDescription>
        {availableSeasons.isError && <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => void availableSeasons.refetch()}>Try again</Button>}
      </FieldGroup>
    </FieldSet>
    <Separator />
    <FieldSet className="gap-3">
      <FieldLegend variant="label" className="mb-1">Team details</FieldLegend>
      <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <Field className="min-w-0 gap-2">
          <FieldLabel htmlFor="create-team-name">Team name</FieldLabel>
          <Input id="create-team-name" name="name" placeholder="e.g. City Hawks" required maxLength={120} disabled={mutation.isPending} />
        </Field>
        <Field className="min-w-0 gap-2">
          <FieldLabel htmlFor="create-team-abbreviation">Abbreviation <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
          <Input id="create-team-abbreviation" name="abbreviation" placeholder="e.g. CH" maxLength={12} disabled={mutation.isPending} />
        </Field>
      </FieldGroup>
    </FieldSet>
    {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
    <Separator />
    <DialogFooter>
      <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>Cancel</Button>
      <Button type="submit" disabled={mutation.isPending || !leagueId || !chosenSeason || !chosenDivision || availableDivisions.isLoading || availableDivisions.isError || availableSeasons.isLoading || availableSeasons.isError}>{mutation.isPending ? 'Creating…' : 'Create team'}</Button>
    </DialogFooter>
  </form>
}

function Panel({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</CardHeader><CardContent className="flex flex-col gap-5">{children}</CardContent></Card>
}

function WorkspacePrompt({ leagueCount, leagueSelected, seasonCount }: { leagueCount: number; leagueSelected: boolean; seasonCount: number }) {
  if (!leagueCount) return <Panel title="Create a league" description="Set up a league to start managing your organization."><Button className="self-start" nativeButton={false} render={<Link href="/manage/leagues" />}>Set up a league</Button></Panel>
  if (!leagueSelected) return <Panel title="Choose a league" description="Select a league in the workspace control at the top of the page." />
  if (!seasonCount) return <Panel title="Create a season" description="Add a season to begin organizing teams and games."><Button className="self-start" nativeButton={false} render={<Link href="/manage/seasons" />}>Set up a season</Button></Panel>
  return <Panel title="Choose a season" description="Select a season in the workspace control at the top of the page." />
}
function NoData({ children }: { children: React.ReactNode }) { return <p className="text-sm text-muted-foreground">{children}</p> }
function LoadingContent() { return <div role="status" aria-label="Loading page content" className="flex flex-col gap-3"><Skeleton className="h-10 w-48" /><Skeleton className="h-32 w-full" /></div> }
function Choice({ label, value, options, onChange, emptyLabel }: { label: string; value: string; options: Item[]; onChange: (value: string) => void; emptyLabel?: string }) {
  const empty = emptyLabel ?? `No ${label.toLowerCase()} selected`
  return <Field className="w-full sm:w-52"><FieldLabel htmlFor={`context-${label}`}>{label}</FieldLabel><Select value={value || null} onValueChange={(next) => onChange(next ?? '')} items={[{ value: null, label: empty }, ...options.map((option) => ({ value: option.id, label: option.name }))]}><SelectTrigger id={`context-${label}`} className="w-full"><SelectValue /></SelectTrigger><SelectContent alignItemWithTrigger={false}><SelectGroup><SelectItem value={null}>{empty}</SelectItem>{options.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
}
function dateValue(value: string | null) { return value ? value.slice(0, 10) : '' }
function readableDate(date: string | null) { return date ? format(parseISO(dateValue(date)), 'MMM d, yyyy') : 'Not set' }
function dateTime(value: string | null) { return value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Date not scheduled' }
function localInput(value: string | null) { if (!value) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
const names = (items: Item[]): Option[] => items.map((item) => ({ value: item.id, label: item.name }))
const optional = (v: string) => v.trim() || null


function GamesList({ games, season, teams, venues }: { games: Game[]; season: Season; teams: SeasonTeam[]; venues: Item[] }) {
  const fields = (game: Game): InputField[] => [
    { name: 'homeTeamId', label: 'Home team', required: true, value: game.home_season_team_id, options: names(teams) },
    { name: 'awayTeamId', label: 'Away team', required: true, value: game.away_season_team_id, options: names(teams) },
    { name: 'scheduledAt', label: 'Date and time', type: 'datetime-local', required: true, value: localInput(game.scheduled_at) },
    { name: 'venueId', label: 'Venue', value: game.venue_id, options: names(venues) },
  ]
  return <div className="flex flex-col gap-4">{games.length === 0 && <NoData>No games to show yet.</NoData>}{games.map((game) => <div key={game.id} className="flex flex-col gap-2 border-b pb-4 last:border-0 last:pb-0">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{game.home_name} <span className="tabular-nums">{game.home_score !== null && game.away_score !== null ? `${game.home_score} – ${game.away_score}` : 'vs'}</span> {game.away_name}</p><Badge variant="secondary" className="capitalize">{game.status}</Badge></div>
    <p className="text-sm text-muted-foreground">{dateTime(game.scheduled_at)}{game.venue_name ? ` · ${game.venue_name}` : ''}</p>
    {game.status === 'scheduled' && season.status !== 'completed' && <details><summary className="cursor-pointer text-sm underline">Edit schedule</summary><div className="pt-3"><Editor title="Edit game" path={`games/${game.id}`} method="PATCH" fields={fields(game)} transform={(v) => ({ ...v, scheduledAt: new Date(v.scheduledAt).toISOString(), venueId: optional(v.venueId) })} /></div></details>}
    {(season.status === 'active' || (season.status === 'completed' && game.status === 'completed')) && <details><summary className="cursor-pointer text-sm underline">{game.status === 'completed' ? 'Correct score' : 'Record final score'}</summary><div className="pt-3"><Editor title="Final score" path={`games/${game.id}/score`} fields={[{ name: 'homeScore', label: `${game.home_name} score`, type: 'number', required: true, value: game.home_score }, { name: 'awayScore', label: `${game.away_name} score`, type: 'number', required: true, value: game.away_score }]} transform={(v) => ({ homeScore: Number(v.homeScore), awayScore: Number(v.awayScore) })} /></div></details>}
  </div>)}</div>
}

function StandingsView({ season, division, rows }: { season: Season; division: Division; rows: Standing[] }) {
  const hasResults = rows.some((row) => row.wins + row.losses > 0)
  return <section aria-label={`Standings for ${season.name}`} className="flex flex-col gap-8">
    <section aria-labelledby="standings-leaders-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1"><h3 id="standings-leaders-title" className="text-lg font-semibold">Top three</h3><p className="text-sm text-muted-foreground">The leading teams in {season.name} · {division.name}.</p></div>
      {hasResults ? <div className="grid gap-3 md:grid-cols-3">{rows.slice(0, 3).map((row, index) => <Card key={row.id} className="gap-0 py-0"><CardContent className="flex-row items-center gap-3 px-4 py-4">
        <Badge variant="secondary" className={index === 0 ? 'bg-amber-800 px-2 py-1 text-white' : 'px-2 py-1'}>#{index + 1}</Badge>
        <span className="min-w-0 flex-1 break-words font-semibold">{row.name}</span>
        <span className="shrink-0 border-l pl-3 text-sm font-medium tabular-nums" aria-label={`${row.wins} ${row.wins === 1 ? 'win' : 'wins'}, ${row.losses} ${row.losses === 1 ? 'loss' : 'losses'}`}>{row.wins} – {row.losses}</span>
        <span className="shrink-0 border-l pl-3 text-sm font-medium tabular-nums" aria-label={`Point difference ${row.pointDifference}`}>{row.pointDifference > 0 ? `+${row.pointDifference}` : row.pointDifference}</span>
      </CardContent></Card>)}</div> : <Alert><AlertTitle>No final results yet</AlertTitle><AlertDescription>Leading teams will appear here after final scores are recorded.</AlertDescription></Alert>}
    </section>
    <Card className="gap-0 py-0"><CardHeader className="border-b px-4 py-4 sm:px-5"><CardTitle><h3 className="text-base font-semibold">Full standings</h3></CardTitle></CardHeader><CardContent className="px-0">
      <Table className="table-fixed"><caption className="sr-only">Standings for {season.name}, ordered by wins, point difference, team name and ID</caption>
        <TableHeader className="bg-muted/30"><TableRow>
          <TableHead scope="col" className="w-12 pl-4 sm:w-16 sm:pl-5"><span className="sm:hidden" aria-hidden="true">#</span><span className="sr-only sm:not-sr-only">Rank</span></TableHead>
          <TableHead scope="col">Team</TableHead>
          <TableHead scope="col" aria-label="Wins" className="w-12 text-right sm:w-20"><span className="sm:hidden" aria-hidden="true">W</span><span className="hidden sm:inline">Wins</span></TableHead>
          <TableHead scope="col" aria-label="Losses" className="w-12 text-right sm:w-20"><span className="sm:hidden" aria-hidden="true">L</span><span className="hidden sm:inline">Losses</span></TableHead>
          <TableHead scope="col" aria-label="Point difference" className="w-16 pr-4 text-right sm:w-36 sm:pr-5"><span className="sm:hidden" aria-hidden="true">Diff</span><span className="hidden sm:inline">Point difference</span></TableHead>
        </TableRow></TableHeader>
        <TableBody>{rows.map((row, index) => <TableRow key={row.id}>
          <TableCell className="py-4 pl-4 tabular-nums text-muted-foreground sm:pl-5">#{index + 1}</TableCell>
          <TableCell className="break-words whitespace-normal font-medium">{row.name}</TableCell>
          <TableCell className="text-right tabular-nums">{row.wins}</TableCell>
          <TableCell className="text-right tabular-nums">{row.losses}</TableCell>
          <TableCell className="pr-4 text-right tabular-nums sm:pr-5">{row.pointDifference > 0 ? `+${row.pointDifference}` : row.pointDifference}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </CardContent></Card>
    <p className="flex items-start gap-2 text-sm text-muted-foreground"><InfoIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>Ranked by wins, point difference, then team name.</span></p>
  </section>
}

type GameDialog = { kind: 'schedule' } | { kind: 'edit' | 'score'; game: Game }

function GamesManager({ season, division, teams, venues }: { season: Season; division: Division; teams: SeasonTeam[]; venues: Item[] }) {
  const [dialog, setDialog] = useState<GameDialog | null>(null)
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState('scheduled')
  const [dates, setDates] = useState<DateRange | undefined>()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const client = useQueryClient()
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort: status === 'completed' ? 'desc' : 'asc', status })
  params.set('divisionId', division.id)
  if (dates?.from) params.set('from', startOfDay(dates.from).toISOString())
  if (dates?.to) params.set('to', startOfDay(addDays(dates.to, 1)).toISOString())
  const path = `seasons/${season.id}/games?${params}`
  const games = useQuery({ queryKey: ['league', path], queryFn: async () => requirePaginatedResult<Game>(await leagueRequest<unknown>(path, client)), retry: false })
  const resetPage = () => { setPage(1); setPageSize(10) }
  const clearDates = () => { setDates(undefined); resetPage() }
  const editable = season.status !== 'completed'
  const game = dialog && 'game' in dialog ? dialog.game : undefined
  const gameFields: InputField[] = [
    { name: 'homeTeamId', label: 'Home team', required: true, value: game?.home_season_team_id, options: names(teams) },
    { name: 'awayTeamId', label: 'Away team', required: true, value: game?.away_season_team_id, options: names(teams) },
    { name: 'scheduledAt', label: 'Date and time', type: 'datetime-local', required: true, value: localInput(game?.scheduled_at ?? null) },
    { name: 'venueId', label: 'Venue', value: game?.venue_id, options: names(venues) },
  ]
  const closeDialog = () => setDialog(null)
  const saved = (message: string) => { closeDialog(); toast.success(message) }
  const groups = new Map<string, { day: Date | null; rows: Game[] }>()
  for (const row of games.data?.items ?? []) {
    const day = row.scheduled_at ? new Date(row.scheduled_at) : null
    const key = day ? format(day, 'yyyy-MM-dd') : 'unscheduled'
    if (!groups.has(key)) groups.set(key, { day, rows: [] })
    groups.get(key)!.rows.push(row)
  }
  const gameAgenda = games.data?.items.length ? <div className="flex flex-col gap-8">{Array.from(groups.entries()).map(([key, group]) => <section key={key} className="flex flex-col gap-4" aria-label={group.day ? format(group.day, 'EEEE, MMMM d, yyyy') : 'Date not scheduled'}>
    <div className="flex flex-wrap items-baseline gap-3"><h3 className="text-xl font-semibold tracking-tight">{group.day ? format(group.day, 'EEEE, MMM d') : 'Date not scheduled'}</h3><span className="text-sm text-muted-foreground">{group.rows.length} {group.rows.length === 1 ? 'game' : 'games'}{games.data && games.data.total > games.data.pageSize ? ' shown' : ''}</span></div>
    <div className="flex items-start gap-4 sm:gap-6">
      {group.day && <div aria-hidden="true" className="hidden w-20 shrink-0 flex-col items-center rounded-lg border bg-card px-2 py-3 text-center sm:flex"><span className="text-xs uppercase text-muted-foreground">{format(group.day, 'MMM')}</span><span className="text-2xl font-semibold tabular-nums">{format(group.day, 'd')}</span><span className="text-xs uppercase text-muted-foreground">{format(group.day, 'EEE')}</span></div>}
      <Table className="table-fixed border-y"><caption className="sr-only">{group.day ? format(group.day, 'EEEE, MMMM d, yyyy') : 'Date not scheduled'} games</caption>
        <colgroup><col className="w-24 sm:w-28" /><col /><col className="hidden w-48 md:table-column" /><col className="hidden w-32 lg:table-column" /><col className="w-12" /></colgroup>
        <TableHeader className="sr-only"><TableRow><TableHead scope="col">Time</TableHead><TableHead scope="col">Matchup and score</TableHead><TableHead scope="col">Venue</TableHead><TableHead scope="col">Status</TableHead><TableHead scope="col">Actions</TableHead></TableRow></TableHeader>
        <TableBody>{group.rows.map((row) => {
          const canEdit = row.status === 'scheduled' && editable
          const canScore = (row.status === 'scheduled' && season.status === 'active') || (row.status === 'completed' && (season.status === 'active' || season.status === 'completed'))
          return <TableRow key={row.id}>
            <TableCell className="w-24 py-4 font-medium tabular-nums sm:w-28">{row.scheduled_at ? new Date(row.scheduled_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—'}</TableCell>
            <TableCell className="max-w-0 whitespace-normal"><span className="break-words font-medium">{row.home_name} <span className="font-normal text-muted-foreground">vs</span> {row.away_name}</span>{row.home_score !== null && row.away_score !== null && <span className="ml-2 font-semibold tabular-nums">{row.home_score} – {row.away_score}</span>}<div className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground md:hidden"><span>{row.venue_name ?? 'No venue'}</span></div></TableCell>
            <TableCell className="hidden w-48 max-w-0 whitespace-normal text-muted-foreground md:table-cell">{row.venue_name ? <span className="flex items-center gap-1.5 break-words"><MapPinIcon aria-hidden="true" className="size-4 shrink-0" />{row.venue_name}</span> : '—'}</TableCell>
            <TableCell className="hidden w-32 lg:table-cell"><Badge variant={row.status === 'completed' ? 'seasonActive' : 'seasonDraft'}>{row.status === 'completed' ? 'Final result' : 'Scheduled'}</Badge></TableCell>
            <TableCell className="pr-3 text-right">{(canEdit || canScore) && <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.home_name} vs ${row.away_name}`} />}><MoreVerticalIcon /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup>
              {canEdit && <DropdownMenuItem onClick={() => setDialog({ kind: 'edit', game: row })}><PencilIcon />Edit schedule</DropdownMenuItem>}
              {canScore && <DropdownMenuItem onClick={() => setDialog({ kind: 'score', game: row })}><CircleCheckIcon />{row.status === 'completed' ? 'Correct score' : 'Record final score'}</DropdownMenuItem>}
            </DropdownMenuGroup></DropdownMenuContent></DropdownMenu>}</TableCell>
          </TableRow>
        })}</TableBody>
      </Table>
    </div>
  </section>)}<DataPagination meta={games.data} onPageChange={setPage} onPageSizeChange={(size) => { setPage(1); setPageSize(size) }} /></div> : <Card><CardContent><Empty className="px-4 py-10"><EmptyHeader><EmptyMedia variant="icon"><CalendarDaysIcon aria-hidden="true" /></EmptyMedia><EmptyTitle><h3>{dates?.from ? 'No games in this date range' : status === 'completed' ? 'No final results yet' : 'No scheduled games'}</h3></EmptyTitle><EmptyDescription>{dates?.from ? 'Choose different dates to see more games.' : status === 'completed' ? 'Final scores will appear here once recorded.' : editable ? 'Schedule a matchup for this season.' : 'No scheduled games are available for this season.'}</EmptyDescription></EmptyHeader><EmptyContent><div className="flex flex-wrap justify-center gap-2">{dates?.from && <Button variant="outline" onClick={clearDates}>Clear dates</Button>}{status === 'scheduled' && editable && teams.length >= 2 && <Button onClick={() => setDialog({ kind: 'schedule' })}><PlusIcon data-icon="inline-start" />Schedule game</Button>}</div></EmptyContent></Empty></CardContent></Card>
  return <div className="flex flex-col gap-8">
    <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex flex-col gap-1"><h3 className="font-medium">{season.name} · {division.name}</h3><div className="flex items-center gap-2"><SeasonStatusBadge status={season.status} includeSeason /></div></div>{editable && <Button onClick={() => setDialog({ kind: 'schedule' })} disabled={teams.length < 2}><PlusIcon data-icon="inline-start" />Schedule game</Button>}</div>
    {editable && teams.length < 2 && <Alert><AlertTitle>Register teams to schedule games</AlertTitle><AlertDescription><p>Add at least two teams to this division before scheduling a matchup.</p><Button variant="outline" size="sm" className="mt-3" nativeButton={false} render={<Link href="/manage/teams" />}>Manage teams</Button></AlertDescription></Alert>}
    {season.status === 'draft' && <Alert><AlertTitle>Season is in draft</AlertTitle><AlertDescription>You can schedule games now. Start the season before recording final scores.</AlertDescription></Alert>}
    {season.status === 'completed' && <Alert><AlertTitle>Season completed</AlertTitle><AlertDescription>Scheduling is closed. Final scores can still be corrected.</AlertDescription></Alert>}
    <Tabs value={status} onValueChange={(value) => { if (typeof value === 'string') { setStatus(value); resetPage() } }}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4"><TabsList><TabsTrigger value="scheduled">Scheduled</TabsTrigger><TabsTrigger value="completed">Final results</TabsTrigger></TabsList><div className="flex flex-wrap items-center gap-2"><Popover><PopoverTrigger render={<Button id="game-dates" type="button" variant="outline" aria-label="Filter games by date range" className="justify-start font-normal" />}><CalendarDaysIcon data-icon="inline-start" />{dates?.from ? dates.to ? `${format(dates.from, 'MMM d')} – ${format(dates.to, 'MMM d, yyyy')}` : `From ${format(dates.from, 'MMM d, yyyy')}` : 'All dates'}</PopoverTrigger><PopoverContent align="end" className="w-auto p-0"><Calendar mode="range" selected={dates} onSelect={(value) => { setDates(value); resetPage() }} autoFocus />{dates?.from && <Button type="button" variant="ghost" className="mx-3 mb-3" onClick={clearDates}>Clear dates</Button>}</PopoverContent></Popover><Button type="button" variant="outline" disabled={!dates?.from} onClick={clearDates}>Reset</Button></div></div>
      <TabsContent value={status} className="pt-5">{games.isLoading ? <LoadingContent /> : games.isError ? <Alert variant="destructive"><AlertTitle>Couldn’t load games</AlertTitle><AlertDescription><p>{games.error.message}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void games.refetch()}>Try again</Button></AlertDescription></Alert> : gameAgenda}</TabsContent>
    </Tabs>
    <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open && !pending) closeDialog() }}><DialogContent showCloseButton={!pending} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{dialog?.kind === 'schedule' ? 'Schedule a game' : dialog?.kind === 'edit' ? 'Edit schedule' : game?.status === 'completed' ? 'Correct final score' : 'Record final score'}</DialogTitle><DialogDescription>{dialog?.kind === 'score' ? `${game?.home_name} vs ${game?.away_name} · ${season.name}` : `Choose two teams in ${division.name} and enter the local date and time.`}</DialogDescription></DialogHeader>
      {(dialog?.kind === 'schedule' || dialog?.kind === 'edit') && <Editor key={dialog.kind === 'edit' ? dialog.game.id : 'schedule'} title="Game details" path={dialog.kind === 'edit' ? `games/${dialog.game.id}` : `seasons/${season.id}/games`} method={dialog.kind === 'edit' ? 'PATCH' : 'POST'} fields={gameFields} transform={(v) => ({ ...v, scheduledAt: new Date(v.scheduledAt).toISOString(), venueId: optional(v.venueId) })} submitLabel={dialog.kind === 'edit' ? 'Save changes' : 'Schedule game'} alignActions="end" onSaved={() => saved(dialog.kind === 'edit' ? 'Schedule updated.' : 'Game scheduled.')} onCancel={closeDialog} onPendingChange={setPending} />}
      {dialog?.kind === 'score' && <Editor key={dialog.game.id} title="Final score" path={`games/${dialog.game.id}/score`} fields={[{ name: 'homeScore', label: `${dialog.game.home_name} score`, type: 'number', required: true, value: dialog.game.home_score }, { name: 'awayScore', label: `${dialog.game.away_name} score`, type: 'number', required: true, value: dialog.game.away_score }]} transform={(v) => ({ homeScore: Number(v.homeScore), awayScore: Number(v.awayScore) })} submitLabel="Save score" alignActions="end" onSaved={() => saved('Final score saved.')} onCancel={closeDialog} onPendingChange={setPending} />}
    </DialogContent></Dialog>
  </div>
}

export function LeagueWorkspace({ section, initialTeamFilters }: { section: Section; initialTeamFilters?: TeamFilters }) {
  const { organizations, organization, leagues, league: selectedLeague, seasons, season, divisions, division, changeDivision, changeWorkspace } = useWorkspace()
  const org = organization?.id ?? ''
  const league = selectedLeague?.id ?? ''
  const [teamSearch, setTeamSearch] = useState(initialTeamFilters?.search ?? '')
  const [teamDivisionSelection, setTeamDivisionSelection] = useState({ id: initialTeamFilters?.divisionId ?? '', seasonId: season?.id ?? '' })
  const [debouncedTeamSearch, setDebouncedTeamSearch] = useState(initialTeamFilters?.search.trim() ?? '')
  const teamView = useSyncExternalStore(subscribeTeamView, readTeamView, () => 'table')
  const teamLeagueFilter = league
  const teamSeasonFilter = season?.id ?? ''
  const selectedTeamDivision = (!teamDivisionSelection.seasonId || teamDivisionSelection.seasonId === teamSeasonFilter) && divisions.data?.some((item) => item.id === teamDivisionSelection.id) ? teamDivisionSelection.id : ''
  const teamDivisionForLink = divisions.isSuccess ? selectedTeamDivision : teamDivisionSelection.id
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedTeamSearch(teamSearch.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [teamSearch])
  useEffect(() => {
    if (section === 'teams') window.history.replaceState(window.history.state, '', teamListHref({ search: teamSearch, leagueId: '', seasonId: '', divisionId: teamDivisionForLink }))
  }, [section, teamSearch, teamDivisionForLink])
  const [seasonSearch, setSeasonSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [seasonStatus, setSeasonStatus] = useState('')
  const [seasonLeagueFilter, setSeasonLeagueFilter] = useState('')
  const selectedSeasonLeague = leagues.data?.some((item) => item.id === seasonLeagueFilter) ? seasonLeagueFilter : ''
  const [seasonPageNumber, setSeasonPageNumber] = useState(1)
  const [seasonPageSize, setSeasonPageSize] = useState(10)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(seasonSearch.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [seasonSearch])
  const searchPending = section === 'seasons' && seasonSearch.trim() !== debouncedSearch
  const seasonFilters = new URLSearchParams()
  if (section === 'seasons' && debouncedSearch) seasonFilters.set('search', debouncedSearch)
  if (section === 'seasons' && seasonStatus) seasonFilters.set('status', seasonStatus)
  if (section === 'seasons' && selectedSeasonLeague) seasonFilters.set('leagueId', selectedSeasonLeague)
  if (section === 'seasons') { seasonFilters.set('page', String(seasonPageNumber)); seasonFilters.set('pageSize', String(seasonPageSize)) }
  const seasonQuery = seasonFilters.toString()
  const filtersActive = !!(seasonSearch.trim() || seasonStatus || selectedSeasonLeague)
  const queryClient = useQueryClient()
  const seasonPagePath = `organizations/${org}/seasons?${seasonQuery}`
  const seasonPage = useQuery({ queryKey: ['league', seasonPagePath], queryFn: async () => requirePaginatedResult<SeasonListItem>(await leagueRequest<unknown>(seasonPagePath, queryClient)), enabled: !!org && section === 'seasons' && !searchPending, retry: false })
  const teamSeasons = useLeagueQuery<TeamSeasonOption[]>(`organizations/${org}/team-seasons`, !!org && section === 'teams')
  const teamFilters = new URLSearchParams()
  if (teamLeagueFilter) teamFilters.set('leagueId', teamLeagueFilter)
  if (teamSeasonFilter) teamFilters.set('seasonId', teamSeasonFilter)
  if (debouncedTeamSearch) teamFilters.set('search', debouncedTeamSearch)
  const teamSearchPending = section === 'teams' && teamSearch.trim() !== debouncedTeamSearch
  const organizationTeams = useLeagueQuery<OrganizationTeamRow[]>(`organizations/${org}/teams?${teamFilters}`, !!org && section === 'teams' && !teamSearchPending && !!league && !!season)
  const teamRows = selectSeasonTeamRegistrations(organizationTeams.data ?? [], teamSeasonFilter, selectedTeamDivision)
  const visibleTeamCount = teamRows.length
  const teamFiltersActive = !!teamSearch.trim() || !!selectedTeamDivision
  const teamReturnQuery = teamListHref({ search: teamSearch, leagueId: '', seasonId: '', divisionId: selectedTeamDivision }).slice('/manage/teams'.length)
  const seasonTeams = useLeagueQuery<SeasonTeam[]>(`seasons/${season?.id}/teams?divisionId=${encodeURIComponent(division?.id ?? '')}`, !!season && !!division && ['dashboard', 'games'].includes(section))
  const venues = useLeagueQuery<Item[]>(`leagues/${league}/venues`, !!league && ['dashboard', 'games'].includes(section))
  const dashboard = useLeagueQuery<Dashboard>(`seasons/${season?.id}/dashboard?divisionId=${encodeURIComponent(division?.id ?? '')}`, !!season && !!division && section === 'dashboard')
  const standings = useLeagueQuery<Standing[]>(`seasons/${season?.id}/standings?divisionId=${encodeURIComponent(division?.id ?? '')}`, !!season && !!division && section === 'standings')
  const [editing, setEditing] = useState('')
  const [seasonToEdit, setSeasonToEdit] = useState<Season | null>(null)
  const [createSeasonOpen, setCreateSeasonOpen] = useState(false)
  const [createSeasonLeague, setCreateSeasonLeague] = useState('')
  const [createTeamOpen, setCreateTeamOpen] = useState(false)
  const [createTeamPending, setCreateTeamPending] = useState(false)
  const [teamToEdit, setTeamToEdit] = useState<Team | null>(null)
  const [teamToRegister, setTeamToRegister] = useState<OrganizationTeamRow | null>(null)
  const [registerExistingOpen, setRegisterExistingOpen] = useState(false)
  const [teamToCorrect, setTeamToCorrect] = useState<OrganizationTeamRow | null>(null)
  const relevantQueries = [leagues, ...(section === 'seasons' ? [seasonPage] : ['dashboard', 'games', 'standings', 'teams', 'divisions'].includes(section) ? [seasons, divisions] : []), ...(section === 'teams' ? [organizationTeams, teamSeasons] : []), ...(section === 'games' ? [seasonTeams, venues] : []), ...(section === 'dashboard' ? [seasonTeams, venues, dashboard] : []), ...(section === 'standings' ? [standings] : [])]
  const failedQuery = searchPending || teamSearchPending ? undefined : relevantQueries.find((query) => query.isError)
  const loading = searchPending || teamSearchPending || relevantQueries.some((query) => query.isLoading)
  const nameField = (value?: string): InputField[] => [{ name: 'name', label: 'Name', required: true, value }]
  const dateFields = (s?: Season): InputField[] => [...nameField(s?.name), { name: 'startDate', label: 'Start date', type: 'date', value: dateValue(s?.start_date ?? null) }, { name: 'endDate', label: 'End date', type: 'date', value: dateValue(s?.end_date ?? null) }]
  const seasonData = (v: Record<string, string>) => ({ name: v.name, startDate: optional(v.startDate), endDate: optional(v.endDate) })
  const teamFields = (t?: Team): InputField[] => [...nameField(t?.name), { name: 'abbreviation', label: 'Abbreviation', value: t?.abbreviation }]
  const teamData = (v: Record<string, string>) => ({ name: v.name, abbreviation: optional(v.abbreviation) })

  if (organizations.isLoading) return <main className="flex flex-1 flex-col gap-6 p-4 md:p-6"><NoData>Loading your organization…</NoData></main>
  if (organizations.isError) return <main className="flex flex-1 flex-col gap-6 p-4 md:p-6"><Panel title="Couldn’t load your organization" description={organizations.error.message}><Button variant="outline" onClick={() => void organizations.refetch()} className="self-start">Try again</Button></Panel></main>
  if (!organization) return <main className="flex flex-1 flex-col gap-6 p-4 md:p-6"><Panel title="Choose an organization" description="Select an organization to continue managing its leagues."><Button nativeButton={false} render={<Link href="/organizations" />} className="self-start">Choose organization</Button></Panel></main>

  return <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 p-4 md:p-8">
    <div className="flex flex-col gap-6 border-b pb-6">
      <div className="flex flex-col gap-2"><h2 className="text-2xl font-semibold tracking-tight">{pageCopy[section].title}</h2><p className="text-sm text-muted-foreground">{pageCopy[section].description}</p></div>
      {section === 'seasons' ? <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <Field className="w-full sm:w-64"><FieldLabel htmlFor="season-search">Search seasons</FieldLabel><Input id="season-search" type="search" placeholder="Search by name" maxLength={120} value={seasonSearch} onChange={(event) => { setSeasonPageNumber(1); setSeasonPageSize(10); setSeasonSearch(event.target.value) }} /></Field>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <Choice label="League" value={selectedSeasonLeague} options={leagues.data ?? []} emptyLabel="All Leagues" onChange={(v) => { setSeasonPageNumber(1); setSeasonPageSize(10); setSeasonLeagueFilter(v) }} />
        <Field className="w-full sm:w-52"><FieldLabel htmlFor="season-status">Status</FieldLabel><Select value={seasonStatus || null} onValueChange={(value) => { setSeasonPageNumber(1); setSeasonPageSize(10); setSeasonStatus(value ?? '') }} items={[{ value: null, label: 'All statuses' }, { value: 'draft', label: 'Draft' }, { value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }]}><SelectTrigger id="season-status" className="w-full"><SelectValue /></SelectTrigger><SelectContent alignItemWithTrigger={false}><SelectGroup><SelectItem value={null}>All statuses</SelectItem><SelectItem value="draft">Draft</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="completed">Completed</SelectItem></SelectGroup></SelectContent></Select></Field>
        </div>
      </div> : section === 'teams' ? <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end"><Field className="w-full sm:w-64"><FieldLabel htmlFor="team-search">Search teams</FieldLabel><Input id="team-search" type="search" placeholder="Search by team name" maxLength={120} value={teamSearch} onChange={(event) => setTeamSearch(event.target.value)} /></Field><Choice label="Division" value={selectedTeamDivision} options={divisions.data ?? []} emptyLabel="All divisions" onChange={(value) => setTeamDivisionSelection({ id: value, seasonId: teamSeasonFilter })} /></div>
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Teams display" className="inline-flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
            <Button type="button" size="icon-sm" variant={teamView === 'table' ? 'secondary' : 'ghost'} aria-label="Table view" aria-pressed={teamView === 'table'} title="Table view" onClick={() => saveTeamView('table')}><ListIcon aria-hidden="true" /></Button>
            <Button type="button" size="icon-sm" variant={teamView === 'cards' ? 'secondary' : 'ghost'} aria-label="Card view" aria-pressed={teamView === 'cards'} title="Card view" onClick={() => saveTeamView('cards')}><LayoutGridIcon aria-hidden="true" /></Button>
          </div>
        </div>
      </div> : null}
      {['dashboard', 'games', 'standings'].includes(section) && season && <div className="flex flex-wrap items-end justify-between gap-4"><Field className="w-full sm:w-56"><FieldLabel htmlFor="page-division">Division</FieldLabel><Select value={division?.id ?? null} onValueChange={(value) => { if (value) changeDivision(value) }} items={(divisions.data ?? []).map((item) => ({ value: item.id, label: item.name }))} disabled={!divisions.data?.length}><SelectTrigger id="page-division" className="w-full"><SelectValue placeholder={divisions.isLoading ? 'Loading divisions…' : divisions.isError ? 'Divisions unavailable' : divisions.data?.length ? 'Choose division' : 'No divisions'} /></SelectTrigger><SelectContent alignItemWithTrigger={false}><SelectGroup>{divisions.data?.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>{section === 'standings' && <Button nativeButton={false} variant="outline" render={<Link href="/manage/games" />}><CalendarDaysIcon data-icon="inline-start" />View games</Button>}</div>}
    </div>
    {failedQuery ? <Alert variant="destructive"><AlertTitle>Couldn’t load this page</AlertTitle><AlertDescription><p>{failedQuery.error?.message}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void failedQuery.refetch()}>Try again</Button></AlertDescription></Alert> : loading ? <LoadingContent /> : <>
    {section === 'dashboard' && <>
      {!league || !season ? <WorkspacePrompt leagueCount={leagues.data?.length ?? 0} leagueSelected={!!league} seasonCount={seasons.data?.length ?? 0} /> : !division ? <NoData>Choose a division to view the dashboard.</NoData> : <>
        <Panel title={season.name} description={`${division?.name ?? 'Division'} · Season ${season.status} · ${dashboard.data?.teamCount ?? 0} registered teams`}><Button className="self-start" nativeButton={false} variant="outline" render={<Link href="/manage/teams" />}>Manage teams</Button></Panel>
        <div className="grid gap-4 lg:grid-cols-2"><Panel title="Upcoming games"><GamesList games={dashboard.data?.upcoming ?? []} season={season} teams={seasonTeams.data ?? []} venues={venues.data ?? []} /><Button className="self-start" nativeButton={false} variant="outline" render={<Link href="/manage/games" />}>Manage games</Button></Panel><Panel title="Recent results"><GamesList games={dashboard.data?.recent ?? []} season={season} teams={seasonTeams.data ?? []} venues={venues.data ?? []} /></Panel></div>
        <Panel title="Standings" description="Ordered by wins, point difference, and team name.">{dashboard.data?.standings.length ? <Table><TableHeader><TableRow><TableHead>Team</TableHead><TableHead>Wins</TableHead><TableHead>Losses</TableHead><TableHead>Point difference</TableHead></TableRow></TableHeader><TableBody>{dashboard.data.standings.map((row) => <TableRow key={row.id}><TableCell>{row.name}</TableCell><TableCell>{row.wins}</TableCell><TableCell>{row.losses}</TableCell><TableCell>{row.pointDifference}</TableCell></TableRow>)}</TableBody></Table> : <NoData>Register teams to see standings.</NoData>}<Button className="self-start" nativeButton={false} variant="outline" render={<Link href="/manage/standings" />}>View standings</Button></Panel>
      </>}
    </>}
    {section === 'leagues' && (leagues.data?.length ? <section aria-labelledby="leagues-list-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex flex-col gap-1"><h3 id="leagues-list-title" className="font-medium">Your leagues</h3><p className="text-sm text-muted-foreground">{leagues.data.length} {leagues.data.length === 1 ? 'league' : 'leagues'} in this organization</p></div><CreateLeagueDialog organizationId={org} /></div>
      <Card className="gap-0 py-0"><CardContent className="px-0"><Table className="table-fixed"><caption className="sr-only">Leagues in this organization</caption>
        <TableHeader className="bg-muted/30"><TableRow><TableHead scope="col" className="pl-5 text-muted-foreground">League</TableHead><TableHead scope="col" className="hidden text-muted-foreground sm:table-cell">Location</TableHead><TableHead scope="col" className="w-16 pr-4 text-right"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
        <TableBody>{leagues.data.map((item) => <Fragment key={item.id}>
          <TableRow>
            <TableCell className="max-w-0 py-3 pl-5 whitespace-normal"><span className="break-words font-medium">{item.name}</span><p className="mt-1 break-words text-xs text-muted-foreground sm:hidden">{item.location || 'No location added'}</p></TableCell>
            <TableCell className="hidden max-w-0 py-3 whitespace-normal text-muted-foreground sm:table-cell"><span className="break-words">{item.location || 'No location added'}</span></TableCell>
            <TableCell className="py-3 pr-4 text-right"><DropdownMenu><DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`Actions for ${item.name}`} />}><MoreVerticalIcon /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setEditing(editing === item.id ? '' : item.id)}><PencilIcon />{editing === item.id ? 'Close editor' : 'Edit league'}</DropdownMenuItem>
            </DropdownMenuGroup></DropdownMenuContent></DropdownMenu></TableCell>
          </TableRow>
          {editing === item.id && <TableRow><TableCell colSpan={3} className="px-5 py-5 whitespace-normal"><div id={`edit-league-${item.id}`} className="max-w-lg"><Editor title="Edit league" path={`leagues/${item.id}`} method="PATCH" fields={[...nameField(item.name), { name: 'location', label: 'Location', value: item.location }]} transform={(v) => ({ name: v.name, location: optional(v.location) })} onSaved={() => setEditing('')} /></div></TableCell></TableRow>}
        </Fragment>)}</TableBody>
      </Table></CardContent></Card>
    </section> : <Card className="mx-auto w-full max-w-3xl"><CardContent>
      <Empty className="px-4 py-10 sm:py-14"><EmptyHeader><EmptyMedia variant="icon"><TrophyIcon aria-hidden="true" /></EmptyMedia><EmptyTitle><h3>No leagues yet</h3></EmptyTitle><EmptyDescription>Create your first league to start organizing seasons, teams, and games.</EmptyDescription></EmptyHeader><EmptyContent><CreateLeagueDialog organizationId={org} first /></EmptyContent></Empty>
    </CardContent></Card>)}
    {section === 'seasons' && (!leagues.data?.length ? <Panel title="A league is needed" description="Create a league before setting up a season."><Button className="self-start" nativeButton={false} render={<Link href="/manage/leagues" />}>Set up a league</Button></Panel> : <>
      <Dialog open={createSeasonOpen} onOpenChange={(open) => { if (open) setCreateSeasonLeague(selectedSeasonLeague); setCreateSeasonOpen(open) }}>
        {seasonPage.data?.items.length ? <section aria-labelledby="seasons-list-title" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex flex-col gap-1"><h3 id="seasons-list-title" className="font-medium">Your seasons</h3><p className="text-sm text-muted-foreground">{seasonPage.data.total} {seasonPage.data.total === 1 ? 'season' : 'seasons'} {filtersActive ? 'matching your filters' : 'in this organization'}</p></div><DialogTrigger render={<Button />}><PlusIcon data-icon="inline-start" />Create season</DialogTrigger></div>
          <Card className="gap-0 py-0"><CardContent className="px-0"><Table className="table-fixed"><caption className="sr-only">Seasons in this organization</caption>
            <TableHeader className="bg-muted/30"><TableRow><TableHead scope="col" className="pl-5 text-muted-foreground">Season</TableHead><TableHead scope="col" className="hidden text-muted-foreground md:table-cell">League</TableHead><TableHead scope="col" className="w-24 text-muted-foreground sm:w-32">Status</TableHead><TableHead scope="col" className="hidden text-muted-foreground md:table-cell">Start date</TableHead><TableHead scope="col" className="hidden text-muted-foreground md:table-cell">End date</TableHead><TableHead scope="col" className="w-16 pr-4 text-right"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>{seasonPage.data.items.map((item) => <Fragment key={item.id}>
              <TableRow><TableCell className="max-w-0 py-3 pl-5 whitespace-normal"><span className="break-words font-medium">{item.name}</span><div className="mt-1 flex flex-col gap-1 break-words text-xs text-muted-foreground md:hidden"><span>{item.league_name}</span><span>Start: {readableDate(item.start_date)}</span><span>End: {readableDate(item.end_date)}</span></div></TableCell><TableCell className="hidden max-w-0 break-words whitespace-normal text-muted-foreground md:table-cell">{item.league_name}</TableCell><TableCell><SeasonStatusBadge status={item.status} /></TableCell><TableCell className="hidden whitespace-normal text-muted-foreground md:table-cell">{readableDate(item.start_date)}</TableCell><TableCell className="hidden whitespace-normal text-muted-foreground md:table-cell">{readableDate(item.end_date)}</TableCell><TableCell className="pr-4 text-right"><SeasonActions season={item} onEdit={() => setSeasonToEdit(item)} /></TableCell></TableRow>
            </Fragment>)}</TableBody>
          </Table><DataPagination meta={seasonPage.data} onPageChange={setSeasonPageNumber} onPageSizeChange={(size) => { setSeasonPageNumber(1); setSeasonPageSize(size) }} /></CardContent></Card>
        </section> : <Card className="mx-auto w-full max-w-3xl"><CardContent><Empty className="px-4 py-10 sm:py-14"><EmptyHeader><EmptyMedia variant="icon"><CalendarDaysIcon aria-hidden="true" /></EmptyMedia><EmptyTitle><h3>{filtersActive ? 'No matching seasons' : 'No seasons yet'}</h3></EmptyTitle><EmptyDescription>{filtersActive ? 'Try different filters or create a season.' : 'Create your first season to start organizing teams and games.'}</EmptyDescription></EmptyHeader><EmptyContent><div className="flex flex-wrap justify-center gap-2">{filtersActive && <Button variant="outline" onClick={() => { setSeasonSearch(''); setSeasonStatus(''); setSeasonLeagueFilter(''); setSeasonPageNumber(1); setSeasonPageSize(10) }}>Clear filters</Button>}<DialogTrigger render={<Button />}><PlusIcon data-icon="inline-start" />{filtersActive ? 'Create season' : 'Create your first season'}</DialogTrigger></div></EmptyContent></Empty></CardContent></Card>}
        <DialogContent><DialogHeader><DialogTitle>Create a season</DialogTitle><DialogDescription>Choose a league and add a name and optional dates.</DialogDescription></DialogHeader><Field><FieldLabel htmlFor="create-season-league">League</FieldLabel><Select value={createSeasonLeague || null} onValueChange={(value) => setCreateSeasonLeague(value ?? '')} items={[{ value: null, label: 'Select a league' }, ...(leagues.data ?? []).map((item) => ({ value: item.id, label: item.name }))]}><SelectTrigger id="create-season-league" className="w-full"><SelectValue /></SelectTrigger><SelectContent alignItemWithTrigger={false}><SelectGroup>{leagues.data?.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>{createSeasonLeague && <Editor key={createSeasonLeague} title="Season details" path={`leagues/${createSeasonLeague}/seasons`} fields={dateFields()} transform={seasonData} submitLabel="Create season" alignActions="end" onSaved={() => setCreateSeasonOpen(false)} />}</DialogContent>
      </Dialog>
      <Dialog open={seasonToEdit !== null} onOpenChange={(open) => { if (!open) setSeasonToEdit(null) }}><DialogContent><DialogHeader><DialogTitle>Edit season</DialogTitle><DialogDescription>Update the season name and optional dates.</DialogDescription></DialogHeader>{seasonToEdit && <Editor key={seasonToEdit.id} title="Season details" path={`seasons/${seasonToEdit.id}`} method="PATCH" fields={dateFields(seasonToEdit)} transform={seasonData} alignActions="end" onSaved={() => setSeasonToEdit(null)} onCancel={() => setSeasonToEdit(null)} />}</DialogContent></Dialog>
    </>)}
    {section === 'teams' && (!leagues.data?.length || !league || !season ? <WorkspacePrompt leagueCount={leagues.data?.length ?? 0} leagueSelected={!!league} seasonCount={seasons.data?.length ?? 0} /> : <>
      <Dialog open={createTeamOpen} onOpenChange={(open) => { if (!createTeamPending) setCreateTeamOpen(open) }}>
        {teamRows.length ? <section aria-labelledby="teams-list-title" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex flex-col gap-1"><h3 id="teams-list-title" className="font-medium">Your teams</h3><p className="text-sm text-muted-foreground">{visibleTeamCount} {visibleTeamCount === 1 ? 'team entry' : 'team entries'}{teamFiltersActive ? ' matching your filters' : ' in this season'} · One entry per division</p></div><div className="flex flex-wrap gap-2">{season.status !== 'completed' && <Button variant="outline" onClick={() => setRegisterExistingOpen(true)}>Register existing team</Button>}<DialogTrigger render={<Button />}><PlusIcon data-icon="inline-start" />Create team</DialogTrigger></div></div>
          {teamView === 'table' ? <Card className="gap-0 py-0"><CardContent className="px-0"><Table className="table-fixed"><caption className="sr-only">Teams and their season registrations in this organization</caption><TableHeader className="bg-muted/30"><TableRow><TableHead scope="col" className="pl-5 text-muted-foreground">Team</TableHead><TableHead scope="col" className="hidden text-muted-foreground md:table-cell">League</TableHead><TableHead scope="col" className="hidden text-muted-foreground md:table-cell">Season</TableHead><TableHead scope="col" className="hidden text-muted-foreground md:table-cell">Division</TableHead><TableHead scope="col" className="hidden w-32 text-muted-foreground md:table-cell">Status</TableHead><TableHead scope="col" className="w-28 text-muted-foreground">Roster</TableHead><TableHead scope="col" className="w-14 pr-3 text-right"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>{teamRows.map((team) => {
              const canRegister = (teamSeasons.data ?? []).some((item) => item.league_id === team.league_id && item.status !== 'completed')
              return <TableRow key={team.season_team_id ?? team.id}>
                <TableCell className="max-w-0 py-3 pl-5 whitespace-normal">
                  <span className="break-words font-medium">{team.name}</span>
                  <div className="mt-1 flex flex-col items-start gap-1 md:hidden">
                    <span className="text-xs text-muted-foreground">{team.abbreviation || 'No abbreviation'}</span>
                    <span className="break-words text-xs text-muted-foreground">League: {team.league_name}</span>
                    <span className="break-words text-xs text-muted-foreground">Season: {team.season_name ?? 'Not registered'}</span><span className="break-words text-xs text-muted-foreground">Division: {team.division_name ?? '—'}</span>
                    <Badge variant="secondary">{team.season_team_id ? 'Registered' : 'Not registered'}</Badge>
                  </div>
                  {team.abbreviation && <span className="mt-1 hidden text-xs text-muted-foreground md:block">{team.abbreviation}</span>}
                </TableCell>
                <TableCell className="hidden max-w-0 break-words whitespace-normal text-muted-foreground md:table-cell">{team.league_name}</TableCell>
                <TableCell className="hidden max-w-0 break-words whitespace-normal text-muted-foreground md:table-cell">{team.season_name ?? '—'}</TableCell><TableCell className="hidden max-w-0 break-words whitespace-normal text-muted-foreground md:table-cell">{team.division_name ?? '—'}</TableCell>
                <TableCell className="hidden md:table-cell"><Badge variant="secondary">{team.season_team_id ? 'Registered' : 'Not registered'}</Badge></TableCell>
                <TableCell>{team.season_team_id && team.season_id ? <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/manage/rosters/${team.season_team_id}${teamReturnQuery}`} aria-label={`View ${team.name} roster for ${team.season_name}`} onClick={() => changeWorkspace(team.league_id, team.season_id!, team.division_id ?? undefined)} />}>View roster</Button> : <span className="text-sm text-muted-foreground">—</span>}</TableCell>
                <TableCell className="pr-3 text-right"><TeamActions team={team} canRegister={canRegister} onRegister={() => setTeamToRegister(team)} onEdit={() => setTeamToEdit(team)} onCorrect={season.status === 'draft' && team.season_team_id ? () => setTeamToCorrect(team) : undefined} /></TableCell>
              </TableRow>
            })}</TableBody>
          </Table></CardContent></Card> : <ul aria-label="Teams and their season registrations" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {teamRows.map((team) => {
              const canRegister = (teamSeasons.data ?? []).some((item) => item.league_id === team.league_id && item.status !== 'completed')
              const initials = team.name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join('').toLocaleUpperCase()
              return <li key={team.season_team_id ?? team.id} className="flex min-w-0 flex-col rounded-xl border bg-card p-5 text-card-foreground">
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[#E67145]/10 text-sm font-semibold text-[#A64320] dark:text-[#FFAE88]">{initials}</span>
                  <div className="min-w-0 flex-1"><h4 className="break-words font-semibold leading-snug">{team.name}</h4><p className="mt-1 break-words text-sm text-muted-foreground">{team.league_name}</p></div>
                  <TeamActions team={team} canRegister={canRegister} onRegister={() => setTeamToRegister(team)} onEdit={() => setTeamToEdit(team)} onCorrect={season.status === 'draft' && team.season_team_id ? () => setTeamToCorrect(team) : undefined} />
                </div>
                <div className="mt-5 flex flex-1 flex-col items-start gap-2 text-sm">
                  <Badge variant="secondary">{team.season_team_id ? 'Registered' : 'Not registered'}</Badge>
                  <p className="break-words text-muted-foreground">{team.season_name ?? 'Not registered for a season'}{team.division_name ? ` · ${team.division_name}` : ''}</p>
                </div>
                <div className="mt-5 border-t pt-4">
                  {team.season_team_id && team.season_id ? <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/manage/rosters/${team.season_team_id}${teamReturnQuery}`} aria-label={`View ${team.name} roster for ${team.season_name}`} onClick={() => changeWorkspace(team.league_id, team.season_id!, team.division_id ?? undefined)} />}>View roster</Button> : <span className="text-sm text-muted-foreground">No roster yet</span>}
                </div>
              </li>
            })}
          </ul>}
        </section> : <Card className="mx-auto w-full max-w-3xl"><CardContent><Empty className="px-4 py-10 sm:py-14"><EmptyHeader><EmptyMedia variant="icon"><UsersIcon aria-hidden="true" /></EmptyMedia><EmptyTitle><h3>{teamFiltersActive ? 'No matching teams' : 'No teams in this season'}</h3></EmptyTitle><EmptyDescription>{teamFiltersActive ? 'Try a different search or division.' : 'Register an existing team or create a team to start building rosters for this season.'}</EmptyDescription></EmptyHeader><EmptyContent><div className="flex flex-wrap justify-center gap-2">{teamFiltersActive && <Button variant="outline" onClick={() => { setTeamSearch(''); setDebouncedTeamSearch(''); setTeamDivisionSelection({ id: '', seasonId: teamSeasonFilter }) }}>Clear filters</Button>}{season.status !== 'completed' && <Button variant="outline" onClick={() => setRegisterExistingOpen(true)}>Register existing team</Button>}<DialogTrigger render={<Button />}><PlusIcon data-icon="inline-start" />Create team</DialogTrigger></div></EmptyContent></Empty></CardContent></Card>}
        <DialogContent showCloseButton={!createTeamPending} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"><DialogHeader className="gap-2 pr-8"><DialogTitle className="text-base">Create a team</DialogTitle><DialogDescription>Add a team to a league and register it for a season.</DialogDescription></DialogHeader><CreateTeamForm initialLeagueId={league} initialSeasonId={season?.status === 'completed' ? '' : season?.id ?? ''} initialDivisionId={season.status !== 'completed' ? selectedTeamDivision || (divisions.data?.length === 1 ? divisions.data[0].id : '') : ''} leagues={leagues.data ?? []} onClose={() => setCreateTeamOpen(false)} onCreated={(nextLeague, nextSeason, nextDivision) => { changeWorkspace(nextLeague, nextSeason, nextDivision); if (selectedTeamDivision && (nextSeason !== teamSeasonFilter || nextDivision !== selectedTeamDivision)) setTeamDivisionSelection({ id: '', seasonId: nextSeason }); setTeamSearch(''); setDebouncedTeamSearch(''); setCreateTeamOpen(false) }} onPendingChange={setCreateTeamPending} /></DialogContent>
      </Dialog>
      {registerExistingOpen && <RegisterExistingTeamDialog open onOpenChange={setRegisterExistingOpen} leagueId={league} seasonId={season.id} divisions={divisions.data ?? []} initialDivisionId={selectedTeamDivision} />}
      {teamToCorrect?.season_team_id && teamToCorrect.division_id && <CorrectTeamRegistrationDialog key={teamToCorrect.season_team_id} team={{ id: teamToCorrect.season_team_id, name: teamToCorrect.name, divisionId: teamToCorrect.division_id }} divisions={divisions.data ?? []} onClose={() => setTeamToCorrect(null)} />}
      <Dialog open={teamToEdit !== null} onOpenChange={(open) => { if (!open) setTeamToEdit(null) }}><DialogContent><DialogHeader><DialogTitle>Edit team</DialogTitle><DialogDescription>Update this team’s name and abbreviation.</DialogDescription></DialogHeader>{teamToEdit && <Editor key={teamToEdit.id} title="Team details" path={`teams/${teamToEdit.id}`} method="PATCH" fields={teamFields(teamToEdit)} transform={teamData} alignActions="end" onSaved={() => setTeamToEdit(null)} onCancel={() => setTeamToEdit(null)} />}</DialogContent></Dialog>
      <Dialog open={teamToRegister !== null} onOpenChange={(open) => { if (!open) setTeamToRegister(null) }}><DialogContent><DialogHeader><DialogTitle>Register team for a season</DialogTitle><DialogDescription>Choose a season and an available division for {teamToRegister?.name}.</DialogDescription></DialogHeader>{teamToRegister && <RegisterTeamForm key={teamToRegister.id} team={teamToRegister} organizationId={org} seasons={(teamSeasons.data ?? []).filter((item) => item.league_id === teamToRegister.league_id && item.status !== 'completed')} onClose={() => setTeamToRegister(null)} />}</DialogContent></Dialog>
    </>)}
    {section === 'divisions' && (!league || !season ? <WorkspacePrompt leagueCount={leagues.data?.length ?? 0} leagueSelected={!!league} seasonCount={seasons.data?.length ?? 0} /> : <DivisionsWorkspace key={season.id} season={season} divisions={divisions.data ?? []} />)}
    {section === 'venues' && <VenuesWorkspace key={org} organizationId={org} leagues={leagues.data ?? []} selectedLeagueId={league} />}
    {section === 'standings' && (!league || !season ? <WorkspacePrompt leagueCount={leagues.data?.length ?? 0} leagueSelected={!!league} seasonCount={seasons.data?.length ?? 0} /> : !division ? <NoData>Choose a division to view standings.</NoData> : standings.data?.length ? <StandingsView season={season} division={division} rows={standings.data} /> : <Card className="mx-auto w-full max-w-3xl"><CardContent><Empty className="px-4 py-10 sm:py-14"><EmptyHeader><EmptyMedia variant="icon"><TrophyIcon aria-hidden="true" /></EmptyMedia><EmptyTitle><h3>No teams in this division</h3></EmptyTitle><EmptyDescription>Register teams to see their standings here.</EmptyDescription></EmptyHeader><EmptyContent><Button nativeButton={false} render={<Link href="/manage/teams" />}>Manage teams</Button></EmptyContent></Empty></CardContent></Card>)}
    {section === 'games' && (!league || !season ? <WorkspacePrompt leagueCount={leagues.data?.length ?? 0} leagueSelected={!!league} seasonCount={seasons.data?.length ?? 0} /> : division ? <GamesManager key={`${season.id}-${division.id}`} season={season} division={division} teams={seasonTeams.data ?? []} venues={venues.data ?? []} /> : <NoData>Choose a division to view games.</NoData>)}
    </>}
  </main>
}
