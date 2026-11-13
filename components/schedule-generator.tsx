'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format as formatDate, isValid, parseISO } from 'date-fns'
import { CalendarDaysIcon, CircleAlertIcon, CircleCheckIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react'
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
import { confirmDiscardSchedulePreview } from '@/lib/schedule-navigation-guard'
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
  pace: Pace
  maxGamesPerTeamPerDay: number
  changeoverMinutes: number
  blackoutDates: string[]
  teamUnavailability: { teamId: string; dates: string[] }[]
}
type Pace = 'weekly' | 'spread' | 'compact'
type TeamUnavailabilityDraft = { id: number; teamId: string; dates: string[] }
type StatusDivision = { id: string; name: string; teams?: { id: string; name: string }[] }
type PlayingWindow = {
  weekdays: number[]
  startTime: string
  endTime: string
}
type WindowDraft = PlayingWindow & { id: number }
type ScheduleInput = { availability: Availability; format: 'single' | 'double'; playoffs: boolean; thirdPlace: boolean }
type DivisionPreview = { id: string; name: string; teamCount: number; reason?: string; playoffs?: boolean; playoffStage?: string | null; gameCount?: number }
type Unplaced = Pick<ScheduleGame, 'divisionId' | 'divisionName' | 'homeTeamId' | 'awayTeamId' | 'homeName' | 'awayName' | 'round' | 'stage'> & { reason: string }
type Preview = { games: ScheduleGame[]; warnings: string[]; divisions: DivisionPreview[]; unplaced?: Unplaced[] }
type Slot = { scheduledAt: string; venueId: string }
type Suggestions = { status: 'loading' | 'done' | 'error'; slots: Slot[]; error?: string }
type Estimate = { capacity: number; required: number; divisions: DivisionPreview[] }
type CalendarBooking = { id: string; scheduledAt: string; durationMinutes: number; venueId: string; homeName: string; awayName: string; divisionName: string }
type IssueType = 'team' | 'venue' | 'window' | 'round' | 'blackout' | 'unavailable' | 'daily_limit' | 'weekly_limit'
type Issue = { index: number; type?: IssueType; message: string; teamId?: string; with?: { kind: 'draft'; index: number } | { kind: 'existing'; id: string } }
type ExistingConflict = { id: string; scheduledAt: string; venueName: string | null; homeName: string; awayName: string; divisionName: string }
type Validation = { issues: Issue[]; existingGames?: ExistingConflict[] }
type SavedGame = Omit<ScheduleGame, 'homeName' | 'awayName' | 'divisionName'>
// kept marks games the organizer moved; generated holds the time and venue the generator chose, for reverting.
type GameDraft = { game: ScheduleGame; localTime: string; originalLocalTime: string; venueId: string; kept: boolean; generated?: Slot }
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
  onUnsavedChange?: (unsaved: boolean) => void
  presentation?: 'dialog' | 'page'
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
const issueLabels: Record<IssueType, string> = {
  team: 'Team overlaps or rest', venue: 'Court bookings', window: 'Outside playing hours', round: 'Round order',
  blackout: 'Blackout dates', unavailable: 'Unavailable teams', daily_limit: 'Games per day', weekly_limit: 'Weekly pacing',
}
const paces: { value: Pace; label: string; description: string }[] = [
  { value: 'weekly', label: 'Weekly', description: 'Each team plays at most once a week.' },
  { value: 'spread', label: 'Spread across dates', description: 'Rounds are spaced evenly from the start date to the end date.' },
  { value: 'compact', label: 'As early as possible', description: 'Games fill the earliest open slots.' },
]

function isWhole(value: string, minimum: number, maximum: number): boolean {
  return value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= minimum && Number(value) <= maximum
}
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

