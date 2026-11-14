'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format as formatDate, isValid, parseISO } from 'date-fns'
import { CalendarDaysIcon, CalendarSearchIcon, ChevronRightIcon, CircleAlertIcon, CircleCheckIcon, CircleHelpIcon, LoaderCircleIcon, PlusIcon, RefreshCwIcon, RotateCcwIcon, Trash2Icon, XIcon } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
type DivisionPreview = { id: string; name: string; teamCount: number; reason?: string; playoffs?: boolean; playoffStage?: string | null; gameCount?: number; gamesPerTeam?: number }
type Unplaced = Pick<ScheduleGame, 'divisionId' | 'divisionName' | 'homeTeamId' | 'awayTeamId' | 'homeName' | 'awayName' | 'round' | 'stage'> & { reason: string; reasonCode?: string }
type Preview = { games: ScheduleGame[]; warnings: string[]; divisions: DivisionPreview[]; unplaced?: Unplaced[] }
type Slot = { scheduledAt: string; venueId: string }
type Suggestions = { status: 'loading' | 'done' | 'error'; slots: Slot[]; error?: string }
type Estimate = { capacity: number; required: number; divisions: DivisionPreview[]; maxGamesPerTeam?: number | null; limitedBy?: 'weekly' | 'daily' | null }
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

