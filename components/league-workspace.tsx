'use client'

import { Fragment, useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format, parseISO, startOfDay } from 'date-fns'
import { CalendarDaysIcon, CalendarPlusIcon, CircleCheckIcon, ClipboardListIcon, ClipboardPenLineIcon, FlagIcon, HistoryIcon, InfoIcon, LayoutGridIcon, ListIcon, MapPinIcon, MoreVerticalIcon, PencilIcon, PlayIcon, PlusIcon, Trash2Icon, TrophyIcon, UsersIcon } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { toast } from 'sonner'
import { CreateLeagueDialog } from '@/components/create-league-dialog'
import { ScheduleGenerator } from '@/components/schedule-generator'
import { GameForfeitDialog } from '@/components/game-forfeit-dialog'
import { GameScheduleHistory } from '@/components/game-schedule-history'
import { VenuesWorkspace } from '@/components/venues-workspace'
import { DivisionsWorkspace } from '@/components/divisions-workspace'
import { SeasonStatusBadge } from '@/components/season-status-badge'
import { DataPagination } from '@/components/data-pagination'
import { requirePaginatedResult } from '@/lib/pagination'
import { leagueRequest } from '@/lib/league-client'
import { joinGameTime, splitGameTime } from '@/lib/game-time'
import { teamListHref, type TeamFilters } from '@/lib/team-filter-links'
import { readTeamView, saveTeamView, subscribeTeamView, availableTeamDivisions } from '@/lib/team-view'
import { useWorkspace } from '@/components/workspace-context'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { RegisterExistingTeamDialog, CorrectTeamRegistrationDialog, RemoveTeamRegistrationDialog } from '@/components/team-registration-dialogs'
import { Separator } from '@/components/ui/separator'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsContent, TabsIndicator, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export type Section = 'dashboard' | 'leagues' | 'seasons' | 'divisions' | 'teams' | 'venues' | 'games' | 'standings'
type Item = { id: string; name: string }
type Season = Item & { status: 'draft' | 'active' | 'completed'; start_date: string | null; end_date: string | null }
type SeasonListItem = Season & { league_name: string }
type Team = Item & { abbreviation: string | null }
type OrganizationTeamRow = Team & { league_id: string; league_name: string; season_team_id: string | null; season_id: string | null; season_name: string | null; season_status: 'draft' | 'active' | 'completed' | null; division_id: string | null; division_name: string | null }
type Division = Item & { season_id: string; min_age: number | null; max_age: number | null }
type SeasonTeam = Item & { team_id: string; division_id: string }
type Game = { id: string; division_id: string; division_name: string; home_name: string; away_name: string; home_season_team_id: string; away_season_team_id: string; scheduled_at: string | null; venue_id: string | null; venue_name: string | null; duration_minutes: number | null; forfeited_by_season_team_id: string | null; status: string; home_score: number | null; away_score: number | null; stage?: 'preliminary' | 'semifinal' | 'final' | 'third_place'; round?: number | null }
type ScheduleStatus = { id: string; name: string; teamCount: number; hasSchedule: boolean; canGeneratePreliminary: boolean; playoffStage: 'semifinal' | 'final' | null; playoffs: boolean; thirdPlace: boolean; preliminaryReason?: string | null; playoffReason?: string | null }
type Standing = Item & { wins: number; losses: number; pointDifference: number }
type Dashboard = { teamCount: number; upcoming: Game[]; recent: Game[]; standings: Standing[] }
type Option = { value: string; label: string }
type InputField = { name: string; label: string; type?: string; required?: boolean; min?: number; max?: number; description?: string; value?: string | number | null; options?: Option[] }

// Why schedule generation is unavailable, with divisions grouped by reason so a shared reason appears once.
function scheduleReason(reason: string, several: boolean): string {
  const text = reason.replace(/^This division /i, '').replace(/^already has /i, several ? 'already have ' : 'already has ').trim()
  return /[.!?]$/.test(text) ? text : text + '.'
}

function generationBlockers(items: { name: string; reason: string }[]) {
  const groups = new Map<string, string[]>()
  for (const item of items) groups.set(item.reason, [...(groups.get(item.reason) ?? []), item.name])
  return <div className="flex flex-col gap-1.5">
    <p className="font-medium">Schedule generation unavailable</p>
    <ul className="flex flex-col gap-1">{[...groups].map(([reason, names]) => <li key={reason}>
      <span className="font-medium">{names.length > 1 && names.length === items.length ? 'All divisions' : names.join(', ')}:</span> {scheduleReason(reason, names.length > 1)}
    </li>)}</ul>
  </div>
}

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
    <FieldLegend variant="label" className="mb-0" required={required}>Time</FieldLegend>
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
          <FieldLabel htmlFor={`${path}-${field.name}`} required={field.required}>Date</FieldLabel>
          <DatePicker key={resetCount} id={`${path}-${field.name}`} name={`${field.name}Date`} label="Date" value={field.value ? String(field.value).slice(0, 10) : ''} required={field.required} disabled={mutation.isPending} invalid={missingDate === field.name} onChange={() => setMissingDate('')} />
          {missingDate === field.name && <p id={`${path}-${field.name}-error`} role="alert" className="text-sm text-destructive">Choose a date for the game.</p>}
        </Field>
        <TimePicker key={resetCount} id={`${path}-${field.name}-time`} name={`${field.name}Time`} value={field.value ? String(field.value).slice(11, 16) : ''} required={field.required} disabled={mutation.isPending} invalid={missingTime === field.name} onChange={() => setMissingTime('')} />
      </Fragment> : <Field key={field.name}>
        <FieldLabel htmlFor={`${path}-${field.name}`} required={field.required}>{field.label}</FieldLabel>
        {field.options ? <Select key={resetCount} name={field.name} defaultValue={field.value ? String(field.value) : null} required={field.required} disabled={mutation.isPending} items={[{ value: null, label: `Select ${field.label.toLowerCase()}` }, ...field.options]}>
          <SelectTrigger id={`${path}-${field.name}`} aria-required={field.required || undefined} aria-invalid={mutation.isError} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent alignItemWithTrigger={false}><SelectGroup>
            {!field.required && <SelectItem value={null}>No {field.label.toLowerCase()} selected</SelectItem>}
            {field.options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectGroup></SelectContent>
        </Select> : field.type === 'date' ? <DatePicker key={resetCount} id={`${path}-${field.name}`} name={field.name} label={field.label} value={field.value} required={field.required} disabled={mutation.isPending} invalid={mutation.isError} /> : <Input id={`${path}-${field.name}`} name={field.name} type={field.type ?? 'text'} defaultValue={field.value ?? ''} required={field.required} min={field.type === 'number' ? field.min ?? 0 : undefined} max={field.max} disabled={mutation.isPending} aria-invalid={mutation.isError} />}
        {field.description && <FieldDescription>{field.description}</FieldDescription>}
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
  return <DropdownMenu><DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`Actions for ${season.name}`} disabled={mutation.isPending} />}><MoreVerticalIcon /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52 max-w-[calc(100vw-2rem)]"><DropdownMenuGroup>
    <DropdownMenuItem className="py-2" onClick={onEdit}><PencilIcon />Edit season</DropdownMenuItem>
    <DropdownMenuItem className="py-2" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{season.status === 'draft' ? <><PlayIcon />Start season</> : <><CircleCheckIcon />Complete season</>}</DropdownMenuItem>
  </DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
}

function TeamActions({ team, roster, onEdit, onRegister, onCorrect, onRemove, canRegister }: { team: Team; roster?: { href: string; onClick: () => void }; onEdit: () => void; onRegister: () => void; onCorrect?: () => void; onRemove?: () => void; canRegister: boolean }) {
  return <DropdownMenu><DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`Actions for ${team.name}`} />}><MoreVerticalIcon /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52 max-w-[calc(100vw-2rem)]"><DropdownMenuGroup>
    {roster && <DropdownMenuItem className="py-2" render={<Link href={roster.href} onClick={roster.onClick} />}><ClipboardListIcon />View roster</DropdownMenuItem>}
    <DropdownMenuItem className="py-2" onClick={onEdit}><PencilIcon />Edit team</DropdownMenuItem>
  </DropdownMenuGroup>{(canRegister || onCorrect) && <><DropdownMenuSeparator /><DropdownMenuGroup>
    {canRegister && <DropdownMenuItem className="py-2" onClick={onRegister}><CalendarPlusIcon />Add to division</DropdownMenuItem>}
    {onCorrect && <DropdownMenuItem className="py-2" onClick={onCorrect}><ClipboardPenLineIcon />Change division</DropdownMenuItem>}
  </DropdownMenuGroup></>}{onRemove && <><DropdownMenuSeparator /><DropdownMenuGroup><DropdownMenuItem variant="destructive" className="py-2" onClick={onRemove}><Trash2Icon />Remove team</DropdownMenuItem></DropdownMenuGroup></>}</DropdownMenuContent></DropdownMenu>
}

