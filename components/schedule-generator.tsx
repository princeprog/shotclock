'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format as formatDate, isValid, parseISO } from 'date-fns'
import { CalendarDaysIcon, CircleAlertIcon, CircleCheckIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { joinGameTime, splitGameTime } from '@/lib/game-time'
import { leagueRequest } from '@/lib/league-client'
import { SchedulePreviewCalendar } from '@/components/schedule-preview-calendar'

type ScheduleGame = {
  divisionId: string
  divisionName: string
  homeTeamId: string
  awayTeamId: string
  homeName: string
  awayName: string
  round: number
  stage: 'preliminary' | 'semifinal' | 'final' | 'third_place'
  scheduledAt: string
  venueId: string
  durationMinutes: number
}
type Availability = {
  startDate: string
  endDate: string
  windows: PlayingWindow[]
  timeZone: string
  venueIds: string[]
  durationMinutes: number
  restMinutes: number
}
type PlayingWindow = {
  weekdays: number[]
  startTime: string
  endTime: string
}
type WindowDraft = PlayingWindow & { id: number }
type ScheduleInput = { availability: Availability; format: 'single' | 'double'; playoffs: boolean; thirdPlace: boolean }
type DivisionPreview = { id: string; name: string; teamCount: number; reason?: string; playoffs?: boolean; playoffStage?: string | null; gameCount?: number }
type Preview = { games: ScheduleGame[]; warnings: string[]; divisions: DivisionPreview[] }
type Estimate = { capacity: number; required: number; divisions: DivisionPreview[] }
type CalendarBooking = { id: string; scheduledAt: string; durationMinutes: number; venueId: string; homeName: string; awayName: string; divisionName: string }
type Validation = { issues: { index: number; message: string }[] }
type SavedGame = Omit<ScheduleGame, 'homeName' | 'awayName' | 'divisionName'>
type GameDraft = { game: ScheduleGame; localTime: string; originalLocalTime: string; venueId: string }
type Props = {
  seasonId: string
  divisionId?: string
  seasonName: string
  divisionName?: string
  seasonStart: string | null
  seasonEnd: string | null
  venues: { id: string; name: string }[]
  teamCount?: number
  mode: 'preliminary' | 'playoffs'
  onClose: () => void
  onSaved: () => void
  onPendingChange?: (pending: boolean) => void
}

// A datetime-local value is a wall time, not an instant in the browser's zone.
function formatInZone(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

// Find all possible offsets around the date. Reject skipped or repeated wall times.
function resolveZonedTime(value: string, timeZone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const guess = Date.parse(`${value}:00Z`)
  if (!Number.isFinite(guess)) return null
  const offsets = new Set<number>()
  try {
    for (let hours = -48; hours <= 48; hours += 3) {
      const sample = guess + hours * 60 * 60 * 1000
      const wall = formatInZone(new Date(sample).toISOString(), timeZone)
      offsets.add(Date.parse(`${wall}:00Z`) - sample)
    }
    const candidates = [...offsets]
      .map((offset) => guess - offset)
      .filter((instant) => formatInZone(new Date(instant).toISOString(), timeZone) === value)
    return candidates.length === 1 ? new Date(candidates[0]).toISOString() : null
  } catch {
    return null
  }
}

function gameForSave(game: ScheduleGame, scheduledAt: string, venueId: string): SavedGame {
  return { divisionId: game.divisionId, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, round: game.round, stage: game.stage, scheduledAt, venueId, durationMinutes: game.durationMinutes }
}

function isOutsideSeason(localTime: string, seasonStart: string | null, seasonEnd: string | null): boolean {
  const date = localTime.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  return (!!seasonStart && date < seasonStart.slice(0, 10)) || (!!seasonEnd && date > seasonEnd.slice(0, 10))
}

function formatWallTime(value: string): string {
  const date = new Date(`${value}:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

function validateWindows(windows: PlayingWindow[]): string {
  if (!windows.length || windows.length > 20) return 'Add between 1 and 20 playing windows.'
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/
  for (const [index, window] of windows.entries()) {
    if (!window.weekdays.length || window.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return `Choose at least one weekday for window ${index + 1}.`
    if (!validTime.test(window.startTime) || !validTime.test(window.endTime) || window.startTime >= window.endTime) return `Choose a valid start and later end time for window ${index + 1}.`
  }
  return ''
}

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const hours = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))
const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'))
const subscribe = () => () => {}
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
const serverTimeZone = () => ''

function useDebouncedValue(value: string, delay = 500) {
  const [settled, setSettled] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return settled
}

function ScheduleDate({ id, label, value, disabled, onChange }: { id: string; label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const parsed = value ? parseISO(value) : undefined
  const selected = parsed && isValid(parsed) ? parsed : undefined
  return <Field>
    <FieldLabel htmlFor={id} required>{label}</FieldLabel>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button id={id} type="button" variant="outline" disabled={disabled} aria-required="true" aria-label={`${label}: ${selected ? formatDate(selected, 'PPP') : 'Choose a date'}`} className="w-full justify-start font-normal" />}>
        <CalendarDaysIcon data-icon="inline-start" />{selected ? formatDate(selected, 'MMM d, yyyy') : 'Choose a date'}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar mode="single" selected={selected} defaultMonth={selected} onSelect={(date) => { if (date) { onChange(formatDate(date, 'yyyy-MM-dd')); setOpen(false) } }} autoFocus />
      </PopoverContent>
    </Popover>
  </Field>
}

function ScheduleTime({ id, label, value, disabled, onChange }: { id: string; label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  const time = splitGameTime(value)
  const parts = [
    { key: 'hour', label: 'hour', value: time.hour, options: hours },
    { key: 'minute', label: 'minute', value: time.minute, options: minutes },
    { key: 'period', label: 'AM or PM', value: time.period, options: ['AM', 'PM'] },
  ] as const
  return <FieldSet className="gap-2">
    <FieldLegend variant="label" className="mb-0" required>{label}</FieldLegend>
    <div className="grid grid-cols-3 gap-2">
      {parts.map((part) => <Select key={part.key} value={part.value || null} disabled={disabled} items={part.options.map((option) => ({ value: option, label: option }))} onValueChange={(next) => {
        if (next) onChange(joinGameTime(part.key === 'hour' ? next : time.hour, part.key === 'minute' ? next : time.minute, part.key === 'period' ? next : time.period))
      }}>
        <SelectTrigger id={`${id}-${part.key}`} aria-label={`${label} ${part.label}`} aria-required="true" className="w-full"><SelectValue placeholder={part.label} /></SelectTrigger>
        <SelectContent alignItemWithTrigger={false}><SelectGroup>{part.options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>)}
    </div>
  </FieldSet>
}

export function ScheduleGenerator({ seasonId, seasonName, seasonStart, seasonEnd, venues, mode, onClose, onSaved, onPendingChange }: Props) {
  const client = useQueryClient()
  const defaultZone = useSyncExternalStore(subscribe, browserTimeZone, serverTimeZone)
  const [zoneOverride, setZoneOverride] = useState<string | null>(null)
  const timeZone = zoneOverride ?? defaultZone
  const [startDate, setStartDate] = useState(seasonStart?.slice(0, 10) ?? '')
  const [endDate, setEndDate] = useState(seasonEnd?.slice(0, 10) ?? '')
  const nextWindowId = useRef(1)
  const [windows, setWindows] = useState<WindowDraft[]>([{ id: 0, weekdays: [], startTime: '09:00', endTime: '17:00' }])
  const [venueIds, setVenueIds] = useState<string[]>([])
  const [duration, setDuration] = useState('60')
  const [rest, setRest] = useState('0')
  const [format, setFormat] = useState<'single' | 'double'>('single')
  const [playoffs, setPlayoffs] = useState(false)
  const [thirdPlace, setThirdPlace] = useState(false)
  const [draft, setDraft] = useState<{ input: ScheduleInput | { availability: Availability }; games: GameDraft[]; warnings: string[]; divisions: DivisionPreview[]; seasonId: string; mode: Props['mode'] } | null>(null)
  const [error, setError] = useState('')
  const [expandedGame, setExpandedGame] = useState<string | null>(null)
  const previewHeading = useRef<HTMLHeadingElement>(null)
  const wasPreviewed = useRef(false)
  const path = `seasons/${seasonId}/${mode === 'preliminary' ? 'schedule' : 'playoffs'}`

  let settingsKey = ''
  if (startDate && endDate && startDate <= endDate && !validateWindows(windows) && venueIds.length && duration && rest && Number.isInteger(Number(duration)) && Number(duration) > 0 && Number(duration) <= 1440 && Number.isInteger(Number(rest)) && Number(rest) >= 0 && Number(rest) <= 10080 && timeZone) {
    try {
      new Intl.DateTimeFormat('en', { timeZone }).format()
      const availability: Availability = { startDate, endDate, windows: windows.map(({ weekdays, startTime, endTime }) => ({ weekdays: [...weekdays].sort(), startTime, endTime })), timeZone, venueIds, durationMinutes: Number(duration), restMinutes: Number(rest) }
      settingsKey = JSON.stringify(mode === 'preliminary' ? { availability, format, playoffs, thirdPlace: playoffs && thirdPlace } : { availability })
    } catch { /* Wait until the time zone is valid. */ }
  }
  const settledSettings = useDebouncedValue(settingsKey)
  const estimate = useQuery({ queryKey: ['schedule-estimate', path, settledSettings], enabled: !!settingsKey && settledSettings === settingsKey, retry: false,
    queryFn: () => leagueRequest<Estimate>(`${path}/estimate`, client, 'POST', JSON.parse(settledSettings)) })

  let validationKey = ''
  const invalidGameIndexes: number[] = []
  if (draft && draft.seasonId === seasonId && draft.mode === mode) {
    const games = draft.games.map((item, index) => {
      const scheduledAt = item.localTime === item.originalLocalTime ? item.game.scheduledAt : resolveZonedTime(item.localTime, draft.input.availability.timeZone)
      if (!scheduledAt || !draft.input.availability.venueIds.includes(item.venueId)) invalidGameIndexes.push(index)
      return gameForSave(item.game, scheduledAt ?? item.game.scheduledAt, item.venueId)
    })
    if (!invalidGameIndexes.length && games.length) validationKey = JSON.stringify({ ...draft.input, games, divisionIds: draft.divisions.filter((division) => division.reason === undefined).map((division) => division.id) })
  }
  const settledValidation = useDebouncedValue(validationKey)
  const validation = useQuery({ queryKey: ['schedule-validation', path, settledValidation], enabled: !!validationKey && settledValidation === validationKey, retry: false, staleTime: 0,
    queryFn: () => leagueRequest<Validation>(`${path}/validate`, client, 'POST', JSON.parse(settledValidation)) })
  const calendarKey = draft && draft.seasonId === seasonId && draft.mode === mode ? JSON.stringify({ availability: draft.input.availability }) : ''
  const calendar = useQuery({ queryKey: ['schedule-calendar', seasonId, calendarKey], enabled: !!calendarKey, retry: false,
    queryFn: () => leagueRequest<{ games: CalendarBooking[] }>(`seasons/${seasonId}/schedule/calendar`, client, 'POST', JSON.parse(calendarKey)) })
  const estimateReady = !!settingsKey && settledSettings === settingsKey && !estimate.isFetching && !!estimate.data && !estimate.isError
  const validationReady = !!validationKey && settledValidation === validationKey && !validation.isFetching && !!validation.data && !validation.isError

  const preview = useMutation({
    mutationFn: (input: ScheduleInput | { availability: Availability }) => leagueRequest<Preview>(`${path}/preview`, client, 'POST', input),
    onSuccess: (result, input) => {
      try {
        if (!Array.isArray(result.games) || !Array.isArray(result.warnings) || !Array.isArray(result.divisions)) throw new Error()
        const ids = new Set<string>()
        for (const division of result.divisions) {
          if (!division.id || !division.name || !Number.isInteger(division.teamCount) || division.teamCount < 0 || ids.has(division.id) || (division.reason !== undefined && typeof division.reason !== 'string')) throw new Error()
          ids.add(division.id)
        }
        const includedIds = new Set(result.divisions.filter((division) => division.reason === undefined).map((division) => division.id))
        const games = result.games.map((game) => {
          if (!game.divisionId || !game.divisionName || !includedIds.has(game.divisionId) || !game.homeTeamId || !game.awayTeamId || !game.homeName || !game.awayName || !game.venueId || !Number.isFinite(Date.parse(game.scheduledAt))) throw new Error()
          const localTime = formatInZone(game.scheduledAt, input.availability.timeZone)
          return { game, localTime, originalLocalTime: localTime, venueId: game.venueId }
        })
        setDraft({ input, games, warnings: result.warnings, divisions: result.divisions, seasonId, mode })
      } catch {
        setError('The preview contained incomplete game details. Please try again.')
      }
    },
  })
  const save = useMutation({
    mutationFn: (body: (ScheduleInput | { availability: Availability }) & { games: SavedGame[]; divisionIds: string[] }) => leagueRequest(path, client, 'POST', body),
    onSuccess: onSaved,
  })
  const pending = preview.isPending || save.isPending
  useEffect(() => { onPendingChange?.(pending) }, [pending, onPendingChange])
  useEffect(() => {
    if (draft && !wasPreviewed.current) previewHeading.current?.scrollIntoView({ block: 'start' })
    wasPreviewed.current = !!draft
  }, [draft])

  function changed() {
    setDraft(null)
    setError('')
    preview.reset()
    save.reset()
  }

  function requestPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setDraft(null)
    if (!startDate || !endDate || startDate > endDate) { setError('Choose a valid date range.'); return }
    const windowError = validateWindows(windows)
    if (windowError) { setError(windowError); return }
    if (!venueIds.length) { setError('Choose at least one venue.'); return }
    if (!Number.isInteger(Number(duration)) || Number(duration) <= 0 || !duration || !Number.isInteger(Number(rest)) || Number(rest) < 0 || !rest) { setError('Enter a positive game duration and a nonnegative rest time in whole minutes.'); return }
    try { new Intl.DateTimeFormat('en', { timeZone }).format() } catch { setError('Enter a valid IANA time zone, such as Asia/Manila.'); return }
    if (!timeZone.trim()) { setError('Enter a valid IANA time zone.'); return }
    if (!estimateReady || !estimate.data) { setError('Wait for the capacity check or retry it before generating a preview.'); return }
    if (!estimate.data.required) { setError('No divisions are ready to generate games.'); return }
    if (estimate.data.capacity < estimate.data.required) { setError('Add more playing time or venues before generating a preview.'); return }
    const availability: Availability = { startDate, endDate, windows: windows.map(({ weekdays, startTime, endTime }) => ({ weekdays: [...weekdays].sort(), startTime, endTime })), timeZone, venueIds, durationMinutes: Number(duration), restMinutes: Number(rest) }
    const input = mode === 'preliminary' ? { availability, format, playoffs, thirdPlace: playoffs && thirdPlace } : { availability }
    preview.mutate(input)
  }

  function saveSchedule() {
    if (!draft || draft.seasonId !== seasonId || draft.mode !== mode || !draft.games.length || pending || !validationReady || !!validation.data?.issues.length) return
    setError('')
    const games: SavedGame[] = []
    for (const [index, item] of draft.games.entries()) {
      const scheduledAt = item.localTime === item.originalLocalTime ? item.game.scheduledAt : resolveZonedTime(item.localTime, draft.input.availability.timeZone)
      if (!scheduledAt) { setError(`Game ${index + 1} has an invalid, skipped, or repeated local time. Choose a different time.`); return }
      if (!draft.input.availability.venueIds.includes(item.venueId)) { setError(`Choose an available venue for game ${index + 1}.`); return }
      games.push(gameForSave(item.game, scheduledAt, item.venueId))
    }
    save.mutate({ ...draft.input, games, divisionIds: draft.divisions.filter((division) => division.reason === undefined).map((division) => division.id) })
  }

  const hasPreview = draft?.seasonId === seasonId && draft.mode === mode
  const outsideSeason = draft?.games.some((item) => isOutsideSeason(item.localTime, seasonStart, seasonEnd)) ?? false
  const otherWarnings = draft?.warnings.filter((warning) => !/^some games are outside the season dates\.?$/i.test(warning.trim())) ?? []

  return <>
    <DialogHeader className="border-b px-6 py-5 pr-14">
      <DialogTitle>{mode === 'preliminary' ? 'Generate preliminary schedule' : 'Schedule playoff games'}</DialogTitle>
      <DialogDescription>{seasonName} <span aria-hidden="true">—</span> Set shared availability, then review each division’s games.</DialogDescription>
    </DialogHeader>
    <form onSubmit={requestPreview} className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-6 py-6">
        {mode === 'preliminary' && <section className="flex flex-col gap-4" aria-labelledby="schedule-format-heading">
          <div><h3 id="schedule-format-heading" className="font-medium">Competition format</h3><p className="text-sm text-muted-foreground">Choose how teams play through the season.</p></div>
          <Field><FieldLabel htmlFor="schedule-format" required>Round-robin format</FieldLabel>
            <Select value={format} disabled={pending} items={[{ value: 'single', label: 'Single round robin' }, { value: 'double', label: 'Double round robin' }]} onValueChange={(value) => { if (value === 'single' || value === 'double') { setFormat(value); changed() } }}>
              <SelectTrigger id="schedule-format" aria-required="true" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent alignItemWithTrigger={false}><SelectGroup><SelectItem value="single">Single round robin</SelectItem><SelectItem value="double">Double round robin</SelectItem></SelectGroup></SelectContent>
            </Select>
            <FieldDescription>{format === 'single' ? 'Each team plays every other team once.' : 'Each team plays every other team twice, switching home and away.'}</FieldDescription>
          </Field>
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <label className="flex items-center gap-3 text-sm font-medium"><Checkbox checked={playoffs} disabled={pending} onCheckedChange={(checked) => { setPlayoffs(checked); if (!checked) setThirdPlace(false); changed() }} />Include playoffs</label>
            <p className="pl-7 text-sm text-muted-foreground">In eligible divisions, the top four teams advance to single-elimination semifinals. Playoffs require at least four teams.</p>
            {playoffs && <label className="flex items-center gap-3 pl-7 text-sm"><Checkbox checked={thirdPlace} disabled={pending} onCheckedChange={(checked) => { setThirdPlace(checked); changed() }} />Include a third-place game</label>}
          </div>
        </section>}

        <section className="flex flex-col gap-4 border-t pt-6" aria-labelledby="schedule-dates-heading">
          <div><h3 id="schedule-dates-heading" className="font-medium">Dates &amp; availability</h3><p className="text-sm text-muted-foreground">Choose the date range and times your venues are available.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ScheduleDate id="schedule-start-date" label="Start date" value={startDate} disabled={pending} onChange={(value) => { setStartDate(value); changed() }} />
            <ScheduleDate id="schedule-end-date" label="End date" value={endDate} disabled={pending} onChange={(value) => { setEndDate(value); changed() }} />
          </div>
          <div className="flex flex-col gap-3">
            {windows.map((window, position) => <div key={window.id} className="flex flex-col gap-4 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">Playing window {position + 1}</p><p className="text-xs text-muted-foreground">Repeats every week</p></div>{windows.length > 1 && <Button type="button" variant="ghost" size="icon-sm" disabled={pending} aria-label={`Remove playing window ${position + 1}`} onClick={() => { setWindows((current) => current.filter((item) => item.id !== window.id)); changed() }}><Trash2Icon /></Button>}</div>
              <FieldSet className="gap-2"><FieldLegend variant="label" className="mb-0" required>Playing days</FieldLegend>
                <ToggleGroup multiple variant="outline" size="sm" disabled={pending} aria-label={`Playing days for window ${position + 1}`} className="w-full flex-wrap" value={window.weekdays.map(String)} onValueChange={(values) => { setWindows((current) => current.map((item) => item.id === window.id ? { ...item, weekdays: values.map(Number) } : item)); changed() }}>
                  {weekdays.map((day, index) => <ToggleGroupItem key={day} value={String(index)} aria-label={day}>{day}</ToggleGroupItem>)}
                </ToggleGroup>
              </FieldSet>
              <div className="grid gap-4 sm:grid-cols-2">
                <ScheduleTime id={`schedule-window-${window.id}-start`} label="Start time" value={window.startTime} disabled={pending} onChange={(value) => { setWindows((current) => current.map((item) => item.id === window.id ? { ...item, startTime: value } : item)); changed() }} />
                <ScheduleTime id={`schedule-window-${window.id}-end`} label="End time" value={window.endTime} disabled={pending} onChange={(value) => { setWindows((current) => current.map((item) => item.id === window.id ? { ...item, endTime: value } : item)); changed() }} />
              </div>
            </div>)}
            <div><Button type="button" variant="outline" size="sm" disabled={pending || windows.length >= 20} onClick={() => { const id = nextWindowId.current++; setWindows((current) => [...current, { id, weekdays: [], startTime: '09:00', endTime: '17:00' }]); changed() }}><PlusIcon data-icon="inline-start" />Add playing window</Button></div>
          </div>
          <Field><FieldLabel htmlFor="schedule-zone" required>Time zone</FieldLabel><Input id="schedule-zone" required disabled={pending} value={timeZone} onChange={(e) => { setZoneOverride(e.target.value); changed() }} placeholder="Asia/Manila" /><FieldDescription>All playing windows and preview times use this IANA time zone.</FieldDescription></Field>
        </section>

        <section className="flex flex-col gap-4 border-t pt-6" aria-labelledby="schedule-settings-heading">
          <div><h3 id="schedule-settings-heading" className="font-medium">Game settings</h3><p className="text-sm text-muted-foreground">Select courts and allow enough time between games.</p></div>
          <FieldSet className="gap-2"><FieldLegend variant="label" className="mb-0" required>Venues</FieldLegend>{venues.length ? <div className="grid gap-3 sm:grid-cols-2">{venues.map((venue) => <label key={venue.id} className="flex items-center gap-2 text-sm"><Checkbox checked={venueIds.includes(venue.id)} disabled={pending} onCheckedChange={(checked) => { setVenueIds((current) => checked ? [...current, venue.id] : current.filter((id) => id !== venue.id)); changed() }} />{venue.name}</label>)}</div> : <p className="text-sm text-muted-foreground">Add a venue before generating a schedule.</p>}</FieldSet>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="schedule-duration" required>Game duration (minutes)</FieldLabel><Input id="schedule-duration" type="number" min="1" step="1" required disabled={pending} value={duration} onChange={(e) => { setDuration(e.target.value); changed() }} /></Field>
            <Field><FieldLabel htmlFor="schedule-rest" required>Minimum rest (minutes)</FieldLabel><Input id="schedule-rest" type="number" min="0" step="1" required disabled={pending} value={rest} onChange={(e) => { setRest(e.target.value); changed() }} /></Field>
          </div>
        </section>

        <section className="flex flex-col gap-3 border-t pt-6" aria-labelledby="schedule-capacity-heading">
          <div><h3 id="schedule-capacity-heading" className="font-medium">Schedule capacity</h3><p className="text-sm text-muted-foreground">Check the number of games and available court slots before generating.</p></div>
          {!settingsKey && <p className="text-sm text-muted-foreground">Complete the dates, playing windows, venues and game settings to check capacity.</p>}
          {settingsKey && !estimateReady && (settledSettings !== settingsKey || !estimate.isError) && <p className="text-sm text-muted-foreground" role="status">Checking capacity…</p>}
          {settingsKey && settledSettings === settingsKey && estimate.isError && <Alert variant="destructive"><AlertTitle>Capacity check unavailable</AlertTitle><AlertDescription>{estimate.error.message} <Button type="button" variant="link" size="sm" onClick={() => void estimate.refetch()}>Retry</Button></AlertDescription></Alert>}
          {estimateReady && estimate.data && <div className="overflow-hidden rounded-lg border text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
              <p className="font-medium">Capacity overview</p>
              {estimate.data.required === 0 ? <Badge variant="secondary">No eligible divisions</Badge> : estimate.data.capacity < estimate.data.required ? <Badge variant="destructive"><CircleAlertIcon data-icon="inline-start" />More slots needed</Badge> : <Badge variant="secondary"><CircleCheckIcon data-icon="inline-start" />Slots available</Badge>}
            </div>
            <dl className="grid grid-cols-2 gap-4 px-4 py-4">
              <div><dt className="text-muted-foreground">Games to schedule</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{estimate.data.required.toLocaleString('en-US')}</dd></div>
              <div><dt className="text-muted-foreground">Available court slots</dt><dd className="mt-1 text-xl font-semibold tabular-nums">Up to {estimate.data.capacity.toLocaleString('en-US')}</dd></div>
            </dl>
            {estimate.data.required === 0 && <p className="px-4 pb-4 text-muted-foreground">No divisions are ready to generate games with these settings.</p>}
            {estimate.data.capacity < estimate.data.required && <p className="px-4 pb-4 text-destructive" role="alert">At least {estimate.data.required - estimate.data.capacity} more court slots are needed. Add venues or playing time.</p>}
            <p className="px-4 pb-4 text-muted-foreground">Available slots are an estimate after existing bookings. Team rest and round order may reduce capacity.</p>
            {estimate.data.divisions.length > 0 && <div className="border-t px-4 py-3">
              <p className="mb-2 font-medium">Divisions</p>
              <ul className="flex flex-col gap-2">{estimate.data.divisions.map((division) => <li key={division.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5"><span className="min-w-0 font-medium">{division.name}</span><span className="text-muted-foreground">{division.reason ? `Skipped — ${division.reason}` : `${division.gameCount} ${division.gameCount === 1 ? 'game' : 'games'}${mode === 'preliminary' && playoffs && division.teamCount < 4 ? ' · round robin only' : ''}`}</span></li>)}</ul>
            </div>}
          </div>}
        </section>

        {draft && draft.seasonId === seasonId && draft.mode === mode && <section aria-labelledby="schedule-preview-heading" className="flex flex-col gap-4 border-t pt-6">
          <div><h3 ref={previewHeading} id="schedule-preview-heading" className="scroll-mt-2 font-medium">Review schedule · {draft.games.length} {draft.games.length === 1 ? 'game' : 'games'}</h3><p className="text-sm text-muted-foreground">Select a game to adjust its date, time or venue. Times are in {draft.input.availability.timeZone}.</p></div>
          {(outsideSeason || otherWarnings.length > 0) && <Alert role="status"><AlertTitle>Please review</AlertTitle><AlertDescription><ul className="list-disc pl-4">{outsideSeason && <li>Some games are outside the season dates.</li>}{otherWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></AlertDescription></Alert>}
          {!draft.games.length && <p className="text-sm text-muted-foreground">No games were returned for these settings.</p>}
          {invalidGameIndexes.length > 0 && <Alert variant="destructive" role="alert"><AlertTitle>Check the edited game times</AlertTitle><AlertDescription>Choose valid, unambiguous local times and available venues before saving.</AlertDescription></Alert>}
          {!invalidGameIndexes.length && !validationReady && !validation.isError && <p className="text-sm text-muted-foreground" role="status">Checking the preview for conflicts…</p>}
          {validationKey && settledValidation === validationKey && validation.isError && <Alert variant="destructive"><AlertTitle>Could not check this preview</AlertTitle><AlertDescription>{validation.error.message} <Button type="button" variant="link" size="sm" onClick={() => void validation.refetch()}>Retry</Button></AlertDescription></Alert>}
          {validationReady && !!validation.data?.issues.length && <Alert variant="destructive" role="alert"><AlertTitle>Resolve schedule conflicts</AlertTitle><AlertDescription>Review the marked games below. Changes are checked again before saving.</AlertDescription></Alert>}
          {validationReady && !validation.data?.issues.length && <p className="text-sm text-muted-foreground" role="status">No scheduling conflicts found.</p>}
          <SchedulePreviewCalendar games={draft.games.map((item, index) => ({ index, localTime: item.localTime, homeName: item.game.homeName, awayName: item.game.awayName, divisionName: item.game.divisionName, venueName: venues.find((venue) => venue.id === item.venueId)?.name ?? '', conflict: invalidGameIndexes.includes(index) || !!(validationReady && validation.data?.issues.some((issue) => issue.index === index)) }))}
            bookings={(calendar.data?.games ?? []).map((game) => ({ ...game, localTime: formatInZone(game.scheduledAt, draft.input.availability.timeZone), endDate: formatInZone(new Date(Date.parse(game.scheduledAt) + game.durationMinutes * 60_000 - 1).toISOString(), draft.input.availability.timeZone).slice(0, 10), venueName: venues.find((venue) => venue.id === game.venueId)?.name ?? '' }))}
            loading={calendar.isFetching} error={calendar.isError ? calendar.error.message : ''} onRetry={() => void calendar.refetch()}
            initialDate={draft.games[0]?.localTime.slice(0, 10) ?? draft.input.availability.startDate} rangeStart={draft.input.availability.startDate} rangeEnd={draft.input.availability.endDate} timeZone={draft.input.availability.timeZone}
            onSelect={(index) => { setExpandedGame(String(index)); window.setTimeout(() => document.getElementById(`schedule-game-trigger-${index}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0) }} />
          <div className="flex flex-col gap-5">{draft.divisions.map((division) => {
            const divisionGames = draft.games.map((item, index) => ({ item, index })).filter(({ item }) => item.game.divisionId === division.id)
            const rounds = [...new Set(divisionGames.map(({ item }) => item.game.round))].sort((a, b) => a - b)
            return <section key={division.id} className="flex flex-col gap-3" aria-labelledby={`schedule-division-${division.id}`}>
              <div><h4 id={`schedule-division-${division.id}`} className="font-medium">{division.name}</h4>
                <p className="text-sm text-muted-foreground">{division.teamCount} {division.teamCount === 1 ? 'team' : 'teams'} · {divisionGames.length} {divisionGames.length === 1 ? 'game' : 'games'}</p>
                {division.reason !== undefined && <p className="text-sm text-muted-foreground">Skipped: {division.reason}</p>}
                {division.reason === undefined && mode === 'preliminary' && 'playoffs' in draft.input && draft.input.playoffs && division.teamCount < 4 && <p className="text-sm text-muted-foreground">Playoffs require at least four teams in this division.</p>}
                {division.reason === undefined && mode === 'preliminary' && 'playoffs' in draft.input && draft.input.playoffs && division.teamCount >= 4 && division.playoffs === false && <p className="text-sm text-muted-foreground">Playoffs are not included for this division.</p>}
                {division.reason === undefined && mode === 'playoffs' && division.playoffStage && <p className="text-sm text-muted-foreground">Playoff stage: {division.playoffStage.replace('_', ' ')}</p>}
              </div>
              {rounds.map((round) => <div key={round} className="flex flex-col gap-2">
                <h5 className="text-sm font-medium">Round {round}</h5>
                <Accordion value={expandedGame ? [expandedGame] : []} onValueChange={(value) => setExpandedGame(value[0] ?? null)} className="overflow-hidden rounded-lg border">{divisionGames.filter(({ item }) => item.game.round === round).map(({ item, index }) => <AccordionItem key={index} value={String(index)}>
            <AccordionTrigger id={`schedule-game-trigger-${index}`} className="gap-3 px-4 hover:no-underline"><span className="flex min-w-0 flex-col gap-1"><span className="font-medium">{item.game.homeName} vs {item.game.awayName}</span><span className="text-xs font-normal text-muted-foreground">{{ preliminary: 'Preliminary', semifinal: 'Semifinal', final: 'Championship', third_place: 'Third place' }[item.game.stage]} · Round {item.game.round} · {formatWallTime(item.localTime)} · {venues.find((venue) => venue.id === item.venueId)?.name}</span>{invalidGameIndexes.includes(index) && <span className="text-xs text-destructive">Invalid or ambiguous local time or venue.</span>}{validationReady && validation.data?.issues.filter((issue) => issue.index === index).map((issue) => <span key={issue.message} className="text-xs text-destructive">{issue.message}</span>)}</span></AccordionTrigger>
            <AccordionContent className="flex flex-col gap-4 px-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <ScheduleDate id={`schedule-game-date-${index}`} label="Date" value={item.localTime.slice(0, 10)} disabled={pending} onChange={(value) => { setDraft((current) => current && { ...current, games: current.games.map((game, i) => i === index ? { ...game, localTime: `${value}T${game.localTime.slice(11, 16)}` } : game) }); setError('') }} />
              <ScheduleTime id={`schedule-game-time-${index}`} label="Time" value={item.localTime.slice(11, 16)} disabled={pending} onChange={(value) => { setDraft((current) => current && { ...current, games: current.games.map((game, i) => i === index ? { ...game, localTime: `${game.localTime.slice(0, 10)}T${value}` } : game) }); setError('') }} />
            </div>
            <Field><FieldLabel htmlFor={`schedule-game-venue-${index}`} required>Venue</FieldLabel>
              <Select value={item.venueId} disabled={pending} items={venues.filter((venue) => draft.input.availability.venueIds.includes(venue.id)).map((venue) => ({ value: venue.id, label: venue.name }))} onValueChange={(value) => { if (value) { setDraft((current) => current && { ...current, games: current.games.map((game, i) => i === index ? { ...game, venueId: value } : game) }); setError('') } }}>
                <SelectTrigger id={`schedule-game-venue-${index}`} aria-required="true" className="w-full"><SelectValue placeholder="Choose a venue" /></SelectTrigger>
                <SelectContent alignItemWithTrigger={false}><SelectGroup>{venues.filter((venue) => draft.input.availability.venueIds.includes(venue.id)).map((venue) => <SelectItem key={venue.id} value={venue.id}>{venue.name}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </Field>
            </AccordionContent>
          </AccordionItem>)}</Accordion>
              </div>)}
            </section>
          })}</div>
        </section>}
      </div>
      {(preview.isError || error || save.isError) && <div className="border-t px-6 py-3"><Alert variant="destructive" role="alert"><AlertTitle>Unable to continue</AlertTitle><AlertDescription>{error || (preview.isError ? preview.error.message : save.error?.message)}</AlertDescription></Alert></div>}
      <DialogFooter className="border-t px-6 py-4">
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button>
        <Button type="submit" variant={hasPreview ? 'outline' : 'default'} disabled={pending || !venues.length || !estimateReady || !estimate.data?.required || !!(estimate.data && estimate.data.capacity < estimate.data.required)}>{preview.isPending ? 'Generating preview…' : hasPreview ? 'Update preview' : 'Preview schedule'}</Button>
        {draft && draft.seasonId === seasonId && draft.mode === mode && <Button type="button" disabled={pending || !draft.games.length || !validationReady || !!validation.data?.issues.length} onClick={saveSchedule}>{save.isPending ? 'Saving…' : 'Save schedule'}</Button>}
      </DialogFooter>
    </form>
  </>
}