function ScheduleDates({ id, label, values, rangeStart, rangeEnd, disabled, onChange }: { id: string; label: string; values: string[]; rangeStart: string; rangeEnd: string; disabled: boolean; onChange: (values: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const selected = values.map((value) => parseISO(value)).filter(isValid)
  const start = rangeStart ? parseISO(rangeStart) : undefined
  return <Field>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button id={id} type="button" variant="outline" disabled={disabled} className="w-full justify-start font-normal" />}>
        <CalendarDaysIcon data-icon="inline-start" />{values.length ? `${values.length} ${values.length === 1 ? 'date' : 'dates'} selected` : 'Choose dates'}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar mode="multiple" selected={selected} defaultMonth={selected[0] ?? (start && isValid(start) ? start : undefined)}
          disabled={(date) => { const day = formatDate(date, 'yyyy-MM-dd'); return (!!rangeStart && day < rangeStart) || (!!rangeEnd && day > rangeEnd) }}
          onSelect={(dates) => onChange((dates ?? []).map((date) => formatDate(date, 'yyyy-MM-dd')).sort())} />
      </PopoverContent>
    </Popover>
    {values.length > 0 && <ul className="flex flex-wrap gap-1.5" aria-label={label}>{values.map((value) => <li key={value}><Badge variant="secondary" className="gap-1 pr-1">
      {formatDate(parseISO(value), 'EEE, MMM d')}
      <button type="button" disabled={disabled} aria-label={`Remove ${formatDate(parseISO(value), 'MMMM d')}`} className="rounded-sm opacity-70 hover:opacity-100" onClick={() => onChange(values.filter((item) => item !== value))}><XIcon className="size-3" /></button>
    </Badge></li>)}</ul>}
  </Field>
}

export function ScheduleGenerator({ seasonId, seasonName, seasonStart, seasonEnd, venues, mode, onClose, onSaved, onPendingChange, onUnsavedChange, presentation = 'dialog' }: Props) {
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
  const [pace, setPace] = useState<Pace>('weekly')
  const [maxPerDay, setMaxPerDay] = useState('1')
  const [changeover, setChangeover] = useState('0')
  const [blackoutDates, setBlackoutDates] = useState<string[]>([])
  const nextTeamRowId = useRef(0)
  const [teamRows, setTeamRows] = useState<TeamUnavailabilityDraft[]>([])
  const [draft, setDraft] = useState<{ input: ScheduleInput | { availability: Availability }; games: GameDraft[]; unplaced: Unplaced[]; warnings: string[]; divisions: DivisionPreview[]; seasonId: string; mode: Props['mode'] } | null>(null)
  const [error, setError] = useState('')
  const [showCapacity, setShowCapacity] = useState(false)
  const [expandedGame, setExpandedGame] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Record<string, Suggestions>>({})
  const previewHeading = useRef<HTMLHeadingElement>(null)
  const capacityHeading = useRef<HTMLHeadingElement>(null)
  const wasPreviewed = useRef(false)
  const path = `seasons/${seasonId}/${mode === 'preliminary' ? 'schedule' : 'playoffs'}`

  const status = useQuery({ queryKey: ['league', `seasons/${seasonId}/schedule/status`], retry: false,
    queryFn: () => leagueRequest<{ divisions: StatusDivision[] }>(`seasons/${seasonId}/schedule/status`, client) })
  const teamOptions = (status.data?.divisions ?? []).flatMap((division) => (division.teams ?? []).map((team) => ({ value: team.id, label: `${division.name} · ${team.name}` })))
  const limitsValid = isWhole(maxPerDay, 1, 10) && isWhole(changeover, 0, 240)
  let settingsKey = ''
  if (startDate && endDate && startDate <= endDate && !validateWindows(windows) && venueIds.length && duration && rest && Number.isInteger(Number(duration)) && Number(duration) > 0 && Number(duration) <= 1440 && Number.isInteger(Number(rest)) && Number(rest) >= 0 && Number(rest) <= 10080 && limitsValid && timeZone) {
    try {
      new Intl.DateTimeFormat('en', { timeZone }).format()
      // Only dates inside the range matter; one entry per team, as the API expects.
      const unavailable = new Map<string, Set<string>>()
      for (const row of teamRows) for (const date of row.dates) if (row.teamId && date >= startDate && date <= endDate) unavailable.set(row.teamId, (unavailable.get(row.teamId) ?? new Set<string>()).add(date))
      const availability: Availability = { startDate, endDate, windows: windows.map(({ weekdays, startTime, endTime }) => ({ weekdays: [...weekdays].sort(), startTime, endTime })), timeZone, venueIds, durationMinutes: Number(duration), restMinutes: Number(rest),
        pace, maxGamesPerTeamPerDay: Number(maxPerDay), changeoverMinutes: Number(changeover), blackoutDates: blackoutDates.filter((date) => date >= startDate && date <= endDate),
        teamUnavailability: [...unavailable].map(([teamId, dates]) => ({ teamId, dates: [...dates].sort() })) }
      settingsKey = JSON.stringify(mode === 'preliminary' ? { availability, format, playoffs, thirdPlace: playoffs && thirdPlace } : { availability })
    } catch { /* Wait until the time zone is valid. */ }
  }
  const estimate = useQuery({ queryKey: ['schedule-estimate', path, settingsKey], enabled: false, retry: false,
    queryFn: () => leagueRequest<Estimate>(`${path}/estimate`, client, 'POST', JSON.parse(settingsKey)) })

  let validationKey = ''
  const invalidGameIndexes: number[] = []
  let draftGames: SavedGame[] = []
  if (draft && draft.seasonId === seasonId && draft.mode === mode) {
    const games = draft.games.map((item, index) => {
      const scheduledAt = item.localTime === item.originalLocalTime ? item.game.scheduledAt : resolveZonedTime(item.localTime, draft.input.availability.timeZone)
      if (!scheduledAt || !draft.input.availability.venueIds.includes(item.venueId)) invalidGameIndexes.push(index)
      return gameForSave(item.game, scheduledAt ?? item.game.scheduledAt, item.venueId)
    })
    draftGames = games
    if (!invalidGameIndexes.length && games.length) validationKey = JSON.stringify({ ...draft.input, games, divisionIds: draft.divisions.filter((division) => division.reason === undefined).map((division) => division.id) })
  }
  const settledValidation = useDebouncedValue(validationKey)
  const validation = useQuery({ queryKey: ['schedule-validation', path, settledValidation], enabled: !!validationKey && settledValidation === validationKey, retry: false, staleTime: 0,
    queryFn: () => leagueRequest<Validation>(`${path}/validate`, client, 'POST', JSON.parse(settledValidation)) })
  const calendarKey = draft && draft.seasonId === seasonId && draft.mode === mode ? JSON.stringify({ availability: draft.input.availability }) : ''
  const calendar = useQuery({ queryKey: ['schedule-calendar', seasonId, calendarKey], enabled: !!calendarKey, retry: false,
    queryFn: () => leagueRequest<{ games: CalendarBooking[] }>(`seasons/${seasonId}/schedule/calendar`, client, 'POST', JSON.parse(calendarKey)) })
  const estimateReady = !!settingsKey && !estimate.isFetching && !!estimate.data && !estimate.isError
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
          return { game, localTime, originalLocalTime: localTime, venueId: game.venueId, kept: false, generated: { scheduledAt: game.scheduledAt, venueId: game.venueId } }
        })
        const unplaced = result.unplaced ?? []
        if (!Array.isArray(unplaced) || unplaced.some((item) => !includedIds.has(item.divisionId) || !item.homeTeamId || !item.awayTeamId || typeof item.reason !== 'string')) throw new Error()
        setSuggestions({})
        setDraft({ input, games, unplaced, warnings: result.warnings, divisions: result.divisions, seasonId, mode })
      } catch {
        setError('The preview contained incomplete game details. Please try again.')
      }
    },
  })
  const save = useMutation({
    mutationFn: (body: (ScheduleInput | { availability: Availability }) & { games: SavedGame[]; divisionIds: string[] }) => leagueRequest(path, client, 'POST', body),
    onSuccess: () => { onUnsavedChange?.(false); onSaved() },
  })
  const pending = estimate.isFetching || preview.isPending || save.isPending
  useEffect(() => { onPendingChange?.(pending) }, [pending, onPendingChange])
  useEffect(() => { onUnsavedChange?.(!!draft && draft.seasonId === seasonId && draft.mode === mode) }, [draft, seasonId, mode, onUnsavedChange])
  useEffect(() => {
    if (draft && !wasPreviewed.current) previewHeading.current?.scrollIntoView({ block: 'start' })
    wasPreviewed.current = !!draft
  }, [draft])

  function changed() {
    setDraft(null)
    setSuggestions({})
    setError('')
    setShowCapacity(false)
    preview.reset()
    save.reset()
  }

  async function requestPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setDraft(null)
    if (!startDate || !endDate || startDate > endDate) { setError('Choose a valid date range.'); return }
    const windowError = validateWindows(windows)
    if (windowError) { setError(windowError); return }
    if (!venueIds.length) { setError('Choose at least one venue.'); return }
    if (!Number.isInteger(Number(duration)) || Number(duration) <= 0 || Number(duration) > 1440 || !duration || !Number.isInteger(Number(rest)) || Number(rest) < 0 || Number(rest) > 10080 || !rest) { setError('Enter a game duration from 1 to 1,440 minutes and a rest time from 0 to 10,080 minutes.'); return }
    if (!limitsValid) { setError('Enter a games-per-day limit from 1 to 10 and a court changeover from 0 to 240 minutes.'); return }
    try { new Intl.DateTimeFormat('en', { timeZone }).format() } catch { setError('Enter a valid IANA time zone, such as Asia/Manila.'); return }
    if (!timeZone.trim()) { setError('Enter a valid IANA time zone.'); return }
    if (!settingsKey) { setError('Check the scheduling settings and try again.'); return }
    setShowCapacity(true)
    const result = await estimate.refetch()
    if (result.error || !result.data || !result.data.required || result.data.capacity < result.data.required) {
      capacityHeading.current?.scrollIntoView({ block: 'start' })
      return
    }
    preview.mutate(JSON.parse(settingsKey) as ScheduleInput | { availability: Availability })
  }

  function saveSchedule() {
    if (!draft || draft.seasonId !== seasonId || draft.mode !== mode || !draft.games.length || !!draft.unplaced.length || pending || !validationReady || !!validation.data?.issues.length) return
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
  const venueName = (id: string) => venues.find((venue) => venue.id === id)?.name ?? ''
  const issues = validationReady ? validation.data?.issues ?? [] : []
  // Groups conflicts by type, counting each game once, so the summary can jump to the first one.
  const issueGroups = [...issues.reduce((groups, issue) => groups.set(issue.type ?? 'other', [...new Set([...(groups.get(issue.type ?? 'other') ?? []), issue.index])]), new Map<string, number[]>())]
  function focusGame(index: number) {
    setExpandedGame(String(index))
    window.setTimeout(() => document.getElementById(`schedule-game-trigger-${index}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0)
  }
  async function findSlots(key: string, target: { index: number } | { game: Pick<ScheduleGame, 'divisionId' | 'homeTeamId' | 'awayTeamId' | 'round' | 'stage'> }) {
    if (!draft) return
    if (invalidGameIndexes.length) { setSuggestions((current) => ({ ...current, [key]: { status: 'error', slots: [], error: 'Fix the edited game times first.' } })); return }
    setSuggestions((current) => ({ ...current, [key]: { status: 'loading', slots: [] } }))
    try {
      const result = await leagueRequest<{ suggestions: Slot[] }>(`${path}/suggest`, client, 'POST', { ...draft.input, games: draftGames, divisionIds: draft.divisions.filter((division) => division.reason === undefined).map((division) => division.id), target })
      setSuggestions((current) => ({ ...current, [key]: { status: 'done', slots: Array.isArray(result.suggestions) ? result.suggestions : [] } }))
    } catch (cause) {
      setSuggestions((current) => ({ ...current, [key]: { status: 'error', slots: [], error: cause instanceof Error ? cause.message : 'Open slots could not be loaded.' } }))
    }
  }
  function moveGame(index: number, slot: Slot) {
    setDraft((current) => current && { ...current, games: current.games.map((item, i) => {
      if (i !== index) return item
      const localTime = formatInZone(slot.scheduledAt, current.input.availability.timeZone)
      return { ...item, game: { ...item.game, scheduledAt: slot.scheduledAt }, localTime, originalLocalTime: localTime, venueId: slot.venueId, kept: true }
    }) })
    setSuggestions((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== `game-${index}`)))
  }
  function placeGame(position: number, slot: Slot) {
    setDraft((current) => {
      const item = current?.unplaced[position]
      if (!current || !item) return current
      const localTime = formatInZone(slot.scheduledAt, current.input.availability.timeZone)
      const game: ScheduleGame = { divisionId: item.divisionId, divisionName: item.divisionName, homeTeamId: item.homeTeamId, awayTeamId: item.awayTeamId, homeName: item.homeName, awayName: item.awayName,
        round: item.round, stage: item.stage, scheduledAt: slot.scheduledAt, venueId: slot.venueId, durationMinutes: current.input.availability.durationMinutes }
      return { ...current, unplaced: current.unplaced.filter((_, i) => i !== position), games: [...current.games, { game, localTime, originalLocalTime: localTime, venueId: slot.venueId, kept: true }] }
    })
    setSuggestions((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith('unplaced-'))))
  }
  function slotList(key: string, onUse: (slot: Slot) => void) {
    const state = suggestions[key]
    if (!state || !draft) return null
    if (state.status === 'loading') return <p className="text-sm text-muted-foreground" role="status">Finding open slots…</p>
    if (state.status === 'error') return <p className="text-sm text-destructive" role="alert">{state.error}</p>
    if (!state.slots.length) return <p className="text-sm text-muted-foreground" role="status">No open slot meets every rule. Change the settings or move another game.</p>
    return <ul aria-label="Open slots" className="flex flex-wrap gap-2">{state.slots.map((slot) => <li key={`${slot.scheduledAt}-${slot.venueId}`}>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => onUse(slot)}>Use {formatWallTime(formatInZone(slot.scheduledAt, draft.input.availability.timeZone))} · {venueName(slot.venueId)}</Button>
    </li>)}</ul>
  }
  function issueDetail(issue: Issue): string {
    if (!draft) return ''
    const team = issue.teamId ? draft.games.find((item) => item.game.homeTeamId === issue.teamId || item.game.awayTeamId === issue.teamId) : undefined
    const teamName = team ? (team.game.homeTeamId === issue.teamId ? team.game.homeName : team.game.awayName) : ''
    let related = ''
    if (issue.with?.kind === 'draft') {
      const other = draft.games[issue.with.index]
      if (other) related = `With ${other.game.homeName} vs ${other.game.awayName} · ${formatWallTime(other.localTime)} · ${venueName(other.venueId)}`
    } else if (issue.with?.kind === 'existing') {
      const id = issue.with.id
      const other = validation.data?.existingGames?.find((item) => item.id === id)
      related = other ? `With ${other.homeName} vs ${other.awayName} (${other.divisionName}) · ${formatWallTime(formatInZone(other.scheduledAt, draft.input.availability.timeZone))}${other.venueName ? ` · ${other.venueName}` : ''}` : 'With an existing game'
    }
    return [teamName, related].filter(Boolean).join(' · ')
  }
  const outsideSeason = draft?.games.some((item) => isOutsideSeason(item.localTime, seasonStart, seasonEnd)) ?? false
  const otherWarnings = draft?.warnings.filter((warning) => !/^some games are outside the season dates\.?$/i.test(warning.trim())) ?? []
  const reviewing = presentation === 'page' && !!hasPreview

  return <>
    {presentation === 'dialog' && <DialogHeader className="border-b px-6 py-5 pr-14">
      <DialogTitle>{mode === 'preliminary' ? 'Generate preliminary schedule' : 'Schedule playoff games'}</DialogTitle>
      <DialogDescription>{seasonName} <span aria-hidden="true">—</span> Set shared availability, then review each division’s games.</DialogDescription>
    </DialogHeader>}
    {presentation === 'page' && <ol aria-label="Schedule progress" className="flex flex-wrap gap-x-6 gap-y-2 border-b pb-5 text-sm">
      <li className={!reviewing ? 'font-medium' : 'text-muted-foreground'}>1. Setup</li>
      <li className={showCapacity && !reviewing ? 'font-medium' : 'text-muted-foreground'}>2. Capacity check</li>
      <li className={reviewing ? 'font-medium' : 'text-muted-foreground'}>3. Review schedule</li>
    </ol>}
    <form onSubmit={requestPreview} className="flex min-h-0 flex-1 flex-col">
      <div className={presentation === 'page' ? 'flex flex-col gap-7 py-6' : 'flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-6 py-6'}>
        <div hidden={reviewing} className={reviewing ? 'hidden' : 'flex flex-col gap-7'}>
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
          <div className="flex flex-col gap-1.5">
            <ScheduleDates id="schedule-blackout-dates" label="Blackout dates" values={blackoutDates} rangeStart={startDate} rangeEnd={endDate} disabled={pending} onChange={(values) => { setBlackoutDates(values); changed() }} />
            <p className="text-sm text-muted-foreground">No games are scheduled on these dates, such as holidays or venue closures.</p>
          </div>
          <FieldSet className="gap-3">
            <FieldLegend variant="label" className="mb-0">Team availability</FieldLegend>
            <p className="text-sm text-muted-foreground">Add dates when a team can’t play.</p>
            {teamRows.map((row, position) => <div key={row.id} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
              <Field><FieldLabel htmlFor={`schedule-team-${row.id}`}>Team</FieldLabel>
                <Select value={row.teamId || null} disabled={pending} items={teamOptions} onValueChange={(value) => { if (value) { setTeamRows((current) => current.map((item) => item.id === row.id ? { ...item, teamId: value } : item)); changed() } }}>
                  <SelectTrigger id={`schedule-team-${row.id}`} className="w-full"><SelectValue placeholder="Choose a team" /></SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}><SelectGroup>{teamOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
              </Field>
              <ScheduleDates id={`schedule-team-dates-${row.id}`} label="Unavailable dates" values={row.dates} rangeStart={startDate} rangeEnd={endDate} disabled={pending} onChange={(values) => { setTeamRows((current) => current.map((item) => item.id === row.id ? { ...item, dates: values } : item)); changed() }} />
              <Button type="button" variant="ghost" size="icon-sm" className="sm:mt-6" disabled={pending} aria-label={`Remove team availability ${position + 1}`} onClick={() => { setTeamRows((current) => current.filter((item) => item.id !== row.id)); changed() }}><Trash2Icon /></Button>
            </div>)}
            {status.isError && <p className="text-sm text-muted-foreground">Teams couldn’t be loaded, so team availability can’t be added right now.</p>}
            <div><Button type="button" variant="outline" size="sm" disabled={pending || !teamOptions.length || teamRows.length >= 200} onClick={() => { const id = nextTeamRowId.current++; setTeamRows((current) => [...current, { id, teamId: '', dates: [] }]) }}><PlusIcon data-icon="inline-start" />Add team availability</Button></div>
          </FieldSet>
        </section>

        <section className="flex flex-col gap-4 border-t pt-6" aria-labelledby="schedule-settings-heading">
          <div><h3 id="schedule-settings-heading" className="font-medium">Game settings</h3><p className="text-sm text-muted-foreground">Select courts and allow enough time between games.</p></div>
          <FieldSet className="gap-2"><FieldLegend variant="label" className="mb-0" required>Venues</FieldLegend>{venues.length ? <div className="grid gap-3 sm:grid-cols-2">{venues.map((venue) => <label key={venue.id} className="flex items-center gap-2 text-sm"><Checkbox checked={venueIds.includes(venue.id)} disabled={pending} onCheckedChange={(checked) => { setVenueIds((current) => checked ? [...current, venue.id] : current.filter((id) => id !== venue.id)); changed() }} />{venue.name}</label>)}</div> : <p className="text-sm text-muted-foreground">Add a venue before generating a schedule.</p>}</FieldSet>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="schedule-duration" required>Game duration (minutes)</FieldLabel><Input id="schedule-duration" type="number" min="1" step="1" required disabled={pending} value={duration} onChange={(e) => { setDuration(e.target.value); changed() }} /></Field>
            <Field><FieldLabel htmlFor="schedule-rest" required>Minimum rest (minutes)</FieldLabel><Input id="schedule-rest" type="number" min="0" step="1" required disabled={pending} value={rest} onChange={(e) => { setRest(e.target.value); changed() }} /></Field>
          </div>
          <Field><FieldLabel htmlFor="schedule-pace" required>Pacing</FieldLabel>
            <Select value={pace} disabled={pending} items={paces.map(({ value, label }) => ({ value, label }))} onValueChange={(value) => { const next = paces.find((item) => item.value === value); if (next) { setPace(next.value); changed() } }}>
              <SelectTrigger id="schedule-pace" aria-required="true" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent alignItemWithTrigger={false}><SelectGroup>{paces.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
            <FieldDescription>{paces.find((item) => item.value === pace)?.description}</FieldDescription>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="schedule-max-per-day" required>Max games per team per day</FieldLabel><Input id="schedule-max-per-day" type="number" min="1" max="10" step="1" required disabled={pending} value={maxPerDay} onChange={(e) => { setMaxPerDay(e.target.value); changed() }} /></Field>
            <Field><FieldLabel htmlFor="schedule-changeover" required>Court changeover (minutes)</FieldLabel><Input id="schedule-changeover" type="number" min="0" max="240" step="1" required disabled={pending} value={changeover} onChange={(e) => { setChangeover(e.target.value); changed() }} /><FieldDescription>Time to clear a court between games.</FieldDescription></Field>
          </div>
        </section>

        </div>

        {showCapacity && <section className="flex flex-col gap-3 border-t pt-6" aria-labelledby="schedule-capacity-heading">
          <div><h3 ref={capacityHeading} id="schedule-capacity-heading" className="scroll-mt-2 font-medium">Schedule capacity</h3><p className="text-sm text-muted-foreground">Check the number of games and available court slots before generating.</p></div>
          {estimate.isFetching && <p className="text-sm text-muted-foreground" role="status">Checking capacity…</p>}
          {!estimate.isFetching && estimate.isError && <Alert variant="destructive"><AlertTitle>Capacity check unavailable</AlertTitle><AlertDescription>{estimate.error.message} Try previewing again.</AlertDescription></Alert>}
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
        </section>}

        {draft && draft.seasonId === seasonId && draft.mode === mode && <section aria-labelledby="schedule-preview-heading" className="flex flex-col gap-4 border-t pt-6">
          <div><h3 ref={previewHeading} id="schedule-preview-heading" className="scroll-mt-2 font-medium">Review schedule · {draft.games.length} {draft.games.length === 1 ? 'game' : 'games'}</h3><p className="text-sm text-muted-foreground">Select a game to adjust its date, time or venue. Times are in {draft.input.availability.timeZone}.</p></div>
          {(outsideSeason || otherWarnings.length > 0) && <Alert role="status"><AlertTitle>Please review</AlertTitle><AlertDescription><ul className="list-disc pl-4">{outsideSeason && <li>Some games are outside the season dates.</li>}{otherWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></AlertDescription></Alert>}
          {!draft.games.length && <p className="text-sm text-muted-foreground">No games were returned for these settings.</p>}
          {invalidGameIndexes.length > 0 && <Alert variant="destructive" role="alert"><AlertTitle>Check the edited game times</AlertTitle><AlertDescription>Choose valid, unambiguous local times and available venues before saving.</AlertDescription></Alert>}
          {!invalidGameIndexes.length && !validationReady && !validation.isError && <p className="text-sm text-muted-foreground" role="status">Checking the preview for conflicts…</p>}
          {validationKey && settledValidation === validationKey && validation.isError && <Alert variant="destructive"><AlertTitle>Could not check this preview</AlertTitle><AlertDescription>{validation.error.message} <Button type="button" variant="link" size="sm" onClick={() => void validation.refetch()}>Retry</Button></AlertDescription></Alert>}
          {validationReady && !!issues.length && <Alert variant="destructive" role="alert"><AlertTitle>Resolve schedule conflicts</AlertTitle><AlertDescription>
            <p>Review the marked games below. Changes are checked again before saving.</p>
            <ul aria-label="Conflicts by type" className="mt-2 flex flex-wrap gap-2">{issueGroups.map(([type, indexes]) => <li key={type}><Button type="button" variant="outline" size="sm" onClick={() => focusGame(indexes[0])}>{issueLabels[type as IssueType] ?? 'Other conflicts'} · {indexes.length} {indexes.length === 1 ? 'game' : 'games'}</Button></li>)}</ul>
          </AlertDescription></Alert>}
          {validationReady && !validation.data?.issues.length && <p className="text-sm text-muted-foreground" role="status">No scheduling conflicts found.</p>}
          {draft.unplaced.length > 0 && <section aria-labelledby="schedule-unplaced-heading" className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
            <div><h4 id="schedule-unplaced-heading" className="font-medium">Needs a time · {draft.unplaced.length} {draft.unplaced.length === 1 ? 'game' : 'games'}</h4>
              <p className="text-sm text-muted-foreground">These games didn’t fit with the current settings. Find an open slot for each one before saving, or change the settings and preview again.</p></div>
            <ul className="flex flex-col divide-y">{draft.unplaced.map((item, position) => <li key={`${item.divisionId}-${item.round}-${item.homeTeamId}-${item.awayTeamId}`} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><p className="text-sm font-medium">{item.homeName} vs {item.awayName}</p><p className="text-xs text-muted-foreground">{item.divisionName} · Round {item.round}</p><p className="text-xs text-muted-foreground">{item.reason}</p></div>
                <Button type="button" variant="outline" size="sm" disabled={pending || suggestions[`unplaced-${position}`]?.status === 'loading'} onClick={() => void findSlots(`unplaced-${position}`, { game: { divisionId: item.divisionId, homeTeamId: item.homeTeamId, awayTeamId: item.awayTeamId, round: item.round, stage: item.stage } })}>Find open slots</Button>
              </div>
              {slotList(`unplaced-${position}`, (slot) => placeGame(position, slot))}
            </li>)}</ul>
          </section>}
          <SchedulePreviewCalendar games={draft.games.map((item, index) => ({ index, localTime: item.localTime, homeName: item.game.homeName, awayName: item.game.awayName, divisionName: item.game.divisionName, venueName: venues.find((venue) => venue.id === item.venueId)?.name ?? '', conflict: invalidGameIndexes.includes(index) || !!(validationReady && validation.data?.issues.some((issue) => issue.index === index)) }))}
            bookings={(calendar.data?.games ?? []).map((game) => ({ ...game, localTime: formatInZone(game.scheduledAt, draft.input.availability.timeZone), endDate: formatInZone(new Date(Date.parse(game.scheduledAt) + game.durationMinutes * 60_000 - 1).toISOString(), draft.input.availability.timeZone).slice(0, 10), venueName: venues.find((venue) => venue.id === game.venueId)?.name ?? '' }))}
            loading={calendar.isFetching} error={calendar.isError ? calendar.error.message : ''} onRetry={() => void calendar.refetch()}
            initialDate={draft.games[0]?.localTime.slice(0, 10) ?? draft.input.availability.startDate} rangeStart={draft.input.availability.startDate} rangeEnd={draft.input.availability.endDate} timeZone={draft.input.availability.timeZone}
            onSelect={focusGame} />
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
            <AccordionTrigger id={`schedule-game-trigger-${index}`} className="gap-3 px-4 hover:no-underline"><span className="flex min-w-0 flex-col gap-1"><span className="font-medium">{item.game.homeName} vs {item.game.awayName}</span><span className="text-xs font-normal text-muted-foreground">{{ preliminary: 'Preliminary', semifinal: 'Semifinal', final: 'Championship', third_place: 'Third place' }[item.game.stage]} · Round {item.game.round} · {formatWallTime(item.localTime)} · {venues.find((venue) => venue.id === item.venueId)?.name}</span>{invalidGameIndexes.includes(index) && <span className="text-xs text-destructive">Invalid or ambiguous local time or venue.</span>}{issues.filter((issue) => issue.index === index).map((issue, position) => <span key={position} className="flex flex-col text-xs"><span className="text-destructive">{issue.message}</span>{issueDetail(issue) && <span className="text-muted-foreground">{issueDetail(issue)}</span>}</span>)}</span></AccordionTrigger>
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
            <div className="flex flex-col gap-2">
              <div><Button type="button" variant="outline" size="sm" disabled={pending || suggestions[`game-${index}`]?.status === 'loading'} onClick={() => void findSlots(`game-${index}`, { index })}>Find open slots</Button></div>
              {slotList(`game-${index}`, (slot) => moveGame(index, slot))}
            </div>
            </AccordionContent>
          </AccordionItem>)}</Accordion>
              </div>)}
            </section>
          })}</div>
        </section>}
      </div>
      {(preview.isError || error || save.isError) && <div className="border-t px-6 py-3"><Alert variant="destructive" role="alert"><AlertTitle>Unable to continue</AlertTitle><AlertDescription>{error || (preview.isError ? preview.error.message : save.error?.message)}</AlertDescription></Alert></div>}
      <DialogFooter className={presentation === 'page' ? 'border-t py-4' : 'border-t px-6 py-4'}>
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button>
        {reviewing ? <Button type="button" variant="outline" disabled={pending} onClick={() => { if (confirmDiscardSchedulePreview()) { setDraft(null); setShowCapacity(false); preview.reset() } }}>Edit settings</Button> : <Button type="submit" variant={hasPreview ? 'outline' : 'default'} disabled={pending}>{estimate.isFetching ? 'Checking capacity…' : preview.isPending ? 'Generating preview…' : hasPreview ? 'Update preview' : 'Preview schedule'}</Button>}
        {draft && draft.seasonId === seasonId && draft.mode === mode && <Button type="button" disabled={pending || !draft.games.length || !!draft.unplaced.length || !validationReady || !!validation.data?.issues.length} onClick={saveSchedule}>{save.isPending ? 'Saving…' : 'Save schedule'}</Button>}
      </DialogFooter>
    </form>
  </>
}
