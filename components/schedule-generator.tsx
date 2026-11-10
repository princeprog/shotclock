'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format as formatDate, isValid, parseISO } from 'date-fns'
import { CalendarDaysIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
  const previewHeading = useRef<HTMLHeadingElement>(null)
  const wasPreviewed = useRef(false)
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
    <DialogHeader className="border-b px-6 py-5 pr-14">
      <DialogTitle>{mode === 'preliminary' ? 'Generate preliminary schedule' : 'Schedule playoff games'}</DialogTitle>
      <DialogDescription>{seasonName} · {divisionName} <span aria-hidden="true">—</span> Set your availability, then review each game.</DialogDescription>
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
            <label className="flex items-center gap-3 text-sm font-medium"><Checkbox checked={playoffs && teamCount >= 4} disabled={pending || teamCount < 4} onCheckedChange={(checked) => { setPlayoffs(checked); if (!checked) setThirdPlace(false); changed() }} />Include playoffs</label>
            <p className="pl-7 text-sm text-muted-foreground">{teamCount < 4 ? 'Playoffs require at least four teams.' : 'The top four teams advance to single-elimination semifinals.'}</p>
            {playoffs && teamCount >= 4 && <label className="flex items-center gap-3 pl-7 text-sm"><Checkbox checked={thirdPlace} disabled={pending} onCheckedChange={(checked) => { setThirdPlace(checked); changed() }} />Include a third-place game</label>}
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

        {draft && <section aria-labelledby="schedule-preview-heading" className="flex flex-col gap-4 border-t pt-6">
          <div><h3 ref={previewHeading} id="schedule-preview-heading" className="scroll-mt-2 font-medium">Review schedule · {draft.games.length} {draft.games.length === 1 ? 'game' : 'games'}</h3><p className="text-sm text-muted-foreground">Select a game to adjust its date, time or venue. Times are in {draft.input.availability.timeZone}.</p></div>
          {(outsideSeason || otherWarnings.length > 0) && <Alert role="status"><AlertTitle>Please review</AlertTitle><AlertDescription><ul className="list-disc pl-4">{outsideSeason && <li>Some games are outside the season dates.</li>}{otherWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></AlertDescription></Alert>}
          {!draft.games.length && <p className="text-sm text-muted-foreground">No games were returned for these settings.</p>}
          <Accordion className="overflow-hidden rounded-lg border">{draft.games.map((item, index) => <AccordionItem key={index} value={String(index)}>
            <AccordionTrigger className="gap-3 px-4 hover:no-underline"><span className="flex min-w-0 flex-col gap-1"><span className="font-medium">{item.game.homeName} vs {item.game.awayName}</span><span className="text-xs font-normal text-muted-foreground">{{ preliminary: 'Preliminary', semifinal: 'Semifinal', final: 'Championship', third_place: 'Third place' }[item.game.stage]} · Round {item.game.round} · {formatWallTime(item.localTime)} · {venues.find((venue) => venue.id === item.venueId)?.name}</span></span></AccordionTrigger>
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
        </section>}
      </div>
      {(preview.isError || error || save.isError) && <div className="border-t px-6 py-3"><Alert variant="destructive" role="alert"><AlertTitle>Unable to continue</AlertTitle><AlertDescription>{error || (preview.isError ? preview.error.message : save.error?.message)}</AlertDescription></Alert></div>}
      <DialogFooter className="border-t px-6 py-4">
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button>
        <Button type="submit" variant={draft ? 'outline' : 'default'} disabled={pending || !venues.length}>{preview.isPending ? 'Generating preview…' : draft ? 'Update preview' : 'Preview schedule'}</Button>
        {draft && <Button type="button" disabled={pending || !draft.games.length} onClick={saveSchedule}>{save.isPending ? 'Saving…' : 'Save schedule'}</Button>}
      </DialogFooter>
    </form>
  </>
}
