'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { leagueRequest } from '@/lib/league-client'

type ScheduleGame = {
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
type Preview = { games: ScheduleGame[]; warnings: string[] }
type SavedGame = Omit<ScheduleGame, 'homeName' | 'awayName'>
type GameDraft = { game: ScheduleGame; localTime: string; originalLocalTime: string; venueId: string }
type Props = {
  seasonId: string
  divisionId: string
  seasonName: string
  divisionName: string
  seasonStart: string | null
  seasonEnd: string | null
  venues: { id: string; name: string }[]
  teamCount: number
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
  return { homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, round: game.round, stage: game.stage, scheduledAt, venueId, durationMinutes: game.durationMinutes }
}

function isOutsideSeason(localTime: string, seasonStart: string | null, seasonEnd: string | null): boolean {
  const date = localTime.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  return (!!seasonStart && date < seasonStart.slice(0, 10)) || (!!seasonEnd && date > seasonEnd.slice(0, 10))
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
const selectClass = 'border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'
const subscribe = () => () => {}
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
const serverTimeZone = () => ''

export function ScheduleGenerator({ divisionId, seasonName, divisionName, seasonStart, seasonEnd, venues, teamCount, mode, onClose, onSaved, onPendingChange }: Props) {
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
  const [draft, setDraft] = useState<{ input: ScheduleInput | { availability: Availability }; games: GameDraft[]; warnings: string[] } | null>(null)
  const [error, setError] = useState('')
  const path = `divisions/${divisionId}/${mode === 'preliminary' ? 'schedule' : 'playoffs'}`

  const preview = useMutation({
    mutationFn: (input: ScheduleInput | { availability: Availability }) => leagueRequest<Preview>(`${path}/preview`, client, 'POST', input),
    onSuccess: (result, input) => {
      try {
        if (!Array.isArray(result.games) || !Array.isArray(result.warnings)) throw new Error()
        const games = result.games.map((game) => {
          if (!game.homeTeamId || !game.awayTeamId || !game.homeName || !game.awayName || !game.venueId || !Number.isFinite(Date.parse(game.scheduledAt))) throw new Error()
          const localTime = formatInZone(game.scheduledAt, input.availability.timeZone)
          return { game, localTime, originalLocalTime: localTime, venueId: game.venueId }
        })
        setDraft({ input, games, warnings: result.warnings })
      } catch {
        setError('The preview contained incomplete game details. Please try again.')
      }
    },
  })
  const save = useMutation({
    mutationFn: (body: (ScheduleInput | { availability: Availability }) & { games: SavedGame[] }) => leagueRequest(path, client, 'POST', body),
    onSuccess: onSaved,
  })
  const pending = preview.isPending || save.isPending
  useEffect(() => { onPendingChange?.(pending) }, [pending, onPendingChange])

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
    const availability: Availability = { startDate, endDate, windows: windows.map(({ weekdays, startTime, endTime }) => ({ weekdays: [...weekdays].sort(), startTime, endTime })), timeZone, venueIds, durationMinutes: Number(duration), restMinutes: Number(rest) }
    const input = mode === 'preliminary' ? { availability, format, playoffs: playoffs && teamCount >= 4, thirdPlace: playoffs && teamCount >= 4 && thirdPlace } : { availability }
    preview.mutate(input)
  }

  function saveSchedule() {
    if (!draft || !draft.games.length || pending) return
    setError('')
    const games: SavedGame[] = []
    for (const [index, item] of draft.games.entries()) {
      const scheduledAt = item.localTime === item.originalLocalTime ? item.game.scheduledAt : resolveZonedTime(item.localTime, draft.input.availability.timeZone)
      if (!scheduledAt) { setError(`Game ${index + 1} has an invalid, skipped, or repeated local time. Choose a different time.`); return }
      if (!draft.input.availability.venueIds.includes(item.venueId)) { setError(`Choose an available venue for game ${index + 1}.`); return }
      games.push(gameForSave(item.game, scheduledAt, item.venueId))
    }
    save.mutate({ ...draft.input, games })
  }

  const outsideSeason = draft?.games.some((item) => isOutsideSeason(item.localTime, seasonStart, seasonEnd)) ?? false
  const otherWarnings = draft?.warnings.filter((warning) => !/^some games are outside the season dates\.?$/i.test(warning.trim())) ?? []

  return <>
    <DialogHeader className="pr-8">
      <DialogTitle>{mode === 'preliminary' ? 'Generate preliminary schedule' : 'Schedule playoff games'}</DialogTitle>
      <DialogDescription>{seasonName} · {divisionName}. Review the proposed games before saving.</DialogDescription>
    </DialogHeader>
    <form onSubmit={requestPreview} className="flex flex-col gap-5">
      {mode === 'preliminary' && <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">A preliminary schedule can only be generated when this division has no existing preliminary games. Existing games will not be replaced.</p>}
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="schedule-start-date" required>Start date</FieldLabel><Input id="schedule-start-date" type="date" required value={startDate} onChange={(e) => { setStartDate(e.target.value); changed() }} /></Field>
          <Field><FieldLabel htmlFor="schedule-end-date" required>End date</FieldLabel><Input id="schedule-end-date" type="date" required value={endDate} onChange={(e) => { setEndDate(e.target.value); changed() }} /></Field>
        </div>
        <div className="space-y-3"><div><h3 className="text-sm font-medium">Recurring playing windows</h3><p className="text-sm text-muted-foreground">Choose the days and hours when games can be played.</p></div>
          {windows.map((window, position) => <fieldset key={window.id} className="space-y-3 rounded-md border p-3"><legend className="px-1 text-sm font-medium">Window {position + 1}</legend>
            <fieldset className="space-y-2"><legend className="text-sm font-medium">Weekdays <span aria-hidden="true" className="text-destructive">*</span></legend><div className="flex flex-wrap gap-x-4 gap-y-3">{weekdays.map((day, index) => <label key={day} className="flex items-center gap-2 text-sm"><Checkbox checked={window.weekdays.includes(index)} onCheckedChange={(checked) => { setWindows((current) => current.map((item) => item.id === window.id ? { ...item, weekdays: checked ? [...item.weekdays, index] : item.weekdays.filter((value) => value !== index) } : item)); changed() }} />{day}</label>)}</div></fieldset>
            <div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor={`schedule-window-${window.id}-start`} required>Start time</FieldLabel><Input id={`schedule-window-${window.id}-start`} type="time" required value={window.startTime} onChange={(e) => { const value = e.target.value; setWindows((current) => current.map((item) => item.id === window.id ? { ...item, startTime: value } : item)); changed() }} /></Field><Field><FieldLabel htmlFor={`schedule-window-${window.id}-end`} required>End time</FieldLabel><Input id={`schedule-window-${window.id}-end`} type="time" required value={window.endTime} onChange={(e) => { const value = e.target.value; setWindows((current) => current.map((item) => item.id === window.id ? { ...item, endTime: value } : item)); changed() }} /></Field></div>
            {windows.length > 1 && <Button type="button" variant="outline" size="sm" onClick={() => { setWindows((current) => current.filter((item) => item.id !== window.id)); changed() }}>Remove window {position + 1}</Button>}
          </fieldset>)}
          <Button type="button" variant="outline" size="sm" disabled={windows.length >= 20} onClick={() => { const id = nextWindowId.current++; setWindows((current) => [...current, { id, weekdays: [], startTime: '09:00', endTime: '17:00' }]); changed() }}>Add playing window</Button>
        </div>
        <Field><FieldLabel htmlFor="schedule-zone" required>Time zone</FieldLabel><Input id="schedule-zone" required value={timeZone} onChange={(e) => { setZoneOverride(e.target.value); changed() }} placeholder="Asia/Manila" /><FieldDescription>Use an IANA time zone. All times below use this zone, including daylight-saving changes.</FieldDescription></Field>
        <fieldset className="space-y-2"><legend className="text-sm font-medium">Venues <span aria-hidden="true" className="text-destructive">*</span></legend>{venues.length ? <div className="flex flex-wrap gap-x-5 gap-y-3">{venues.map((venue) => <label key={venue.id} className="flex items-center gap-2 text-sm"><Checkbox checked={venueIds.includes(venue.id)} onCheckedChange={(checked) => { setVenueIds((current) => checked ? [...current, venue.id] : current.filter((id) => id !== venue.id)); changed() }} />{venue.name}</label>)}</div> : <p className="text-sm text-muted-foreground">Add a venue before generating a schedule.</p>}</fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="schedule-duration" required>Game duration (minutes)</FieldLabel><Input id="schedule-duration" type="number" min="1" step="1" required value={duration} onChange={(e) => { setDuration(e.target.value); changed() }} /></Field>
          <Field><FieldLabel htmlFor="schedule-rest" required>Rest between games (minutes)</FieldLabel><Input id="schedule-rest" type="number" min="0" step="1" required value={rest} onChange={(e) => { setRest(e.target.value); changed() }} /></Field>
        </div>
        {mode === 'preliminary' && <>
          <Field><FieldLabel htmlFor="schedule-format" required>Round-robin format</FieldLabel><select id="schedule-format" required className={selectClass} value={format} onChange={(e) => { setFormat(e.target.value as 'single' | 'double'); changed() }}><option value="single">Single round robin</option><option value="double">Double round robin</option></select></Field>
          <div className="space-y-3"><label className="flex items-center gap-2 text-sm"><Checkbox checked={playoffs && teamCount >= 4} disabled={teamCount < 4} onCheckedChange={(checked) => { setPlayoffs(checked); if (!checked) setThirdPlace(false); changed() }} />Include playoffs</label>{teamCount < 4 && <p className="text-sm text-muted-foreground">Playoffs require at least four teams.</p>}{playoffs && teamCount >= 4 && <label className="flex items-center gap-2 text-sm"><Checkbox checked={thirdPlace} onCheckedChange={(checked) => { setThirdPlace(checked); changed() }} />Include a third-place game</label>}</div>
        </>}
        <div><Button type="submit" variant="outline" disabled={pending || !venues.length}>{preview.isPending ? 'Generating preview…' : draft ? 'Generate preview again' : 'Preview schedule'}</Button></div>
      </fieldset>
      {preview.isError && <p role="alert" className="text-sm text-destructive">{preview.error.message}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {draft && <section aria-labelledby="schedule-preview-heading" className="space-y-3">
        <div><h3 id="schedule-preview-heading" className="font-medium">Preview · {draft.games.length} {draft.games.length === 1 ? 'game' : 'games'}</h3><p className="text-sm text-muted-foreground">Times are in {draft.input.availability.timeZone}. Repeated or skipped daylight-saving times cannot be entered when editing.</p></div>
        {(outsideSeason || otherWarnings.length > 0) && <div role="status" className="rounded-md border p-3 text-sm"><p className="font-medium">Please review</p><ul className="mt-1 list-disc space-y-1 pl-5">{outsideSeason && <li>Some games are outside the season dates.</li>}{otherWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
        {!draft.games.length && <p className="text-sm text-muted-foreground">No games were returned for these settings.</p>}
        <div className="space-y-3">{draft.games.map((item, index) => <div key={index} className="space-y-3 rounded-md border p-3">
          <div><p className="text-sm font-medium">{item.game.homeName} vs {item.game.awayName}</p><p className="text-xs text-muted-foreground">{{ preliminary: 'Preliminary', semifinal: 'Semifinal', final: 'Championship', third_place: 'Third place' }[item.game.stage]} · Round {item.game.round}</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field><FieldLabel htmlFor={`schedule-game-time-${index}`} required>Date and time</FieldLabel><Input id={`schedule-game-time-${index}`} type="datetime-local" required value={item.localTime} disabled={pending} onChange={(e) => { const value = e.target.value; setDraft((current) => current && { ...current, games: current.games.map((game, i) => i === index ? { ...game, localTime: value } : game) }); setError('') }} />{item.localTime === item.originalLocalTime && <FieldDescription>Preview offset: {new Intl.DateTimeFormat('en', { timeZone: draft.input.availability.timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date(item.game.scheduledAt)).find((part) => part.type === 'timeZoneName')?.value}</FieldDescription>}</Field>
            <Field><FieldLabel htmlFor={`schedule-game-venue-${index}`} required>Venue</FieldLabel><select id={`schedule-game-venue-${index}`} required className={selectClass} value={item.venueId} disabled={pending} onChange={(e) => { const value = e.target.value; setDraft((current) => current && { ...current, games: current.games.map((game, i) => i === index ? { ...game, venueId: value } : game) }); setError('') }}><option value="">Choose a venue</option>{venues.filter((venue) => draft.input.availability.venueIds.includes(venue.id)).map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></Field>
          </div>
        </div>)}</div>
      </section>}
      {save.isError && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button><Button type="button" disabled={pending || !draft?.games.length} onClick={saveSchedule}>{save.isPending ? 'Saving…' : 'Save schedule'}</Button></DialogFooter>
    </form>
  </>
}