function fixtureKey(game: Pick<ScheduleGame, 'divisionId' | 'stage' | 'round' | 'homeTeamId' | 'awayTeamId'>): string {
  return [game.divisionId, game.stage, game.round, game.homeTeamId, game.awayTeamId].join(':')
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

// A compact wall-time label for review rows, such as "Sat, Jan 2, 9:00 AM".
function formatGameSlot(value: string): string {
  const date = new Date(`${value}:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

// Each reason the capacity check blocks a preview, in plain terms, with the settings that would fix it.
type CapacityFix = { text: string; action?: { kind: 'spread'; label: string } | { kind: 'courts'; label: string } | { kind: 'daily'; value: number; label: string } }
type CapacityBlocker = { title: string; detail: string; short?: string; divisions?: string[]; fixes: CapacityFix[] }
const plural = (count: number, word: string) => count.toLocaleString('en-US') + ' ' + word + (count === 1 ? '' : 's')
function capacityBlockers(estimate: Estimate, context: { startDate: string; endDate: string; selectedCourts: number; totalCourts: number; maxPerDay: number }): CapacityBlocker[] {
  const blockers: CapacityBlocker[] = []
  const ready = estimate.divisions.filter((division) => division.reason === undefined)
  if (estimate.required === 0) {
    blockers.push({ title: 'No divisions are ready to schedule', detail: 'Each division needs at least two teams and no existing preliminary games.',
      fixes: estimate.divisions.filter((division) => division.reason).map((division) => ({ text: division.name + ': ' + division.reason })) })
    return blockers
  }
  const start = parseISO(context.startDate)
  const end = parseISO(context.endDate)
  const days = isValid(start) && isValid(end) ? Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1 : 0
  const range = isValid(start) && isValid(end) ? formatDate(start, 'MMM d') + ' and ' + formatDate(end, 'MMM d, yyyy') : 'these dates'
  const freeCourts = context.totalCourts - context.selectedCourts
  const courtsFix = { kind: 'courts' as const, label: 'Select all courts' }
  if (estimate.capacity === 0) {
    blockers.push({ title: 'No open court time', detail: 'The selected dates, playing windows and courts don’t leave room for a single game.',
      fixes: [{ text: 'Make each playing window longer than one game plus changeover.' }, { text: 'Choose playing days that fall between the start and end dates.' }, { text: 'Check for blackout dates or existing games filling the selected courts.' }] })
  } else if (estimate.capacity < estimate.required) {
    const shortfall = estimate.required - estimate.capacity
    const fixes: CapacityFix[] = []
    const extraCourts = Math.ceil(shortfall / (estimate.capacity / Math.max(1, context.selectedCourts)))
    if (freeCourts > 0) fixes.push(extraCourts <= freeCourts ? { text: 'Select ' + plural(extraCourts, 'more court') + '.', action: courtsFix }
      : { text: freeCourts === 1 ? 'Select the other court and add playing time.' : 'Select all ' + context.totalCourts + ' courts and add playing time.', action: courtsFix })
    if (days >= 7) fixes.push({ text: 'Extend the end date by about ' + plural(Math.ceil(shortfall / (estimate.capacity / (days / 7))), 'week') + '.' })
    fixes.push({ text: 'Add playing days, lengthen playing windows or shorten games.' })
    blockers.push({ title: 'Not enough court time', detail: plural(shortfall, 'game') + (shortfall === 1 ? ' doesn’t' : ' don’t') + ' fit in the selected dates, playing windows and courts.', fixes })
  }
  const limit = estimate.maxGamesPerTeam
  if (limit !== null && limit !== undefined) {
    const short = ready.filter((division) => (division.gamesPerTeam ?? 0) > limit)
    if (short.length) {
      const most = Math.max(...short.map((division) => division.gamesPerTeam ?? 0))
      const divisions = short.map((division) => division.name)
      if (estimate.limitedBy === 'weekly') {
        blockers.push({ title: 'Weekly pacing needs more weeks', short: plural(most - limit, 'week') + ' short', divisions,
          detail: 'Each team plays up to ' + plural(most, 'game') + ', one per week, but only ' + plural(limit, 'week') + ' fit between ' + range + '.',
          fixes: [{ text: 'Extend the end date by ' + plural(most - limit, 'week') + '.' }, { text: 'Switch pacing to Spread across dates.', action: { kind: 'spread', label: 'Use Spread' } }] })
      } else {
        const perDay = Math.max(1, context.maxPerDay)
        const playingDays = Math.floor(limit / perDay)
        const neededDays = Math.ceil(most / perDay)
        const raise = playingDays > 0 ? Math.ceil(most / playingDays) : 0
        blockers.push({ title: 'Not enough playing days', short: plural(neededDays - playingDays, 'day') + ' short', divisions,
          detail: 'Each team plays up to ' + plural(most, 'game') + ', but these dates have ' + plural(playingDays, 'playing day') + ' at ' + perDay + ' per team per day.',
          fixes: [{ text: 'Add playing days or extend the dates to reach ' + plural(neededDays, 'playing day') + '.' },
            ...(raise > perDay && raise <= 10 ? [{ text: 'Allow ' + raise + ' games per team per day.', action: { kind: 'daily' as const, value: raise, label: 'Allow ' + raise } }] : [])] })
      }
    }
  }
  return blockers
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
  team: 'Team overlap', venue: 'Court booked', window: 'Outside playing hours', round: 'Round order',
  blackout: 'Blackout date', unavailable: 'Team unavailable', daily_limit: 'Daily limit', weekly_limit: 'Weekly pacing',
}
// Short reasons for games that could not be placed; the full explanation stays available on hover.
const unplacedReasons: Record<string, string> = {
  no_days: 'No playing days in the date range', short_windows: 'Playing windows are shorter than a game', capacity: 'Not enough court time',
  rest: 'Minimum rest leaves no open slot', limits: 'Pacing or team limits leave no open date', round_order: 'No open slot after the previous round',
  spread: 'Later dates are full', teams_busy: 'Teams are busy at every open slot', venues_busy: 'Courts are booked at every open slot', mixed: 'No slot fits every rule',
}
const stageLabels: Record<ScheduleGame['stage'], string> = { preliminary: 'Preliminary', semifinal: 'Semifinal', final: 'Championship', third_place: 'Third place' }
const paces: { value: Pace; label: string; description: string }[] = [
  { value: 'weekly', label: 'Weekly', description: 'Each team’s games are at least 7 days apart.' },
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

function ScheduleDates({ id, label, hideLabel = false, values, rangeStart, rangeEnd, disabled, onChange }: { id: string; label: string; hideLabel?: boolean; values: string[]; rangeStart: string; rangeEnd: string; disabled: boolean; onChange: (values: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const selected = values.map((value) => parseISO(value)).filter(isValid)
  const start = rangeStart ? parseISO(rangeStart) : undefined
  return <Field>
    <FieldLabel htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>{label}</FieldLabel>
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
  const blockerContext = { startDate, endDate, selectedCourts: venueIds.length, totalCourts: venues.length, maxPerDay: Number(maxPerDay) }
  const blockers = estimateReady && estimate.data ? capacityBlockers(estimate.data, blockerContext) : []
  const validationReady = !!validationKey && settledValidation === validationKey && !validation.isFetching && !!validation.data && !validation.isError

  const preview = useMutation({
    mutationFn: (input: (ScheduleInput | { availability: Availability }) & { pinned?: SavedGame[] }) => leagueRequest<Preview>(`${path}/preview`, client, 'POST', input),
    onSuccess: (result, { pinned, ...input }) => {
      try {
        // Kept games come back where the organizer put them; remember what the generator first chose so they can be reverted.
        const keptSlots = new Set((pinned ?? []).map((game) => `${fixtureKey(game)}@${game.scheduledAt}@${game.venueId}`))
        const generatedSlots = new Map((draft?.games ?? []).map((item) => [fixtureKey(item.game), item.generated]))
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
          const kept = keptSlots.has(`${fixtureKey(game)}@${game.scheduledAt}@${game.venueId}`)
          return { game, localTime, originalLocalTime: localTime, venueId: game.venueId, kept, generated: kept ? generatedSlots.get(fixtureKey(game)) : { scheduledAt: game.scheduledAt, venueId: game.venueId } }
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

  // A quick fix updates the setting, then reruns the capacity check with the new settings once they render.
  const recheckCapacity = useRef(false)
  useEffect(() => {
    if (!recheckCapacity.current || !settingsKey) return
    recheckCapacity.current = false
    void checkCapacity()
  })
  function applyFix(action: NonNullable<CapacityFix['action']>) {
    if (action.kind === 'spread') setPace('spread')
    else if (action.kind === 'courts') setVenueIds(venues.map((venue) => venue.id))
    else setMaxPerDay(String(action.value))
    setDraft(null)
    setSuggestions({})
    setError('')
    preview.reset()
    save.reset()
    recheckCapacity.current = true
  }

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
    await checkCapacity()
  }

  // The capacity dialog stays open only when something blocks the preview; otherwise the preview starts right away.
  async function checkCapacity() {
    setShowCapacity(true)
    const result = await estimate.refetch()
    if (result.error || !result.data || capacityBlockers(result.data, blockerContext).length) return
    setShowCapacity(false)
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
  const totalGames = draft ? draft.games.length + draft.unplaced.length : 0
  const keptCount = draft?.games.filter((item) => item.kept).length ?? 0
  const conflictCount = new Set([...issues.map((issue) => issue.index), ...invalidGameIndexes]).size
  const reviewDates = [...new Set((draft?.games ?? []).map((item) => item.localTime.slice(0, 10)).filter((value) => isValid(parseISO(value))))].sort()
  const firstDate = reviewDates[0]
  const lastDate = reviewDates[reviewDates.length - 1]
  const dateRange = !firstDate ? '' : firstDate === lastDate ? formatDate(parseISO(firstDate), 'MMM d, yyyy')
    : `${formatDate(parseISO(firstDate), firstDate.slice(0, 4) === lastDate.slice(0, 4) ? 'MMM d' : 'MMM d, yyyy')} – ${formatDate(parseISO(lastDate), 'MMM d, yyyy')}`
  const includedCount = draft?.divisions.filter((division) => division.reason === undefined).length ?? 0
  const reviewFacts = draft ? [`${includedCount} ${includedCount === 1 ? 'division' : 'divisions'}`, dateRange, draft.input.availability.timeZone].filter(Boolean).join(' · ') : ''
  const validationFailed = !!validationKey && settledValidation === validationKey && validation.isError
  const reviewStatus = !draft?.games.length ? null
    : invalidGameIndexes.length ? <Badge variant="destructive"><CircleAlertIcon data-icon="inline-start" />Check edited times</Badge>
      : validationFailed ? <span className="flex items-center gap-1 text-sm text-destructive">Couldn’t check conflicts<Button type="button" variant="link" size="sm" className="h-auto px-1" onClick={() => void validation.refetch()}>Retry</Button></span>
        : !validationReady ? <Badge variant="secondary"><LoaderCircleIcon data-icon="inline-start" className="animate-spin" />Checking</Badge>
          : conflictCount ? <Badge variant="destructive"><CircleAlertIcon data-icon="inline-start" />{conflictCount} {conflictCount === 1 ? 'conflict' : 'conflicts'}</Badge>
            : <Badge variant="secondary"><CircleCheckIcon data-icon="inline-start" />No conflicts</Badge>
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
  function revertGame(index: number) {
    setDraft((current) => current && { ...current, games: current.games.map((item, i) => {
      if (i !== index || !item.generated) return item
      const localTime = formatInZone(item.generated.scheduledAt, current.input.availability.timeZone)
      return { ...item, game: { ...item.game, scheduledAt: item.generated.scheduledAt }, localTime, originalLocalTime: localTime, venueId: item.generated.venueId, kept: false }
    }) })
    setError('')
  }
  function regenerate() {
    if (!draft) return
    const pinned = draft.games.flatMap((item, index) => item.kept ? [draftGames[index]] : [])
    if (invalidGameIndexes.length || pinned.some((game) => !game)) { setError('Fix the edited game times before regenerating.'); return }
    setError('')
    preview.mutate({ ...draft.input, pinned })
  }
  // A dragged game keeps its time of day; the conflict check runs again on the new date.
  function moveToDay(index: number, day: string) {
    setDraft((current) => current && { ...current, games: current.games.map((item, i) => i === index ? { ...item, localTime: `${day}T${item.localTime.slice(11, 16)}`, kept: true } : item) })
    setError('')
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
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => onUse(slot)}>Use {formatGameSlot(formatInZone(slot.scheduledAt, draft.input.availability.timeZone))} · {venueName(slot.venueId)}</Button>
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
  const notices = [...(outsideSeason ? ['Some games are outside the season dates.'] : []), ...otherWarnings]
  const reviewing = presentation === 'page' && !!hasPreview
  const summaryDates = [startDate, endDate].every((date) => date && isValid(parseISO(date)))
    ? `${formatDate(parseISO(startDate), 'MMM d, yyyy')} – ${formatDate(parseISO(endDate), 'MMM d, yyyy')}` : 'Dates not set'
  const dateControls = <div className="grid gap-4 sm:grid-cols-2">
    <ScheduleDate id="schedule-start-date" label="Start date" value={startDate} disabled={pending} onChange={(value) => { setStartDate(value); changed() }} />
    <ScheduleDate id="schedule-end-date" label="End date" value={endDate} disabled={pending} onChange={(value) => { setEndDate(value); changed() }} />
  </div>
  const panel = (fallback: string) => presentation === 'page' ? 'flex flex-col gap-5 rounded-xl border bg-card p-5' : fallback
  const panelHeading = (id: string, title: string, meta?: ReactNode) => <div className="flex min-h-7 items-center justify-between gap-3"><h3 id={id} className="text-base font-semibold">{title}</h3>{meta}</div>
  const allVenuesSelected = venues.length > 0 && venues.every((venue) => venueIds.includes(venue.id))
  const unavailableTeams = teamRows.filter((row) => row.teamId && row.dates.length).length
  const optionsSummary = [timeZone, blackoutDates.length ? blackoutDates.length + ' blackout ' + (blackoutDates.length === 1 ? 'date' : 'dates') : '', unavailableTeams ? unavailableTeams + ' ' + (unavailableTeams === 1 ? 'team' : 'teams') + ' unavailable' : ''].filter(Boolean).join(' · ')
  const playingDays = weekdays.filter((_, index) => windows.some((window) => window.weekdays.includes(index)))
  const summaryItems = [format === 'single' ? 'Single round robin' : 'Double round robin', summaryDates, playingDays.length ? playingDays.join(', ') : 'No playing days', venueIds.length + ' ' + (venueIds.length === 1 ? 'court' : 'courts'), paces.find((item) => item.value === pace)?.label ?? '']

  return <>
    {presentation === 'dialog' && <DialogHeader className="border-b px-6 py-5 pr-14">
      <DialogTitle>{mode === 'preliminary' ? 'Generate preliminary schedule' : 'Schedule playoff games'}</DialogTitle>
      <DialogDescription>{seasonName} <span aria-hidden="true">—</span> Set shared availability, then review each division’s games.</DialogDescription>
    </DialogHeader>}
    {presentation === 'page' && <ol aria-label="Schedule progress" className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b pb-5 text-sm">
      {[{ label: 'Setup', active: !reviewing && !showCapacity }, { label: 'Capacity check', active: !reviewing && showCapacity }, { label: 'Review schedule', active: reviewing }].map((step, index) => <li key={step.label} aria-current={step.active ? 'step' : undefined} className={`flex items-center gap-2 ${step.active ? 'font-medium' : 'text-muted-foreground'}`}><span className={`flex size-6 items-center justify-center rounded-full border text-xs tabular-nums ${step.active ? 'border-foreground bg-foreground text-background' : ''}`}>{index + 1}</span>{step.label}</li>)}
    </ol>}
    <form onSubmit={requestPreview} className="flex min-h-0 flex-1 flex-col">
      <div className={presentation === 'page' ? 'flex flex-col gap-7 pb-6' : 'flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-6 py-6'}>
        <div hidden={reviewing} className={reviewing ? 'hidden' : presentation === 'page' ? 'grid grid-cols-1 items-start gap-4 lg:grid-cols-2' : 'flex flex-col gap-7'}>
        <div className={presentation === 'page' ? 'contents lg:flex lg:flex-col lg:gap-4' : 'contents'}>
        {mode === 'preliminary' && <section className={panel('flex flex-col gap-4')} aria-labelledby="schedule-format-heading">
          {panelHeading('schedule-format-heading', 'Competition')}
          <Field><FieldLabel htmlFor="schedule-format" required>Format</FieldLabel>
            <Select value={format} disabled={pending} items={[{ value: 'single', label: 'Single round robin' }, { value: 'double', label: 'Double round robin' }]} onValueChange={(value) => { if (value === 'single' || value === 'double') { setFormat(value); changed() } }}>
              <SelectTrigger id="schedule-format" aria-required="true" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent alignItemWithTrigger={false}><SelectGroup><SelectItem value="single">Single round robin</SelectItem><SelectItem value="double">Double round robin</SelectItem></SelectGroup></SelectContent>
            </Select>
            <FieldDescription>{format === 'single' ? 'Teams meet once.' : 'Teams meet twice, home and away.'}</FieldDescription>
          </Field>
          <div className="flex flex-col gap-3 border-t pt-4">
            <label className="flex items-start gap-3 text-sm"><Checkbox className="mt-0.5" checked={playoffs} disabled={pending} onCheckedChange={(checked) => { setPlayoffs(checked); if (!checked) setThirdPlace(false); changed() }} /><span className="flex flex-col gap-0.5"><span className="font-medium">Include playoffs</span><span className="text-muted-foreground">Top four teams advance to semifinals.</span></span></label>
            {playoffs && <label className="flex items-center gap-3 pl-7 text-sm"><Checkbox checked={thirdPlace} disabled={pending} onCheckedChange={(checked) => { setThirdPlace(checked); changed() }} />Include a third-place game</label>}
          </div>
        </section>}

        <section className={panel('flex flex-col gap-4 border-t pt-6')} aria-labelledby="schedule-dates-heading">
          {panelHeading('schedule-dates-heading', 'Availability')}
          {dateControls}
          {windows.map((window, position) => <div key={window.id} className="flex flex-col gap-3 border-t pt-4">
            <div className="flex min-h-7 items-center justify-between gap-3"><p className="text-sm font-medium">Playing window {position + 1} <span className="font-normal text-muted-foreground">· Weekly</span></p>{windows.length > 1 && <Button type="button" variant="ghost" size="icon-sm" disabled={pending} aria-label={'Remove playing window ' + (position + 1)} onClick={() => { setWindows((current) => current.filter((item) => item.id !== window.id)); changed() }}><Trash2Icon /></Button>}</div>
            <FieldSet className="gap-2"><FieldLegend variant="label" className="mb-0" required>Playing days</FieldLegend>
              <ToggleGroup multiple variant="outline" size="sm" disabled={pending} aria-label={'Playing days for window ' + (position + 1)} className="w-full flex-wrap" value={window.weekdays.map(String)} onValueChange={(values) => { setWindows((current) => current.map((item) => item.id === window.id ? { ...item, weekdays: values.map(Number) } : item)); changed() }}>
                {weekdays.map((day, index) => <ToggleGroupItem key={day} value={String(index)} aria-label={day} className="min-w-11 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/90 aria-pressed:hover:text-primary-foreground">{day}</ToggleGroupItem>)}
              </ToggleGroup>
            </FieldSet>
            <div className={presentation === 'page' ? 'grid gap-4 2xl:grid-cols-2' : 'grid gap-4 sm:grid-cols-2'}>
              <ScheduleTime id={'schedule-window-' + window.id + '-start'} label="Start time" value={window.startTime} disabled={pending} onChange={(value) => { setWindows((current) => current.map((item) => item.id === window.id ? { ...item, startTime: value } : item)); changed() }} />
              <ScheduleTime id={'schedule-window-' + window.id + '-end'} label="End time" value={window.endTime} disabled={pending} onChange={(value) => { setWindows((current) => current.map((item) => item.id === window.id ? { ...item, endTime: value } : item)); changed() }} />
            </div>
          </div>)}
          <div><Button type="button" variant="outline" size="sm" disabled={pending || windows.length >= 20} onClick={() => { const id = nextWindowId.current++; setWindows((current) => [...current, { id, weekdays: [], startTime: '09:00', endTime: '17:00' }]); changed() }}><PlusIcon data-icon="inline-start" />Add playing window</Button></div>
          <details className="group border-t pt-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-sm text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-1.5"><ChevronRightIcon aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />More options</span>
              <span className="truncate text-xs font-normal text-muted-foreground">{optionsSummary}</span>
            </summary>
            <div className="flex flex-col gap-5 pt-4">
              <Field><FieldLabel htmlFor="schedule-zone" required>Time zone</FieldLabel><Input id="schedule-zone" aria-required="true" disabled={pending} value={timeZone} onChange={(e) => { setZoneOverride(e.target.value); changed() }} placeholder="Asia/Manila" /></Field>
              <ScheduleDates id="schedule-blackout-dates" label="Blackout dates" values={blackoutDates} rangeStart={startDate} rangeEnd={endDate} disabled={pending} onChange={(values) => { setBlackoutDates(values); changed() }} />
              <FieldSet className="gap-3">
                <FieldLegend variant="label" className="mb-0">Team unavailable dates</FieldLegend>
                {teamRows.map((row, position) => <div key={row.id} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
                  <Field><FieldLabel htmlFor={'schedule-team-' + row.id} className="sr-only">Team</FieldLabel>
                    <Select value={row.teamId || null} disabled={pending} items={teamOptions} onValueChange={(value) => { if (value) { setTeamRows((current) => current.map((item) => item.id === row.id ? { ...item, teamId: value } : item)); changed() } }}>
                      <SelectTrigger id={'schedule-team-' + row.id} className="w-full"><SelectValue placeholder="Choose a team" /></SelectTrigger>
                      <SelectContent alignItemWithTrigger={false}><SelectGroup>{teamOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
                    </Select>
                  </Field>
                  <ScheduleDates id={'schedule-team-dates-' + row.id} label="Unavailable dates" hideLabel values={row.dates} rangeStart={startDate} rangeEnd={endDate} disabled={pending} onChange={(values) => { setTeamRows((current) => current.map((item) => item.id === row.id ? { ...item, dates: values } : item)); changed() }} />
                  <Button type="button" variant="ghost" size="icon-sm" className="sm:mt-1" disabled={pending} aria-label={'Remove team availability ' + (position + 1)} onClick={() => { setTeamRows((current) => current.filter((item) => item.id !== row.id)); changed() }}><Trash2Icon /></Button>
                </div>)}
                {status.isError && <p className="text-sm text-muted-foreground">Teams couldn’t be loaded.</p>}
                <div><Button type="button" variant="outline" size="sm" disabled={pending || !teamOptions.length || teamRows.length >= 200} onClick={() => { const id = nextTeamRowId.current++; setTeamRows((current) => [...current, { id, teamId: '', dates: [] }]) }}><PlusIcon data-icon="inline-start" />Add team availability</Button></div>
              </FieldSet>
            </div>
          </details>
        </section>
        </div>

        <div className={presentation === 'page' ? 'contents lg:flex lg:flex-col lg:gap-4' : 'contents'}>
        <section className={panel('flex flex-col gap-4 border-t pt-6')} aria-labelledby="schedule-courts-heading">
          {panelHeading('schedule-courts-heading', 'Courts', venues.length > 0 && <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="tabular-nums">{venueIds.length} of {venues.length}</span><Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs" disabled={pending} onClick={() => { setVenueIds(allVenuesSelected ? [] : venues.map((venue) => venue.id)); changed() }}>{allVenuesSelected ? 'Clear' : 'Select all'}</Button></div>)}
          <FieldSet className="gap-0"><FieldLegend variant="label" className="sr-only" required>Venues</FieldLegend>
            {venues.length ? <div className="flex flex-col divide-y border-y">{venues.map((venue) => <label key={venue.id} className="flex cursor-pointer items-center gap-3 py-2.5 text-sm"><Checkbox checked={venueIds.includes(venue.id)} disabled={pending} onCheckedChange={(checked) => { setVenueIds((current) => checked ? [...current, venue.id] : current.filter((id) => id !== venue.id)); changed() }} />{venue.name}</label>)}</div> : <p className="text-sm text-muted-foreground">Add a venue before generating a schedule.</p>}
          </FieldSet>
        </section>

        <section className={panel('flex flex-col gap-4 border-t pt-6')} aria-labelledby="schedule-settings-heading">
          {panelHeading('schedule-settings-heading', 'Game rules')}
          <Field><div className="flex items-center gap-1.5"><FieldLabel htmlFor="schedule-pace" required>Pacing</FieldLabel>
            <Popover><PopoverTrigger openOnHover delay={200} closeDelay={150} render={<Button type="button" variant="ghost" size="icon-xs" aria-label="Explain pacing options" />}><CircleHelpIcon aria-hidden="true" /></PopoverTrigger>
              <PopoverContent align="start" side="top" aria-label="Pacing options" className="w-72 gap-2 text-xs">
                {paces.map((item) => <p key={item.value}><span className="font-medium">{item.label}:</span> {item.description}</p>)}
              </PopoverContent>
            </Popover></div>
            <Select value={pace} disabled={pending} items={paces.map(({ value, label }) => ({ value, label }))} onValueChange={(value) => { const next = paces.find((item) => item.value === value); if (next) { setPace(next.value); changed() } }}>
              <SelectTrigger id="schedule-pace" aria-required="true" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent alignItemWithTrigger={false}><SelectGroup>{paces.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="schedule-duration" required>Game length (min)</FieldLabel><Input id="schedule-duration" type="number" min="1" step="1" required disabled={pending} value={duration} onChange={(e) => { setDuration(e.target.value); changed() }} /></Field>
            <Field><FieldLabel htmlFor="schedule-rest" required>Minimum rest (min)</FieldLabel><Input id="schedule-rest" type="number" min="0" step="1" required disabled={pending} value={rest} onChange={(e) => { setRest(e.target.value); changed() }} /></Field>
            <Field><FieldLabel htmlFor="schedule-max-per-day" required>Games per team per day</FieldLabel><Input id="schedule-max-per-day" type="number" min="1" max="10" step="1" required disabled={pending} value={maxPerDay} onChange={(e) => { setMaxPerDay(e.target.value); changed() }} /></Field>
            <Field><FieldLabel htmlFor="schedule-changeover" required>Court changeover (min)</FieldLabel><Input id="schedule-changeover" type="number" min="0" max="240" step="1" required disabled={pending} value={changeover} onChange={(e) => { setChangeover(e.target.value); changed() }} /></Field>
          </div>
        </section>
        </div>
        </div>

        {draft && draft.seasonId === seasonId && draft.mode === mode && <section aria-labelledby="schedule-preview-heading" className={reviewing ? 'flex flex-col gap-6' : 'flex flex-col gap-6 border-t pt-6'}>
          <div className="flex flex-col divide-y rounded-lg border">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 ref={previewHeading} id="schedule-preview-heading" className="scroll-mt-2 text-base font-semibold tabular-nums">{totalGames} {totalGames === 1 ? 'game' : 'games'}</h3>
                <p className="text-sm text-muted-foreground">{reviewFacts}</p>
              </div>
              <div role="status" className="flex flex-wrap items-center gap-2">
                {draft.unplaced.length > 0 && <Badge variant="outline">{draft.unplaced.length} not scheduled</Badge>}
                {reviewStatus}
              </div>
            </div>
            {issueGroups.length > 0 && <ul aria-label="Conflicts by type" className="flex flex-wrap gap-2 px-4 py-3">{issueGroups.map(([type, indexes]) => <li key={type}>
              <Button type="button" variant="outline" size="sm" aria-label={`${issueLabels[type as IssueType] ?? 'Other'}: ${indexes.length} ${indexes.length === 1 ? 'game' : 'games'}`} onClick={() => focusGame(indexes[0])}>
                <span className="size-1.5 rounded-full bg-destructive" aria-hidden="true" />{issueLabels[type as IssueType] ?? 'Other'}<span className="tabular-nums text-muted-foreground">{indexes.length}</span>
              </Button>
            </li>)}</ul>}
            {keptCount > 0 && <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
              <span className="text-muted-foreground">{keptCount} kept in place</span>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={regenerate}><RefreshCwIcon data-icon="inline-start" />Regenerate other games</Button>
            </div>}
            {notices.length > 0 && <ul className="flex flex-col gap-1 px-4 py-3 text-sm text-muted-foreground">{notices.map((notice) => <li key={notice} className="flex items-start gap-2"><CircleAlertIcon className="mt-0.5 size-4 shrink-0" />{notice}</li>)}</ul>}
          </div>
          {!draft.games.length && !draft.unplaced.length && <p className="text-sm text-muted-foreground">No games were returned for these settings.</p>}
          {draft.unplaced.length > 0 && <section aria-labelledby="schedule-unplaced-heading" className="flex flex-col gap-2">
            <h4 id="schedule-unplaced-heading" className="text-sm font-semibold">Not scheduled</h4>
            <ul className="divide-y rounded-lg border border-dashed">{draft.unplaced.map((item, position) => <li key={`${item.divisionId}-${item.round}-${item.homeTeamId}-${item.awayTeamId}`} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="min-w-0"><p className="text-sm font-medium">{item.homeName} vs {item.awayName}</p><p className="text-xs text-muted-foreground">{item.divisionName} · Round {item.round} · <span title={item.reason}>{unplacedReasons[item.reasonCode ?? ''] ?? item.reason}</span></p></div>
                <Button type="button" variant="outline" size="sm" disabled={pending || suggestions[`unplaced-${position}`]?.status === 'loading'} onClick={() => void findSlots(`unplaced-${position}`, { game: { divisionId: item.divisionId, homeTeamId: item.homeTeamId, awayTeamId: item.awayTeamId, round: item.round, stage: item.stage } })}><CalendarSearchIcon data-icon="inline-start" />Find open slots</Button>
              </div>
              {slotList(`unplaced-${position}`, (slot) => placeGame(position, slot))}
            </li>)}</ul>
          </section>}
          <SchedulePreviewCalendar games={draft.games.map((item, index) => ({ index, localTime: item.localTime, homeName: item.game.homeName, awayName: item.game.awayName, divisionName: item.game.divisionName, venueName: venueName(item.venueId), conflict: invalidGameIndexes.includes(index) || issues.some((issue) => issue.index === index) }))}
            bookings={(calendar.data?.games ?? []).map((game) => ({ ...game, localTime: formatInZone(game.scheduledAt, draft.input.availability.timeZone), endDate: formatInZone(new Date(Date.parse(game.scheduledAt) + game.durationMinutes * 60_000 - 1).toISOString(), draft.input.availability.timeZone).slice(0, 10), venueName: venueName(game.venueId) }))}
            loading={calendar.isFetching} error={calendar.isError ? calendar.error.message : ''} onRetry={() => void calendar.refetch()}
            initialDate={reviewDates[0] ?? draft.input.availability.startDate} rangeStart={draft.input.availability.startDate} rangeEnd={draft.input.availability.endDate} timeZone={draft.input.availability.timeZone}
            onSelect={focusGame} onMove={moveToDay} />
          <div className="flex flex-col gap-8">{draft.divisions.map((division) => {
            const divisionGames = draft.games.map((item, index) => ({ item, index })).filter(({ item }) => item.game.divisionId === division.id)
            const rounds = [...new Set(divisionGames.map(({ item }) => item.game.round))].sort((a, b) => a - b)
            const note = division.reason !== undefined ? `Skipped · ${division.reason}`
              : mode === 'preliminary' && 'playoffs' in draft.input && draft.input.playoffs && division.teamCount < 4 ? 'Round robin only (fewer than four teams)'
                : mode === 'preliminary' && 'playoffs' in draft.input && draft.input.playoffs && division.playoffs === false ? 'No playoffs'
                  : mode === 'playoffs' && division.playoffStage ? stageLabels[division.playoffStage as ScheduleGame['stage']] ?? '' : ''
            return <section key={division.id} className="flex flex-col gap-3" aria-labelledby={`schedule-division-${division.id}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b pb-2">
                <h4 id={`schedule-division-${division.id}`} className="font-semibold">{division.name}</h4>
                <p className="text-sm text-muted-foreground">{[note, division.reason === undefined ? `${divisionGames.length} ${divisionGames.length === 1 ? 'game' : 'games'}` : ''].filter(Boolean).join(' · ')}</p>
              </div>
              {rounds.map((round) => <div key={round} className="flex flex-col gap-1.5">
                <h5 className="text-xs font-medium text-muted-foreground">Round {round}</h5>
                <Accordion value={expandedGame ? [expandedGame] : []} onValueChange={(value) => setExpandedGame(value[0] ?? null)} className="overflow-hidden rounded-lg border">{divisionGames.filter(({ item }) => item.game.round === round).sort((a, b) => a.item.localTime.localeCompare(b.item.localTime)).map(({ item, index }) => {
                  const gameIssues = issues.filter((issue) => issue.index === index)
                  const invalid = invalidGameIndexes.includes(index)
                  return <AccordionItem key={index} value={String(index)}>
                    <AccordionTrigger id={`schedule-game-trigger-${index}`} className="items-center gap-3 px-4 py-2.5 hover:no-underline">
                      <span className="grid min-w-0 flex-1 gap-x-4 gap-y-0.5 text-left sm:grid-cols-[10.5rem_minmax(0,1fr)_7rem] sm:items-center">
                        <span className="text-sm font-normal tabular-nums text-muted-foreground">{formatGameSlot(item.localTime)}</span>
                        <span className="flex min-w-0 items-center gap-2 font-medium"><span className="truncate">{item.game.homeName} vs {item.game.awayName}</span>{item.game.stage !== 'preliminary' && <Badge variant="secondary">{stageLabels[item.game.stage]}</Badge>}{item.kept && <Badge variant="outline">Kept</Badge>}
                          {(invalid || gameIssues.length > 0) && <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-destructive"><CircleAlertIcon className="size-3.5" />{invalid ? 'Check time' : issueLabels[gameIssues[0].type as IssueType] ?? 'Conflict'}{gameIssues.length > 1 && <span className="tabular-nums">+{gameIssues.length - 1}</span>}</span>}</span>
                        <span className="truncate text-sm font-normal text-muted-foreground">{venueName(item.venueId)}</span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="flex flex-col gap-4 px-4 pb-4">
                      {(invalid || gameIssues.length > 0) && <ul aria-label="Conflicts" className="flex flex-col gap-2 rounded-md bg-destructive/5 px-3 py-2 text-sm">
                        {invalid && <li className="text-destructive">Choose a valid time and an available venue.</li>}
                        {gameIssues.map((issue, position) => <li key={position}><p className="text-destructive">{issue.message}</p>{issueDetail(issue) && <p className="text-xs text-muted-foreground">{issueDetail(issue)}</p>}</li>)}
                      </ul>}
                      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr_1fr]">
                        <ScheduleDate id={`schedule-game-date-${index}`} label="Date" value={item.localTime.slice(0, 10)} disabled={pending} onChange={(value) => { setDraft((current) => current && { ...current, games: current.games.map((game, i) => i === index ? { ...game, localTime: `${value}T${game.localTime.slice(11, 16)}`, kept: true } : game) }); setError('') }} />
                        <ScheduleTime id={`schedule-game-time-${index}`} label="Time" value={item.localTime.slice(11, 16)} disabled={pending} onChange={(value) => { setDraft((current) => current && { ...current, games: current.games.map((game, i) => i === index ? { ...game, localTime: `${game.localTime.slice(0, 10)}T${value}`, kept: true } : game) }); setError('') }} />
                        <Field><FieldLabel htmlFor={`schedule-game-venue-${index}`} required>Venue</FieldLabel>
                          <Select value={item.venueId} disabled={pending} items={venues.filter((venue) => draft.input.availability.venueIds.includes(venue.id)).map((venue) => ({ value: venue.id, label: venue.name }))} onValueChange={(value) => { if (value) { setDraft((current) => current && { ...current, games: current.games.map((game, i) => i === index ? { ...game, venueId: value, kept: true } : game) }); setError('') } }}>
                            <SelectTrigger id={`schedule-game-venue-${index}`} aria-required="true" className="w-full"><SelectValue placeholder="Choose a venue" /></SelectTrigger>
                            <SelectContent alignItemWithTrigger={false}><SelectGroup>{venues.filter((venue) => draft.input.availability.venueIds.includes(venue.id)).map((venue) => <SelectItem key={venue.id} value={venue.id}>{venue.name}</SelectItem>)}</SelectGroup></SelectContent>
                          </Select>
                        </Field>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" size="sm" disabled={pending || suggestions[`game-${index}`]?.status === 'loading'} onClick={() => void findSlots(`game-${index}`, { index })}><CalendarSearchIcon data-icon="inline-start" />Find open slots</Button>
                        {item.kept && item.generated && <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => revertGame(index)}><RotateCcwIcon data-icon="inline-start" />Revert</Button>}
                      </div>
                      {slotList(`game-${index}`, (slot) => moveGame(index, slot))}
                    </AccordionContent>
                  </AccordionItem>
                })}</Accordion>
              </div>)}
            </section>
          })}</div>
        </section>}

      </div>
      {(preview.isError || error || save.isError) && <div className="border-t px-6 py-3"><Alert variant="destructive" role="alert"><AlertTitle>Unable to continue</AlertTitle><AlertDescription>{error || (preview.isError ? preview.error.message : save.error?.message)}</AlertDescription></Alert></div>}
      <DialogFooter className={presentation === 'page' ? 'sticky bottom-0 z-10 flex-row flex-wrap items-center justify-end border-t bg-background py-3 sm:py-4' : 'border-t px-6 py-4'}>
        {presentation === 'page' && !reviewing && <p className="mr-auto hidden flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground md:flex">
          {summaryItems.map((item, index) => <span key={index} className="flex items-center gap-2.5">{index > 0 && <span aria-hidden="true" className="size-1 rounded-full bg-border" />}<span className={index === 0 ? 'font-medium text-foreground' : undefined}>{item}</span></span>)}
        </p>}

        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button>
        {reviewing ? <Button type="button" variant="outline" disabled={pending} onClick={() => { if (confirmDiscardSchedulePreview()) { setDraft(null); setShowCapacity(false); preview.reset() } }}>Edit settings</Button> : <Button type="submit" variant={hasPreview ? 'outline' : 'default'} disabled={pending}>{estimate.isFetching ? 'Checking capacity…' : preview.isPending ? 'Generating preview…' : hasPreview ? 'Update preview' : 'Preview schedule'}</Button>}
        {draft && draft.seasonId === seasonId && draft.mode === mode && <Button type="button" disabled={pending || !draft.games.length || !!draft.unplaced.length || !validationReady || !!validation.data?.issues.length} onClick={saveSchedule}>{save.isPending ? 'Saving…' : 'Save schedule'}</Button>}
      </DialogFooter>
    </form>
    {showCapacity && <Dialog open onOpenChange={(open) => { if (!open && !estimate.isFetching) setShowCapacity(false) }}>
      <DialogContent showCloseButton={!estimate.isFetching} aria-labelledby="schedule-capacity-heading" className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <DialogHeader className="gap-1.5 px-6 pt-6 pr-12 pb-5">
          <DialogTitle id="schedule-capacity-heading" className="text-lg font-semibold">{estimate.isFetching ? 'Checking capacity' : estimate.isError ? 'Capacity check unavailable' : blockers.length ? 'Schedule can’t be generated yet' : 'Capacity looks good'}</DialogTitle>
          <DialogDescription>{estimate.isFetching ? 'Comparing the games needed with open court time.' : estimate.isError ? estimate.error.message : blockers.length ? (blockers.length === 1 ? 'One setting needs to change before the preview.' : blockers.length + ' settings need to change before the preview.') : 'Generating the preview.'}</DialogDescription>
        </DialogHeader>
        {estimate.isFetching && <div role="status" className="flex items-center gap-2.5 px-6 pb-6 text-sm text-muted-foreground"><LoaderCircleIcon aria-hidden="true" className="size-4 animate-spin" />This takes a moment.</div>}
        {estimateReady && estimate.data && blockers.length > 0 && <div className="flex flex-col gap-5 px-6 pb-6">
          {estimate.data.required > 0 && <dl className="grid grid-cols-2 overflow-hidden rounded-lg bg-muted/60">
            <div className="flex flex-col gap-1 px-4 py-3"><dt className="text-xs text-muted-foreground">Games needed</dt><dd className="text-2xl font-semibold tabular-nums">{estimate.data.required.toLocaleString('en-US')}</dd></div>
            <div className="flex flex-col gap-1 border-l border-background px-4 py-3"><dt className="text-xs text-muted-foreground">Open court slots</dt><dd className="flex items-baseline gap-2"><span className="text-2xl font-semibold tabular-nums">{estimate.data.capacity.toLocaleString('en-US')}</span>{estimate.data.capacity < estimate.data.required ? <span className="text-xs font-medium text-destructive">{(estimate.data.required - estimate.data.capacity).toLocaleString('en-US')} short</span> : <span className="text-xs text-muted-foreground">Enough</span>}</dd></div>
          </dl>}
          <ul aria-label="What’s blocking the schedule" className="flex flex-col divide-y">
            {blockers.map((blocker) => <li key={blocker.title} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <h4 className="flex items-center gap-2.5 text-sm font-semibold"><CircleAlertIcon aria-hidden="true" className="size-4 shrink-0 text-destructive" />{blocker.title}</h4>
                {blocker.short && <span className="shrink-0 text-xs font-medium text-destructive">{blocker.short}</span>}
              </div>
              <p className="pl-6.5 text-sm text-muted-foreground">{blocker.detail}</p>
              {blocker.divisions && <ul aria-label="Affected divisions" className="flex flex-wrap gap-1.5 pl-6.5">{blocker.divisions.map((name) => <li key={name}><Badge variant="secondary">{name}</Badge></li>)}</ul>}
              {blocker.fixes.length > 0 && <ul aria-label="How to fix" className="mt-1 flex flex-col gap-1.5 pl-6.5">{blocker.fixes.map((fix) => <li key={fix.text} className="flex min-h-9 items-center justify-between gap-3 rounded-md bg-muted/50 py-1.5 pr-1.5 pl-3 text-sm">
                <span>{fix.text}</span>
                {fix.action && <Button type="button" variant="outline" size="sm" className="shrink-0 bg-background" onClick={() => applyFix(fix.action!)}>{fix.action.label}</Button>}
              </li>)}</ul>}
            </li>)}
          </ul>
          {estimate.data.required > 0 && estimate.data.divisions.some((division) => division.reason) && <div className="flex flex-col gap-1.5 border-t pt-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Not included</p>
            <ul className="flex flex-col gap-1">{estimate.data.divisions.filter((division) => division.reason).map((division) => <li key={division.id}>{division.name} · {division.reason}</li>)}</ul>
          </div>}
        </div>}
        {!estimate.isFetching && (estimate.isError || blockers.length > 0) && <DialogFooter className="rounded-b-xl border-t bg-muted/40 px-6 py-4">
          {estimate.isError ? <>
            <Button type="button" variant="outline" onClick={() => setShowCapacity(false)}>Close</Button>
            <Button type="button" onClick={() => void checkCapacity()}>Try again</Button>
          </> : <Button type="button" onClick={() => setShowCapacity(false)}>Edit settings</Button>}
        </DialogFooter>}
      </DialogContent>
    </Dialog>}
  </>
}