function RegisterTeamForm({ team, organizationId, seasonId, onClose }: { team: Team; organizationId: string; seasonId: string; onClose: () => void }) {
  const client = useQueryClient()
  const [divisionId, setDivisionId] = useState('')
  const divisions = useLeagueQuery<Division[]>(`seasons/${seasonId}/divisions`, !!seasonId)
  const registrations = useLeagueQuery<OrganizationTeamRow[]>(`organizations/${organizationId}/teams?seasonId=${seasonId}`, !!seasonId)
  const available = availableTeamDivisions(divisions.data ?? [], registrations.data ?? [], team.id, seasonId)
  const ready = !divisions.isLoading && !registrations.isLoading && !divisions.isError && !registrations.isError
  const registration = useMutation({
    mutationFn: () => leagueRequest(`seasons/${seasonId}/teams`, client, 'POST', { teamId: team.id, divisionId }),
    onSuccess: () => { toast.success(`${team.name} added to the division.`); onClose() },
  })
  return <form onSubmit={(event) => { event.preventDefault(); if (ready && available.some((item) => item.id === divisionId) && !registration.isPending) registration.mutate() }} className="flex flex-col gap-6">
    <Field className="gap-2"><FieldLabel htmlFor="registration-division" required>Division</FieldLabel>
      <Select value={divisionId || null} onValueChange={(value) => { setDivisionId(value ?? ''); registration.reset() }} items={available.map((item) => ({ value: item.id, label: item.name }))} disabled={!ready || !available.length || registration.isPending}>
        <SelectTrigger aria-required="true" id="registration-division" className="w-full"><SelectValue placeholder="Select a division" /></SelectTrigger>
        <SelectContent alignItemWithTrigger={false}><SelectGroup>{available.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
      {divisions.isLoading || registrations.isLoading ? <FieldDescription>Loading divisions…</FieldDescription> : divisions.isError || registrations.isError ? <FieldDescription>Couldn’t load divisions. Close and try again.</FieldDescription> : !available.length ? <FieldDescription>This team is already registered in every division of this season.</FieldDescription> : null}
    </Field>
    {registration.isError && <p role="alert" className="text-sm text-destructive">{registration.error.message}</p>}
    <DialogFooter><Button type="button" variant="outline" disabled={registration.isPending} onClick={onClose}>Cancel</Button><Button type="submit" disabled={!ready || !available.some((item) => item.id === divisionId) || registration.isPending}>{registration.isPending ? 'Adding…' : 'Add to division'}</Button></DialogFooter>
  </form>
}

function CreateTeamForm({ leagueId, season, initialDivisionId, onClose, onCreated, onPendingChange }: { leagueId: string; season: Season; initialDivisionId: string; onClose: () => void; onCreated: (leagueId: string, seasonId: string, divisionIds: string[]) => void; onPendingChange: (pending: boolean) => void }) {
  const client = useQueryClient()
  const seasonId = season.id
  const [divisionIds, setDivisionIds] = useState<string[]>(initialDivisionId ? [initialDivisionId] : [])
  const availableDivisions = useLeagueQuery<Division[]>(`seasons/${seasonId}/divisions`, !!seasonId)
  const validDivisions = divisionIds.length > 0 && divisionIds.every((id) => availableDivisions.data?.some((item) => item.id === id))
  const availableSeasons = useLeagueQuery<Season[]>(`leagues/${leagueId}/seasons`, !!leagueId)
  const chosenSeason = availableSeasons.data?.find((item) => item.id === seasonId && item.status !== 'completed')
  const mutation = useMutation({
    mutationFn: (body: { name: string; abbreviation: string | null; seasonId: string; divisionIds: string[] }) => leagueRequest(`leagues/${leagueId}/teams`, client, 'POST', body),
    onSuccess: (_result, submitted) => { const registeredSeason = availableSeasons.data?.find((item) => item.id === submitted.seasonId); toast.success(`Team created and registered for ${registeredSeason?.name ?? 'the selected season'}.`); onCreated(leagueId, submitted.seasonId, submitted.divisionIds) },
    onSettled: () => onPendingChange(false),
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!chosenSeason || !validDivisions || availableDivisions.isLoading || availableDivisions.isError || availableSeasons.isLoading || availableSeasons.isError || mutation.isPending) return
    const data = new FormData(event.currentTarget)
    onPendingChange(true)
    mutation.mutate({ name: String(data.get('name') ?? '').trim(), abbreviation: optional(String(data.get('abbreviation') ?? '')), seasonId: chosenSeason.id, divisionIds })
  }
  return <form onSubmit={submit} className="flex flex-col gap-5">
    <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,10rem)]">
        <Field className="min-w-0 gap-2">
          <FieldLabel htmlFor="create-team-name" required>Team name</FieldLabel>
          <Input id="create-team-name" name="name" placeholder="e.g. City Hawks" required maxLength={120} disabled={mutation.isPending} />
        </Field>
        <Field className="min-w-0 gap-2">
          <FieldLabel htmlFor="create-team-abbreviation">Abbreviation <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
          <Input id="create-team-abbreviation" name="abbreviation" placeholder="e.g. CH" maxLength={12} disabled={mutation.isPending} />
        </Field>
        <FieldSet className="gap-3 sm:col-span-2" aria-describedby="create-team-divisions-help">
          <FieldLegend variant="label" className="mb-0" required>Divisions</FieldLegend>
          <FieldDescription id="create-team-divisions-help">Choose one or more divisions. Each has its own roster.</FieldDescription>
          {availableDivisions.isLoading ? <FieldDescription>Loading divisions…</FieldDescription> : availableDivisions.isError ? <><FieldDescription>Could not load divisions. Try again.</FieldDescription><Button type="button" size="sm" variant="outline" onClick={() => void availableDivisions.refetch()}>Try again</Button></> : !availableDivisions.data?.length ? <FieldDescription>No divisions are available in this season.</FieldDescription> : <div className="max-h-52 overflow-y-auto rounded-md border divide-y">{availableDivisions.data.map((item) => {
            const selected = divisionIds.includes(item.id)
            const ageRule = item.min_age !== null && item.max_age !== null ? `Ages ${item.min_age}–${item.max_age - 1}` : item.min_age !== null ? `Ages ${item.min_age} and up` : item.max_age !== null ? `Under ${item.max_age}` : 'All ages'
            return <FieldLabel key={item.id} htmlFor={`create-team-division-${item.id}`} className={`flex w-full cursor-pointer items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/50 ${selected ? 'bg-muted/50' : ''}`}>
              <Checkbox id={`create-team-division-${item.id}`} checked={selected} onCheckedChange={(checked) => setDivisionIds((current) => checked ? [...current, item.id] : current.filter((id) => id !== item.id))} disabled={mutation.isPending} />
              <span className="flex min-w-0 flex-1 flex-col gap-1"><span className="break-words">{item.name}</span><span className="text-xs font-normal text-muted-foreground">{ageRule}</span></span>
            </FieldLabel>
          })}</div>}
        </FieldSet>
        <FieldDescription id="create-team-season-description" aria-live="polite" className="empty:hidden sm:col-span-2">{availableSeasons.isLoading ? 'Checking season…' : availableSeasons.isError ? 'Could not load the season. Try again before creating a team.' : !chosenSeason ? 'Teams cannot be added to this season. Select a draft or active season in the header.' : null}</FieldDescription>
        {availableSeasons.isError && <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => void availableSeasons.refetch()}>Try again</Button>}
    </FieldGroup>
    {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
    <Separator />
    <DialogFooter>
      <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>Cancel</Button>
      <Button type="submit" disabled={mutation.isPending || !leagueId || !chosenSeason || !validDivisions || availableDivisions.isLoading || availableDivisions.isError || availableSeasons.isLoading || availableSeasons.isError}>{mutation.isPending ? 'Creating…' : 'Create team'}</Button>
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
const gameStage = (game: Game) => {
  const labels = { preliminary: 'Preliminary', semifinal: 'Semifinal', final: 'Final', third_place: 'Third place' }
  if (!game.stage) return ''
  return `${labels[game.stage] ?? game.stage}${game.round ? ` · Round ${game.round}` : ''}`
}


function GamesList({ games, season, teams, venues }: { games: Game[]; season: Season; teams: SeasonTeam[]; venues: Item[] }) {
  const fields = (game: Game): InputField[] => [
    { name: 'homeTeamId', label: 'Home team', required: true, value: game.home_season_team_id, options: names(teams) },
    { name: 'awayTeamId', label: 'Away team', required: true, value: game.away_season_team_id, options: names(teams) },
    { name: 'scheduledAt', label: 'Date and time', type: 'datetime-local', required: true, value: localInput(game.scheduled_at) },
    { name: 'venueId', label: 'Venue', value: game.venue_id, options: names(venues) },
    { name: 'durationMinutes', label: 'Game duration (minutes)', type: 'number', required: true, min: 1, max: 1440, value: game.duration_minutes ?? 60, description: game.duration_minutes === null ? 'Confirm the game duration for conflict checks.' : undefined },
  ]
  return <div className="flex flex-col gap-4">{games.length === 0 && <NoData>No games to show yet.</NoData>}{games.map((game) => <div key={game.id} className="flex flex-col gap-2 border-b pb-4 last:border-0 last:pb-0">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{game.home_name} <span className="tabular-nums">{game.home_score !== null && game.away_score !== null ? `${game.home_score} – ${game.away_score}` : 'vs'}</span> {game.away_name}</p><Badge variant="secondary" className="capitalize">{game.forfeited_by_season_team_id ? 'Forfeit' : game.status}</Badge></div>
    <p className="text-sm text-muted-foreground">{dateTime(game.scheduled_at)}{game.venue_name ? ` · ${game.venue_name}` : ''}{gameStage(game) ? ` · ${gameStage(game)}` : ''}</p>
    {game.status === 'scheduled' && season.status !== 'completed' && <details><summary className="cursor-pointer text-sm underline">Edit schedule</summary><div className="pt-3"><Editor title="Edit game" path={`games/${game.id}`} method="PATCH" fields={fields(game)} transform={(v) => ({ ...v, scheduledAt: new Date(v.scheduledAt).toISOString(), venueId: optional(v.venueId), durationMinutes: Number(v.durationMinutes) })} /></div></details>}
    {(season.status === 'active' || (season.status === 'completed' && game.status === 'completed')) && <details><summary className="cursor-pointer text-sm underline">{game.status === 'completed' ? 'Correct score' : 'Record final score'}</summary><div className="pt-3">{game.forfeited_by_season_team_id && <p className="mb-3 text-sm text-muted-foreground">Saving a score records a played result instead of a forfeit.</p>}<Editor title="Final score" path={`games/${game.id}/score`} fields={[{ name: 'homeScore', label: `${game.home_name} score`, type: 'number', required: true, value: game.home_score }, { name: 'awayScore', label: `${game.away_name} score`, type: 'number', required: true, value: game.away_score }]} transform={(v) => ({ homeScore: Number(v.homeScore), awayScore: Number(v.awayScore) })} /></div></details>}
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

type GameDialog = { kind: 'schedule' } | { kind: 'generator'; mode: 'preliminary' | 'playoffs' } | { kind: 'edit' | 'score' | 'remove' | 'forfeit' | 'history'; game: Game }

function ScheduleGameForm({ seasonId, divisions, divisionId, onDivisionChange, teams, teamsLoading, teamsError, onRetryTeams, venues, onClose, onSaved, onPendingChange }: {
  seasonId: string; divisions: Division[]; divisionId: string; onDivisionChange: (id: string) => void; teams: SeasonTeam[]; teamsLoading: boolean; teamsError: string | null; onRetryTeams: () => void; venues: Item[]; onClose: () => void; onSaved: () => void; onPendingChange: (pending: boolean) => void
}) {
  const client = useQueryClient()
  const [homeTeam, setHomeTeam] = useState('')
  const [awayTeam, setAwayTeam] = useState('')
  const [venue, setVenue] = useState('')
  const [error, setError] = useState('')
  const [missingDate, setMissingDate] = useState(false)
  const [missingTime, setMissingTime] = useState(false)
  const mutation = useMutation({ mutationFn: (body: object) => leagueRequest(`seasons/${seasonId}/games`, client, 'POST', body), onSuccess: onSaved, onSettled: () => onPendingChange(false) })
  const teamOptions = names(teams)
  const teamsDisabled = mutation.isPending || !divisionId || teamsLoading || !!teamsError || teams.length < 2

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!divisionId) { setError('Choose a division before scheduling a game.'); return }
    if (teamsLoading || teamsError || teams.length < 2) { setError('At least two registered teams must be available in this division.'); return }
    if (!teams.some((team) => team.id === homeTeam) || !teams.some((team) => team.id === awayTeam)) { setError('Choose a home team and an away team.'); return }
    if (homeTeam === awayTeam) { setError('Choose two different teams.'); return }
    const values = new FormData(event.currentTarget)
    const date = String(values.get('gameDate') ?? '')
    const time = String(values.get('gameTime') ?? '')
    if (!date) { setMissingDate(true); document.getElementById('schedule-game-date')?.focus(); return }
    if (!time) { setMissingTime(true); document.getElementById('schedule-game-time-hour')?.focus(); return }
    const scheduledAt = new Date(`${date}T${time}`)
    if (!Number.isFinite(scheduledAt.getTime())) { setError('Choose a valid date and time.'); return }
    try {
      onPendingChange(true)
      await mutation.mutateAsync({ homeTeamId: homeTeam, awayTeamId: awayTeam, scheduledAt: scheduledAt.toISOString(), venueId: optional(venue) })
    } catch { onPendingChange(false) }
  }

  return <form onSubmit={submit} className="flex flex-col gap-5">
    <FieldGroup className="gap-4">
      <Field><FieldLabel htmlFor="game-division" required>Division</FieldLabel>
        <Select value={divisionId || null} onValueChange={(value) => { if ((value ?? '') !== divisionId) { setHomeTeam(''); setAwayTeam(''); setError(''); onDivisionChange(value ?? '') } }} disabled={mutation.isPending} items={divisions.map((item) => ({ value: item.id, label: item.name }))}>
          <SelectTrigger id="game-division" className="w-full" aria-required="true"><SelectValue placeholder="Select a division" /></SelectTrigger>
          <SelectContent alignItemWithTrigger={false}><SelectGroup>{divisions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">{[{ id: 'home', label: 'Home team', value: homeTeam, set: setHomeTeam }, { id: 'away', label: 'Away team', value: awayTeam, set: setAwayTeam }].map((field) => <Field key={field.id}>
        <FieldLabel htmlFor={`schedule-game-${field.id}`} required>{field.label}</FieldLabel>
        <Select value={field.value || null} disabled={teamsDisabled} items={teamOptions} onValueChange={(value) => { field.set(value ?? ''); setError('') }}>
          <SelectTrigger id={`schedule-game-${field.id}`} className="w-full" aria-required="true"><SelectValue placeholder={!divisionId ? 'Select a division first' : teamsLoading ? 'Loading teams…' : 'Select a team'} /></SelectTrigger>
          <SelectContent alignItemWithTrigger={false}><SelectGroup>{teamOptions.map((team) => <SelectItem key={team.value} value={team.value}>{team.label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>)}</div>
      {!divisionId && <FieldDescription>Select a division to choose its teams.</FieldDescription>}
      {divisionId && teamsLoading && <p className="text-sm text-muted-foreground" role="status">Loading teams…</p>}
      {divisionId && teamsError && <Alert variant="destructive"><AlertTitle>Couldn’t load teams</AlertTitle><AlertDescription>{teamsError} <Button type="button" variant="link" size="sm" onClick={onRetryTeams}>Try again</Button></AlertDescription></Alert>}
      {divisionId && !teamsLoading && !teamsError && teams.length < 2 && <p className="text-sm text-muted-foreground">Register at least two teams in this division before scheduling a game.</p>}
      <div className="grid gap-4">
        <Field data-invalid={missingDate || undefined}><FieldLabel htmlFor="schedule-game-date" required>Date</FieldLabel>
          <DatePicker id="schedule-game-date" name="gameDate" label="Date" required disabled={mutation.isPending} invalid={missingDate} onChange={() => setMissingDate(false)} />
          {missingDate && <p id="schedule-game-date-error" role="alert" className="text-sm text-destructive">Choose a date for the game.</p>}
        </Field>
        <TimePicker id="schedule-game-time" name="gameTime" value="" required disabled={mutation.isPending} invalid={missingTime} onChange={() => setMissingTime(false)} />
      </div>
      <Field><FieldLabel htmlFor="schedule-game-venue">Venue</FieldLabel>
        <Select value={venue || null} disabled={mutation.isPending} onValueChange={(value) => setVenue(value ?? '')} items={[{ value: null, label: 'No venue selected' }, ...names(venues)]}>
          <SelectTrigger id="schedule-game-venue" className="w-full"><SelectValue placeholder="Select a venue (optional)" /></SelectTrigger>
          <SelectContent alignItemWithTrigger={false}><SelectGroup><SelectItem value={null}>No venue selected</SelectItem>{venues.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>
    </FieldGroup>
    {(error || mutation.isError) && <p role="alert" className="text-sm text-destructive">{error || mutation.error?.message}</p>}
    <DialogFooter><Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>Cancel</Button><Button type="submit" disabled={mutation.isPending || teamsLoading}>{mutation.isPending ? 'Scheduling…' : 'Schedule game'}</Button></DialogFooter>
  </form>
}

function GamesManager({ season, divisions, venues }: { season: Season; divisions: Division[]; venues: Item[] }) {
  const [dialog, setDialog] = useState<GameDialog | null>(null)
  const [pending, setPending] = useState(false)
  const [divisionFilter, setDivisionFilter] = useState('')
  const [scheduleDivision, setScheduleDivision] = useState('')
  const [status, setStatus] = useState('scheduled')
  const [dates, setDates] = useState<DateRange | undefined>()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const client = useQueryClient()
  const gamesPath = (tab: string, tabPage: number, tabPageSize: number) => {
    const params = new URLSearchParams({ page: String(tabPage), pageSize: String(tabPageSize), sort: tab === 'completed' ? 'desc' : 'asc', status: tab })
    if (divisionFilter) params.set('divisionId', divisionFilter)
    else params.set('scope', 'season')
    if (dates?.from) params.set('from', startOfDay(dates.from).toISOString())
    if (dates?.to) params.set('to', startOfDay(addDays(dates.to, 1)).toISOString())
    return `seasons/${season.id}/games?${params}`
  }
  const gamesQuery = (gamePath: string) => ({ queryKey: ['league', gamePath], queryFn: async () => requirePaginatedResult<Game>(await leagueRequest<unknown>(gamePath, client)), retry: false })
  const path = gamesPath(status, page, pageSize)
  const games = useQuery(gamesQuery(path))
  // Load the other tab's first page in the background so switching tabs shows games right away.
  const otherTabPath = gamesPath(status === 'completed' ? 'scheduled' : 'completed', 1, 10)
  useEffect(() => { void client.prefetchQuery({ ...gamesQuery(otherTabPath), staleTime: 30_000 }) }, [otherTabPath]) // eslint-disable-line react-hooks/exhaustive-deps
  const scheduleStatus = useLeagueQuery<{ divisions: ScheduleStatus[] }>(`seasons/${season.id}/schedule/status`)
  const scheduleDivisions = scheduleStatus.data?.divisions ?? []
  const teamDivision = dialog?.kind === 'edit' ? dialog.game.division_id : dialog?.kind === 'schedule' ? scheduleDivision : ''
  const registrations = useLeagueQuery<SeasonTeam[]>(`seasons/${season.id}/teams?divisionId=${encodeURIComponent(teamDivision)}`, !!teamDivision)
  const teams = registrations.data ?? []
  const openSchedule = () => { setScheduleDivision(divisionFilter); setDialog({ kind: 'schedule' }) }
  const removeGame = useMutation({
    mutationFn: (id: string) => leagueRequest(`games/${id}`, client, 'DELETE'),
    onSuccess: () => { setDialog(null); setPage(1); toast.success('Game removed.') },
  })
  const [confirmStart, setConfirmStart] = useState(false)
  const startSeason = useMutation({
    mutationFn: () => leagueRequest(`seasons/${season.id}/status`, client, 'POST', { status: 'active' }),
    onSuccess: () => { setConfirmStart(false); toast.success('Season started.') },
    onError: (error) => toast.error(error.message),
  })
  const seasonHint = season.status === 'draft' ? 'Scores can be recorded after the season starts.' : season.status === 'completed' ? 'Scheduling is closed. Final scores can still be corrected.' : ''
  const resetPage = () => { setPage(1); setPageSize(10) }
  const clearDates = () => { setDates(undefined); resetPage() }
  const editable = season.status !== 'completed'
  const game = dialog && 'game' in dialog ? dialog.game : undefined
  const gameFields: InputField[] = [
    { name: 'homeTeamId', label: 'Home team', required: true, value: game?.home_season_team_id, options: names(teams) },
    { name: 'awayTeamId', label: 'Away team', required: true, value: game?.away_season_team_id, options: names(teams) },
    { name: 'scheduledAt', label: 'Date and time', type: 'datetime-local', required: true, value: localInput(game?.scheduled_at ?? null) },
    { name: 'venueId', label: 'Venue', value: game?.venue_id, options: names(venues) },
    ...(dialog?.kind === 'edit' ? [{ name: 'durationMinutes', label: 'Game duration (minutes)', type: 'number', required: true, min: 1, max: 1440, value: game?.duration_minutes ?? 60, description: game?.duration_minutes == null ? 'No duration was recorded for this game. Check the duration to detect schedule conflicts.' : 'Used to check for team and venue conflicts.' }] : []),
  ]
  const closeDialog = () => { setDialog(null); setPending(false); removeGame.reset() }
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
          const canForfeit = (row.status === 'scheduled' && season.status === 'active') || (!!row.forfeited_by_season_team_id && row.status === 'completed' && (season.status === 'active' || season.status === 'completed'))
          return <TableRow key={row.id}>
            <TableCell className="w-24 py-4 font-medium tabular-nums sm:w-28">{row.scheduled_at ? new Date(row.scheduled_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—'}</TableCell>
            <TableCell className="max-w-0 whitespace-normal"><span className="break-words font-medium">{row.home_name} <span className="font-normal text-muted-foreground">vs</span> {row.away_name}</span>{row.home_score !== null && row.away_score !== null && <span className="ml-2 font-semibold tabular-nums">{row.home_score} – {row.away_score}</span>}{row.forfeited_by_season_team_id && <Badge variant="secondary" className="ml-2 lg:hidden">Forfeit</Badge>}<div className="mt-1 text-xs text-muted-foreground">{row.division_name}{gameStage(row) ? ` · ${gameStage(row)}` : ''}</div><div className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground md:hidden"><span>{row.venue_name ?? 'No venue'}</span></div></TableCell>
            <TableCell className="hidden w-48 max-w-0 whitespace-normal text-muted-foreground md:table-cell">{row.venue_name ? <span className="flex items-center gap-1.5 break-words"><MapPinIcon aria-hidden="true" className="size-4 shrink-0" />{row.venue_name}</span> : '—'}</TableCell>
            <TableCell className="hidden w-32 lg:table-cell"><Badge variant={row.status === 'completed' ? 'seasonActive' : 'gameScheduled'}>{row.forfeited_by_season_team_id ? 'Forfeit' : row.status === 'completed' ? 'Final result' : 'Scheduled'}</Badge></TableCell>
            <TableCell className="pr-3 text-right"><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.home_name} vs ${row.away_name}`} />}><MoreVerticalIcon /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52 max-w-[calc(100vw-2rem)]"><DropdownMenuGroup>
              {canEdit && <DropdownMenuItem className="whitespace-nowrap py-2" onClick={() => setDialog({ kind: 'edit', game: row })}><PencilIcon />Edit schedule</DropdownMenuItem>}
              {canScore && <DropdownMenuItem className="whitespace-nowrap py-2" onClick={() => setDialog({ kind: 'score', game: row })}><CircleCheckIcon />{row.status === 'completed' ? 'Correct score' : 'Record final score'}</DropdownMenuItem>}
              {editable && season.status === 'draft' && row.status === 'scheduled' && <DropdownMenuItem disabled className="items-start py-2"><CircleCheckIcon className="mt-0.5" /><span className="flex flex-col gap-0.5"><span>Record final score</span><span className="text-xs text-muted-foreground">Start the season first</span></span></DropdownMenuItem>}
              {canForfeit && <DropdownMenuItem className="whitespace-nowrap py-2" onClick={() => setDialog({ kind: 'forfeit', game: row })}><FlagIcon />{row.forfeited_by_season_team_id ? 'Correct forfeit' : 'Mark as forfeit'}</DropdownMenuItem>}
              <DropdownMenuItem className="whitespace-nowrap py-2" onClick={() => setDialog({ kind: 'history', game: row })}><HistoryIcon />Schedule history</DropdownMenuItem>
            </DropdownMenuGroup>{canEdit && <><DropdownMenuSeparator /><DropdownMenuGroup><DropdownMenuItem variant="destructive" className="whitespace-nowrap py-2" onClick={() => { removeGame.reset(); setDialog({ kind: 'remove', game: row }) }}><Trash2Icon />Remove game</DropdownMenuItem></DropdownMenuGroup></>}</DropdownMenuContent></DropdownMenu></TableCell>
          </TableRow>
        })}</TableBody>
      </Table>
    </div>
  </section>)}<DataPagination meta={games.data} onPageChange={setPage} onPageSizeChange={(size) => { setPage(1); setPageSize(size) }} /></div> : <Card><CardContent><Empty className="px-4 py-10"><EmptyHeader><EmptyMedia variant="icon"><CalendarDaysIcon aria-hidden="true" /></EmptyMedia><EmptyTitle><h3>{dates?.from ? 'No games in this date range' : status === 'completed' ? 'No final results yet' : 'No scheduled games'}</h3></EmptyTitle><EmptyDescription>{dates?.from ? 'Choose different dates to see more games.' : status === 'completed' ? 'Final scores will appear here once recorded.' : editable ? 'Schedule a matchup for this season.' : 'No scheduled games are available for this season.'}</EmptyDescription></EmptyHeader><EmptyContent><div className="flex flex-wrap justify-center gap-2">{dates?.from && <Button variant="outline" onClick={clearDates}>Clear dates</Button>}{status === 'scheduled' && editable && divisions.length > 0 && <Button onClick={openSchedule}><PlusIcon data-icon="inline-start" />Schedule game</Button>}</div></EmptyContent></Empty></CardContent></Card>
  return <div className="flex flex-col gap-8">
    {editable && scheduleStatus.isError && <Alert variant="destructive"><AlertTitle>Couldn’t load schedule status</AlertTitle><AlertDescription><p>{scheduleStatus.error.message}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void scheduleStatus.refetch()}>Try again</Button></AlertDescription></Alert>}
    {editable && scheduleStatus.isSuccess && !scheduleDivisions.some((item) => item.teamCount >= 2) && <Alert><AlertTitle>Register teams to schedule games</AlertTitle><AlertDescription><p>Add at least two teams to a division before scheduling a matchup.</p><Button variant="outline" size="sm" className="mt-3" nativeButton={false} render={<Link href="/manage/teams" />}>Manage teams</Button></AlertDescription></Alert>}
    <Tabs value={status} onValueChange={(value) => { if (typeof value === 'string') { setStatus(value); resetPage() } }}>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <TabsList className="relative"><TabsIndicator /><TabsTrigger value="scheduled" className="z-[1] data-active:bg-transparent group-data-[variant=default]/tabs-list:data-active:shadow-none dark:data-active:border-transparent dark:data-active:bg-transparent">Scheduled</TabsTrigger><TabsTrigger value="completed" className="z-[1] data-active:bg-transparent group-data-[variant=default]/tabs-list:data-active:shadow-none dark:data-active:border-transparent dark:data-active:bg-transparent">Final results</TabsTrigger></TabsList>
          {seasonHint ? <Tooltip>
            <TooltipTrigger render={<span tabIndex={0} aria-label={`${season.status === 'draft' ? 'Draft' : 'Completed'} season. ${seasonHint}`} className="inline-flex rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />}><SeasonStatusBadge status={season.status} includeSeason /></TooltipTrigger>
            <TooltipContent side="bottom" align="start">{seasonHint}</TooltipContent>
          </Tooltip> : <SeasonStatusBadge status={season.status} includeSeason />}
          {editable && season.status === 'draft' && <Button type="button" variant="ghost" size="sm" disabled={startSeason.isPending} onClick={() => { startSeason.reset(); setConfirmStart(true) }}><PlayIcon data-icon="inline-start" />Start season</Button>}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Choice label="Division" value={divisionFilter} options={divisions} emptyLabel="All divisions" onChange={(value) => { setDivisionFilter(value); setPage(1) }} />
          <Popover><PopoverTrigger render={<Button id="game-dates" type="button" variant="outline" aria-label="Filter games by date range" className="justify-start font-normal" />}><CalendarDaysIcon data-icon="inline-start" />{dates?.from ? dates.to ? `${format(dates.from, 'MMM d')} – ${format(dates.to, 'MMM d, yyyy')}` : `From ${format(dates.from, 'MMM d, yyyy')}` : 'All dates'}</PopoverTrigger><PopoverContent align="end" className="w-auto p-0"><Calendar mode="range" selected={dates} onSelect={(value) => { setDates(value); resetPage() }} autoFocus />{dates?.from && <Button type="button" variant="ghost" className="mx-3 mb-3" onClick={clearDates}>Clear dates</Button>}</PopoverContent></Popover>
          <Button type="button" variant="outline" disabled={!dates?.from} onClick={clearDates}>Reset</Button>
          {editable && <>
            {(() => {
              const generate = <Button variant="outline" nativeButton={false} render={<Link href="/manage/games/generate" />} className="data-disabled:pointer-events-none data-disabled:opacity-50" disabled={!scheduleStatus.isSuccess || scheduleStatus.isFetching || !scheduleDivisions.some((item) => item.canGeneratePreliminary)}><CalendarDaysIcon data-icon="inline-start" />Generate schedule</Button>
              // A disabled control receives no hover events, so a focusable wrapper explains why generation is unavailable.
              if (!scheduleStatus.isSuccess || !scheduleDivisions.length || scheduleDivisions.some((item) => item.canGeneratePreliminary)) return generate
              return <Tooltip>
                <TooltipTrigger render={<span tabIndex={0} aria-label="Generate schedule is unavailable" className="inline-flex cursor-not-allowed rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />}>{generate}</TooltipTrigger>
                <TooltipContent side="bottom" align="start" className="block max-w-sm px-3 py-2.5 text-left leading-relaxed">{generationBlockers(scheduleDivisions.map((item) => ({ name: item.name, reason: item.preliminaryReason || 'Not eligible for schedule generation.' })))}</TooltipContent>
              </Tooltip>
            })()}
            {scheduleDivisions.some((item) => item.playoffs) && <Button variant="outline" onClick={() => setDialog({ kind: 'generator', mode: 'playoffs' })} disabled={!scheduleStatus.isSuccess || scheduleStatus.isFetching || !scheduleDivisions.some((item) => item.playoffStage)}><TrophyIcon data-icon="inline-start" />Schedule playoffs</Button>}
            <Button onClick={openSchedule} disabled={!divisions.length}><PlusIcon data-icon="inline-start" />Schedule game</Button>
          </>}
        </div>
      </div>
      <TabsContent value={status} className="pt-5"><div key={status} className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out motion-reduce:animate-none">{games.isLoading ? <LoadingContent /> : games.isError ? <Alert variant="destructive"><AlertTitle>Couldn’t load games</AlertTitle><AlertDescription><p>{games.error.message}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void games.refetch()}>Try again</Button></AlertDescription></Alert> : gameAgenda}</div></TabsContent>
    </Tabs>
    <Dialog open={confirmStart} onOpenChange={(open) => { if (!startSeason.isPending) setConfirmStart(open) }}>
      <DialogContent showCloseButton={!startSeason.isPending} className="sm:max-w-md">
        <DialogHeader><DialogTitle>Start {season.name}?</DialogTitle><DialogDescription>Final scores can be recorded once the season starts. Team registrations can no longer be corrected or removed.</DialogDescription></DialogHeader>
        <DialogFooter><Button type="button" variant="outline" disabled={startSeason.isPending} onClick={() => setConfirmStart(false)}>Cancel</Button><Button type="button" disabled={startSeason.isPending} onClick={() => startSeason.mutate()}>{startSeason.isPending ? 'Starting…' : 'Start season'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open && !pending && !removeGame.isPending) closeDialog() }}><DialogContent showCloseButton={!pending && !removeGame.isPending} className={dialog?.kind === 'generator' ? 'flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl' : 'max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg'}>{dialog?.kind !== 'generator' && dialog?.kind !== 'forfeit' && dialog?.kind !== 'history' && <DialogHeader><DialogTitle>{dialog?.kind === 'schedule' ? 'Schedule a game' : dialog?.kind === 'edit' ? 'Edit schedule' : dialog?.kind === 'remove' ? 'Remove game?' : game?.status === 'completed' ? 'Correct final score' : 'Record final score'}</DialogTitle><DialogDescription>{dialog?.kind === 'remove' ? `Remove ${game?.home_name} vs ${game?.away_name}? Only unplayed games can be removed.` : dialog?.kind === 'score' ? `${game?.home_name} vs ${game?.away_name} · ${season.name}${game?.forfeited_by_season_team_id ? '. Saving a score records a played result instead of a forfeit.' : ''}` : 'Choose a division and two teams, then enter the local date and time.'}</DialogDescription></DialogHeader>}
      {dialog?.kind === 'generator' && <ScheduleGenerator seasonId={season.id} seasonName={season.name} seasonStart={season.start_date} seasonEnd={season.end_date} venues={venues} mode={dialog.mode} onClose={closeDialog} onSaved={() => saved('Schedule saved.')} onPendingChange={setPending} />}
      {dialog?.kind === 'forfeit' && <GameForfeitDialog game={dialog.game} onClose={closeDialog} onSaved={() => saved('Forfeit recorded.')} onPendingChange={setPending} />}
      {dialog?.kind === 'history' && <GameScheduleHistory gameId={dialog.game.id} />}
      {dialog?.kind === 'remove' && <><p className="text-sm text-muted-foreground">This removes the game from the schedule. Games with dependent playoff games or records may be blocked.</p>{removeGame.isError && <p role="alert" className="text-sm text-destructive">{removeGame.error.message}</p>}<DialogFooter><Button type="button" variant="outline" disabled={removeGame.isPending} onClick={closeDialog}>Cancel</Button><Button type="button" variant="destructive" disabled={removeGame.isPending} onClick={() => removeGame.mutate(dialog.game.id)}>{removeGame.isPending ? 'Removing…' : 'Remove game'}</Button></DialogFooter></>}
      {dialog?.kind === 'schedule' && <ScheduleGameForm seasonId={season.id} divisions={divisions} divisionId={scheduleDivision} onDivisionChange={setScheduleDivision} teams={teams} teamsLoading={!!scheduleDivision && registrations.isFetching} teamsError={registrations.isError ? registrations.error.message : null} onRetryTeams={() => void registrations.refetch()} venues={venues} onClose={closeDialog} onSaved={() => saved('Game scheduled.')} onPendingChange={setPending} />}
      {dialog?.kind === 'edit' && teamDivision && (registrations.isLoading ? <p>Loading teams…</p> : registrations.isError ? <Alert variant="destructive"><AlertTitle>Couldn’t load teams</AlertTitle><AlertDescription><p>{registrations.error.message}</p><Button variant="outline" size="sm" onClick={() => void registrations.refetch()}>Try again</Button></AlertDescription></Alert> : teams.length < 2 ? <p className="text-sm text-muted-foreground">Register at least two teams in this division to schedule a game.</p> : <Editor key={`${dialog.kind}-${teamDivision}-${game?.id ?? ''}`} title="Game details" path={`games/${dialog.game.id}`} method="PATCH" fields={gameFields} transform={(v) => ({ ...v, scheduledAt: new Date(v.scheduledAt).toISOString(), venueId: optional(v.venueId), durationMinutes: Number(v.durationMinutes) })} submitLabel="Save changes" alignActions="end" onSaved={() => saved('Schedule updated.')} onCancel={closeDialog} onPendingChange={setPending} />)}
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
  const teamPageScope = JSON.stringify([org, league, teamSeasonFilter, selectedTeamDivision])
  const [teamPagination, setTeamPagination] = useState({ scope: teamPageScope, page: 1, pageSize: 10 })
  const teamPage = teamPagination.scope === teamPageScope ? teamPagination.page : 1
  const setTeamPage = (page: number) => setTeamPagination((current) => ({ ...current, scope: teamPageScope, page }))
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
  const teamFilters = new URLSearchParams()
  if (teamLeagueFilter) teamFilters.set('leagueId', teamLeagueFilter)
  if (teamSeasonFilter) teamFilters.set('seasonId', teamSeasonFilter)
  if (selectedTeamDivision) teamFilters.set('divisionId', selectedTeamDivision)
  if (debouncedTeamSearch) teamFilters.set('search', debouncedTeamSearch)
  teamFilters.set('page', String(teamPage))
  teamFilters.set('pageSize', String(teamPagination.pageSize))
  const teamSearchPending = section === 'teams' && teamSearch.trim() !== debouncedTeamSearch
  const teamPagePath = `organizations/${org}/teams?${teamFilters}`
  const organizationTeams = useQuery({ queryKey: ['league', teamPagePath], queryFn: async () => requirePaginatedResult<OrganizationTeamRow>(await leagueRequest<unknown>(teamPagePath, queryClient)), enabled: !!org && section === 'teams' && !teamSearchPending && !!league && !!season && divisions.isSuccess, retry: false })
  // Sync the requested page with workspace changes and server-side clamping after data changes.
  useEffect(() => {
    if (teamPagination.scope !== teamPageScope) {
      // A changed scope must also update state so returning to the old scope cannot restore its page.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTeamPagination((current) => ({ ...current, scope: teamPageScope, page: 1 }))
    } else if (!teamSearchPending && !organizationTeams.isFetching && organizationTeams.data && organizationTeams.data.page !== teamPage) {
      // The server may clamp a page after a registration is removed.
      setTeamPagination((current) => current.scope === teamPageScope && current.page === teamPage ? { ...current, page: organizationTeams.data!.page } : current)
    }
  }, [teamPageScope, teamPagination.scope, teamPage, teamSearchPending, organizationTeams.data, organizationTeams.isFetching])
  const teamRows = organizationTeams.data?.items ?? []
  const teamFiltersActive = !!teamSearch.trim() || !!selectedTeamDivision
  const teamReturnQuery = teamListHref({ search: teamSearch, leagueId: '', seasonId: '', divisionId: selectedTeamDivision }).slice('/manage/teams'.length)
  const rosterAction = (team: OrganizationTeamRow) => {
    if (!team.season_team_id || !team.season_id) return undefined
    const seasonId = team.season_id
    return { href: `/manage/rosters/${team.season_team_id}${teamReturnQuery}`, onClick: () => changeWorkspace(team.league_id, seasonId, team.division_id ?? undefined) }
  }
  const seasonTeams = useLeagueQuery<SeasonTeam[]>(`seasons/${season?.id}/teams?divisionId=${encodeURIComponent(division?.id ?? '')}`, !!season && !!division && section === 'dashboard')
  const venues = useLeagueQuery<Item[]>(`leagues/${league}/venues`, !!league && ['dashboard', 'games'].includes(section))
  const dashboard = useLeagueQuery<Dashboard>(`seasons/${season?.id}/dashboard?divisionId=${encodeURIComponent(division?.id ?? '')}`, !!season && !!division && section === 'dashboard')
  const standings = useLeagueQuery<Standing[]>(`seasons/${season?.id}/standings?divisionId=${encodeURIComponent(division?.id ?? '')}`, !!season && !!division && section === 'standings')
  const [editing, setEditing] = useState('')
  const [seasonToEdit, setSeasonToEdit] = useState<Season | null>(null)
  const [createSeasonOpen, setCreateSeasonOpen] = useState(false)
  const [createTeamOpen, setCreateTeamOpen] = useState(false)
  const [createTeamPending, setCreateTeamPending] = useState(false)
  const [teamToEdit, setTeamToEdit] = useState<Team | null>(null)
  const [teamToRegister, setTeamToRegister] = useState<OrganizationTeamRow | null>(null)
  const [registerExistingOpen, setRegisterExistingOpen] = useState(false)
  const [teamToCorrect, setTeamToCorrect] = useState<OrganizationTeamRow | null>(null)
  const [teamToRemove, setTeamToRemove] = useState<OrganizationTeamRow | null>(null)
  const relevantQueries = [leagues, ...(section === 'seasons' ? [seasonPage] : ['dashboard', 'games', 'standings', 'teams', 'divisions'].includes(section) ? [seasons, divisions] : []), ...(section === 'teams' ? [organizationTeams] : []), ...(section === 'games' ? [venues] : []), ...(section === 'dashboard' ? [seasonTeams, venues, dashboard] : []), ...(section === 'standings' ? [standings] : [])]
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2"><h2 className="text-2xl font-semibold tracking-tight">{pageCopy[section].title}</h2><p className="text-sm text-muted-foreground">{pageCopy[section].description}</p></div>
        {section === 'teams' && league && season && !loading && !failedQuery && <div className="flex flex-wrap gap-2">{season.status !== 'completed' && <Button variant="outline" onClick={() => setRegisterExistingOpen(true)}>Register existing team</Button>}<Button onClick={() => setCreateTeamOpen(true)}><PlusIcon data-icon="inline-start" />Create team</Button></div>}
      </div>
      {section === 'seasons' ? <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <Field className="w-full sm:w-64"><FieldLabel htmlFor="season-search">Search seasons</FieldLabel><Input id="season-search" type="search" placeholder="Search by name" maxLength={120} value={seasonSearch} onChange={(event) => { setSeasonPageNumber(1); setSeasonPageSize(10); setSeasonSearch(event.target.value) }} /></Field>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <Choice label="League" value={selectedSeasonLeague} options={leagues.data ?? []} emptyLabel="All Leagues" onChange={(v) => { setSeasonPageNumber(1); setSeasonPageSize(10); setSeasonLeagueFilter(v) }} />
        <Field className="w-full sm:w-52"><FieldLabel htmlFor="season-status">Status</FieldLabel><Select value={seasonStatus || null} onValueChange={(value) => { setSeasonPageNumber(1); setSeasonPageSize(10); setSeasonStatus(value ?? '') }} items={[{ value: null, label: 'All statuses' }, { value: 'draft', label: 'Draft' }, { value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }]}><SelectTrigger id="season-status" className="w-full"><SelectValue /></SelectTrigger><SelectContent alignItemWithTrigger={false}><SelectGroup><SelectItem value={null}>All statuses</SelectItem><SelectItem value="draft">Draft</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="completed">Completed</SelectItem></SelectGroup></SelectContent></Select></Field>
        </div>
      </div> : section === 'teams' ? <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end"><Field className="w-full sm:w-64"><FieldLabel htmlFor="team-search">Search teams</FieldLabel><Input id="team-search" type="search" placeholder="Search by team name" maxLength={120} value={teamSearch} onChange={(event) => { setTeamPage(1); setTeamSearch(event.target.value) }} /></Field><Choice label="Division" value={selectedTeamDivision} options={divisions.data ?? []} emptyLabel="All divisions" onChange={(value) => { setTeamPage(1); setTeamDivisionSelection({ id: value, seasonId: teamSeasonFilter }) }} /></div>
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Teams display" className="inline-flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
            <Button type="button" size="icon-sm" variant={teamView === 'table' ? 'secondary' : 'ghost'} aria-label="Table view" aria-pressed={teamView === 'table'} title="Table view" onClick={() => saveTeamView('table')}><ListIcon aria-hidden="true" /></Button>
            <Button type="button" size="icon-sm" variant={teamView === 'cards' ? 'secondary' : 'ghost'} aria-label="Card view" aria-pressed={teamView === 'cards'} title="Card view" onClick={() => saveTeamView('cards')}><LayoutGridIcon aria-hidden="true" /></Button>
          </div>
        </div>
      </div> : null}
      {['dashboard', 'standings'].includes(section) && season && <div className="flex flex-wrap items-end justify-between gap-4"><Field className="w-full sm:w-56"><FieldLabel htmlFor="page-division">Division</FieldLabel><Select value={division?.id ?? null} onValueChange={(value) => { if (value) changeDivision(value) }} items={(divisions.data ?? []).map((item) => ({ value: item.id, label: item.name }))} disabled={!divisions.data?.length}><SelectTrigger id="page-division" className="w-full"><SelectValue placeholder={divisions.isLoading ? 'Loading divisions…' : divisions.isError ? 'Divisions unavailable' : divisions.data?.length ? 'Choose division' : 'No divisions'} /></SelectTrigger><SelectContent alignItemWithTrigger={false}><SelectGroup>{divisions.data?.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>{section === 'standings' && <Button nativeButton={false} variant="outline" render={<Link href="/manage/games" />}><CalendarDaysIcon data-icon="inline-start" />View games</Button>}</div>}
    </div>
    {failedQuery ? <Alert variant="destructive"><AlertTitle>Couldn’t load this page</AlertTitle><AlertDescription><p>{failedQuery.error?.message}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void failedQuery.refetch()}>Try again</Button></AlertDescription></Alert> : loading ? <LoadingContent /> : <>
    {section === 'dashboard' && <>
      {!league || !season ? <WorkspacePrompt leagueCount={leagues.data?.length ?? 0} leagueSelected={!!league} seasonCount={seasons.data?.length ?? 0} /> : !division ? <NoData>Choose a division to view the dashboard.</NoData> : <>
        <Panel title={season.name} description={`${division?.name ?? 'Division'} · Season ${season.status} · ${dashboard.data?.teamCount ?? 0} registered teams`}><Button className="self-start" nativeButton={false} variant="outline" render={<Link href="/manage/teams" />}>Manage teams</Button></Panel>
        <div className="grid gap-4 lg:grid-cols-2"><Panel title="Upcoming games"><GamesList games={dashboard.data?.upcoming ?? []} season={season} teams={seasonTeams.data ?? []} venues={venues.data ?? []} /><Button className="self-start" nativeButton={false} variant="outline" render={<Link href="/manage/games" />}>Manage games</Button></Panel><Panel title="Recent results"><GamesList games={dashboard.data?.recent ?? []} season={season} teams={seasonTeams.data ?? []} venues={venues.data ?? []} /></Panel></div>
        <Panel title="Standings" description="Ordered by wins, point difference, and team name.">{dashboard.data?.standings.length ? <Table><TableHeader><TableRow><TableHead>Team</TableHead><TableHead>Wins</TableHead><TableHead>Losses</TableHead><TableHead>Point difference</TableHead></TableRow></TableHeader><TableBody>{dashboard.data.standings.map((row) => <TableRow key={row.id}><TableCell>{row.name}</TableCell><TableCell>{row.wins}</TableCell><TableCell>{row.losses}</TableCell><TableCell>{row.pointDifference}</TableCell></TableRow>)}</TableBody></Table> : <NoData>Register teams to see standings.</NoData>}<Button className="self-start" nativeButton={false} variant="outline" render={<Link href="/manage/standings" />}>View standings</Button></Panel>
      </>}
    </>}
    {section === 'leagues' && (leagues.data?.length ? <section aria-label="Leagues" className="flex flex-col gap-4">
      <div className="flex justify-end"><CreateLeagueDialog organizationId={org} /></div>
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
      <Dialog open={createSeasonOpen} onOpenChange={setCreateSeasonOpen}>
        {seasonPage.data?.items.length ? <section aria-label="Seasons" className="flex flex-col gap-4">
          <div className="flex justify-end"><DialogTrigger render={<Button />}><PlusIcon data-icon="inline-start" />Create season</DialogTrigger></div>
          <Card className="gap-0 py-0"><CardContent className="px-0"><Table className="table-fixed"><caption className="sr-only">Seasons in this organization</caption>
            <TableHeader className="bg-muted/30"><TableRow><TableHead scope="col" className="pl-5 text-muted-foreground">Season</TableHead><TableHead scope="col" className="hidden text-muted-foreground md:table-cell">League</TableHead><TableHead scope="col" className="w-24 text-muted-foreground sm:w-32">Status</TableHead><TableHead scope="col" className="hidden text-muted-foreground md:table-cell">Start date</TableHead><TableHead scope="col" className="hidden text-muted-foreground md:table-cell">End date</TableHead><TableHead scope="col" className="w-16 pr-4 text-right"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>{seasonPage.data.items.map((item) => <Fragment key={item.id}>
              <TableRow><TableCell className="max-w-0 py-3 pl-5 whitespace-normal"><span className="break-words font-medium">{item.name}</span><div className="mt-1 flex flex-col gap-1 break-words text-xs text-muted-foreground md:hidden"><span>{item.league_name}</span><span>Start: {readableDate(item.start_date)}</span><span>End: {readableDate(item.end_date)}</span></div></TableCell><TableCell className="hidden max-w-0 break-words whitespace-normal text-muted-foreground md:table-cell">{item.league_name}</TableCell><TableCell><SeasonStatusBadge status={item.status} /></TableCell><TableCell className="hidden whitespace-normal text-muted-foreground md:table-cell">{readableDate(item.start_date)}</TableCell><TableCell className="hidden whitespace-normal text-muted-foreground md:table-cell">{readableDate(item.end_date)}</TableCell><TableCell className="pr-4 text-right"><SeasonActions season={item} onEdit={() => setSeasonToEdit(item)} /></TableCell></TableRow>
            </Fragment>)}</TableBody>
          </Table><DataPagination meta={seasonPage.data} onPageChange={setSeasonPageNumber} onPageSizeChange={(size) => { setSeasonPageNumber(1); setSeasonPageSize(size) }} /></CardContent></Card>
        </section> : <Card className="mx-auto w-full max-w-3xl"><CardContent><Empty className="px-4 py-10 sm:py-14"><EmptyHeader><EmptyMedia variant="icon"><CalendarDaysIcon aria-hidden="true" /></EmptyMedia><EmptyTitle><h3>{filtersActive ? 'No matching seasons' : 'No seasons yet'}</h3></EmptyTitle><EmptyDescription>{filtersActive ? 'Try different filters or create a season.' : 'Create your first season to start organizing teams and games.'}</EmptyDescription></EmptyHeader><EmptyContent><div className="flex flex-wrap justify-center gap-2">{filtersActive && <Button variant="outline" onClick={() => { setSeasonSearch(''); setSeasonStatus(''); setSeasonLeagueFilter(''); setSeasonPageNumber(1); setSeasonPageSize(10) }}>Clear filters</Button>}<DialogTrigger render={<Button />}><PlusIcon data-icon="inline-start" />{filtersActive ? 'Create season' : 'Create your first season'}</DialogTrigger></div></EmptyContent></Empty></CardContent></Card>}
        <DialogContent><DialogHeader><DialogTitle>Create a season</DialogTitle><DialogDescription>{selectedLeague ? `Add a name and optional dates for ${selectedLeague.name}.` : 'Close this dialog and select a league in the header before creating a season.'}</DialogDescription></DialogHeader>{selectedLeague && <Editor key={selectedLeague.id} title="Season details" path={`leagues/${selectedLeague.id}/seasons`} fields={dateFields()} transform={seasonData} submitLabel="Create season" alignActions="end" onSaved={() => setCreateSeasonOpen(false)} />}</DialogContent>
      </Dialog>
      <Dialog open={seasonToEdit !== null} onOpenChange={(open) => { if (!open) setSeasonToEdit(null) }}><DialogContent><DialogHeader><DialogTitle>Edit season</DialogTitle><DialogDescription>Update the season name and optional dates.</DialogDescription></DialogHeader>{seasonToEdit && <Editor key={seasonToEdit.id} title="Season details" path={`seasons/${seasonToEdit.id}`} method="PATCH" fields={dateFields(seasonToEdit)} transform={seasonData} alignActions="end" onSaved={() => setSeasonToEdit(null)} onCancel={() => setSeasonToEdit(null)} />}</DialogContent></Dialog>
    </>)}
    {section === 'teams' && (!leagues.data?.length || !league || !season ? <WorkspacePrompt leagueCount={leagues.data?.length ?? 0} leagueSelected={!!league} seasonCount={seasons.data?.length ?? 0} /> : <>
      <Dialog open={createTeamOpen} onOpenChange={(open) => { if (!createTeamPending) setCreateTeamOpen(open) }}>
        {teamRows.length ? <section aria-label="Teams" className="flex flex-col gap-4">
          {teamView === 'table' ? <Card className="gap-0 py-0"><CardContent className="px-0"><Table className="table-fixed"><caption className="sr-only">Teams and their season registrations in this organization</caption><TableHeader className="bg-muted/30"><TableRow><TableHead scope="col" className="pl-5 text-muted-foreground">Team</TableHead><TableHead scope="col" className="hidden text-muted-foreground md:table-cell">League</TableHead><TableHead scope="col" className="hidden text-muted-foreground md:table-cell">Season</TableHead><TableHead scope="col" className="hidden text-muted-foreground md:table-cell">Division</TableHead><TableHead scope="col" className="hidden w-32 text-muted-foreground md:table-cell">Status</TableHead><TableHead scope="col" className="w-14 pr-3 text-right"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>{teamRows.map((team) => {
              const canRegister = season.status !== 'completed' && team.season_id === season.id
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
                <TableCell className="pr-3 text-right"><TeamActions team={team} roster={rosterAction(team)} canRegister={canRegister} onRegister={() => setTeamToRegister(team)} onEdit={() => setTeamToEdit(team)} onCorrect={season.status === 'draft' && team.season_team_id ? () => setTeamToCorrect(team) : undefined} onRemove={season.status === 'draft' && team.season_team_id ? () => setTeamToRemove(team) : undefined} /></TableCell>
              </TableRow>
            })}</TableBody>
          </Table></CardContent></Card> : <ul aria-label="Teams and their season registrations" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {teamRows.map((team) => {
              const canRegister = season.status !== 'completed' && team.season_id === season.id
              const initials = team.name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join('').toLocaleUpperCase()
              return <li key={team.season_team_id ?? team.id} className="flex min-w-0 flex-col rounded-xl border bg-card p-5 text-card-foreground">
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[#E67145]/10 text-sm font-semibold text-[#A64320] dark:text-[#FFAE88]">{initials}</span>
                  <div className="min-w-0 flex-1"><h4 className="break-words font-semibold leading-snug">{team.name}</h4><p className="mt-1 break-words text-sm text-muted-foreground">{team.league_name}</p></div>
                  <TeamActions team={team} roster={rosterAction(team)} canRegister={canRegister} onRegister={() => setTeamToRegister(team)} onEdit={() => setTeamToEdit(team)} onCorrect={season.status === 'draft' && team.season_team_id ? () => setTeamToCorrect(team) : undefined} onRemove={season.status === 'draft' && team.season_team_id ? () => setTeamToRemove(team) : undefined} />
                </div>
                <div className="mt-5 flex flex-1 flex-col items-start gap-2 text-sm">
                  <Badge variant="secondary">{team.season_team_id ? 'Registered' : 'Not registered'}</Badge>
                  <p className="break-words text-muted-foreground">{team.season_name ?? 'Not registered for a season'}{team.division_name ? ` · ${team.division_name}` : ''}</p>
                </div>
              </li>
            })}
          </ul>}
          {organizationTeams.data && <DataPagination meta={organizationTeams.data} onPageChange={setTeamPage} onPageSizeChange={(pageSize) => setTeamPagination({ scope: teamPageScope, page: 1, pageSize })} />}
        </section> : <Card className="mx-auto w-full max-w-3xl"><CardContent><Empty className="px-4 py-10 sm:py-14"><EmptyHeader><EmptyMedia variant="icon"><UsersIcon aria-hidden="true" /></EmptyMedia><EmptyTitle><h3>{teamFiltersActive ? 'No matching teams' : 'No teams in this season'}</h3></EmptyTitle><EmptyDescription>{teamFiltersActive ? 'Try a different search or division.' : 'Register an existing team or create a team to start building rosters for this season.'}</EmptyDescription></EmptyHeader><EmptyContent><div className="flex flex-wrap justify-center gap-2">{teamFiltersActive && <Button variant="outline" onClick={() => { setTeamPage(1); setTeamSearch(''); setDebouncedTeamSearch(''); setTeamDivisionSelection({ id: '', seasonId: teamSeasonFilter }) }}>Clear filters</Button>}</div></EmptyContent></Empty></CardContent></Card>}
        <DialogContent showCloseButton={!createTeamPending} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"><DialogHeader className="pr-8"><DialogTitle>Create a team</DialogTitle><DialogDescription>Enter team details and choose divisions in the current season.</DialogDescription></DialogHeader><CreateTeamForm key={`${league}-${season.id}`} leagueId={league} season={season} initialDivisionId={season.status !== 'completed' ? selectedTeamDivision || (divisions.data?.length === 1 ? divisions.data[0].id : '') : ''} onClose={() => setCreateTeamOpen(false)} onCreated={(nextLeague, nextSeason, nextDivisions) => { changeWorkspace(nextLeague, nextSeason, nextDivisions[0]); if (selectedTeamDivision && (nextSeason !== teamSeasonFilter || nextDivisions.length > 1 || nextDivisions[0] !== selectedTeamDivision)) setTeamDivisionSelection({ id: '', seasonId: nextSeason }); setTeamPage(1); setTeamSearch(''); setDebouncedTeamSearch(''); setCreateTeamOpen(false) }} onPendingChange={setCreateTeamPending} /></DialogContent>
      </Dialog>
      {registerExistingOpen && <RegisterExistingTeamDialog open onOpenChange={setRegisterExistingOpen} leagueId={league} seasonId={season.id} divisions={divisions.data ?? []} initialDivisionId={selectedTeamDivision} />}
      {teamToCorrect?.season_team_id && teamToCorrect.division_id && <CorrectTeamRegistrationDialog key={teamToCorrect.season_team_id} team={{ id: teamToCorrect.season_team_id, name: teamToCorrect.name, divisionId: teamToCorrect.division_id }} divisions={divisions.data ?? []} onClose={() => setTeamToCorrect(null)} />}
      {teamToRemove?.season_team_id && <RemoveTeamRegistrationDialog key={teamToRemove.season_team_id} team={{ id: teamToRemove.season_team_id, name: teamToRemove.name, divisionName: teamToRemove.division_name ?? 'the division' }} seasonName={season.name} onClose={() => setTeamToRemove(null)} />}
      <Dialog open={teamToEdit !== null} onOpenChange={(open) => { if (!open) setTeamToEdit(null) }}><DialogContent><DialogHeader><DialogTitle>Edit team</DialogTitle><DialogDescription>Update this team’s name and abbreviation.</DialogDescription></DialogHeader>{teamToEdit && <Editor key={teamToEdit.id} title="Team details" path={`teams/${teamToEdit.id}`} method="PATCH" fields={teamFields(teamToEdit)} transform={teamData} alignActions="end" onSaved={() => setTeamToEdit(null)} onCancel={() => setTeamToEdit(null)} />}</DialogContent></Dialog>
      <Dialog open={!!teamToRegister && teamToRegister.season_id === season.id && season.status !== 'completed'} onOpenChange={(open) => { if (!open) setTeamToRegister(null) }}><DialogContent><DialogHeader><DialogTitle>Add to division</DialogTitle><DialogDescription>Choose another division for {teamToRegister?.name} in {season.name}.</DialogDescription></DialogHeader>{teamToRegister && teamToRegister.season_id === season.id && <RegisterTeamForm key={`${teamToRegister.id}-${season.id}`} team={teamToRegister} organizationId={org} seasonId={season.id} onClose={() => setTeamToRegister(null)} />}</DialogContent></Dialog>
    </>)}
    {section === 'divisions' && (!league || !season ? <WorkspacePrompt leagueCount={leagues.data?.length ?? 0} leagueSelected={!!league} seasonCount={seasons.data?.length ?? 0} /> : <DivisionsWorkspace key={season.id} season={season} divisions={divisions.data ?? []} />)}
    {section === 'venues' && <VenuesWorkspace key={org} organizationId={org} leagues={leagues.data ?? []} selectedLeagueId={league} />}
    {section === 'standings' && (!league || !season ? <WorkspacePrompt leagueCount={leagues.data?.length ?? 0} leagueSelected={!!league} seasonCount={seasons.data?.length ?? 0} /> : !division ? <NoData>Choose a division to view standings.</NoData> : standings.data?.length ? <StandingsView season={season} division={division} rows={standings.data} /> : <Card className="mx-auto w-full max-w-3xl"><CardContent><Empty className="px-4 py-10 sm:py-14"><EmptyHeader><EmptyMedia variant="icon"><TrophyIcon aria-hidden="true" /></EmptyMedia><EmptyTitle><h3>No teams in this division</h3></EmptyTitle><EmptyDescription>Register teams to see their standings here.</EmptyDescription></EmptyHeader><EmptyContent><Button nativeButton={false} render={<Link href="/manage/teams" />}>Manage teams</Button></EmptyContent></Empty></CardContent></Card>)}
    {section === 'games' && (!league || !season ? <WorkspacePrompt leagueCount={leagues.data?.length ?? 0} leagueSelected={!!league} seasonCount={seasons.data?.length ?? 0} /> : <GamesManager key={season.id} season={season} divisions={divisions.data ?? []} venues={venues.data ?? []} />)}
    </>}
  </main>
}
