'use client'

import { useState, useSyncExternalStore } from 'react'
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

type ProposedGame = { index: number; localTime: string; homeName: string; awayName: string; divisionName: string; venueName: string; conflict: boolean }
type Booking = { id: string; localTime: string; endDate: string; homeName: string; awayName: string; divisionName: string; venueName: string }
type Props = { games: ProposedGame[]; bookings: Booking[]; loading: boolean; error: string; onRetry: () => void; initialDate: string; rangeStart: string; rangeEnd: string; timeZone: string; onSelect: (index: number) => void }

const subscribe = (callback: () => void) => {
  const media = window.matchMedia('(max-width: 639px)')
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}
const isSmall = () => window.matchMedia('(max-width: 639px)').matches
const serverSmall = () => false

export function SchedulePreviewCalendar({ games, bookings, loading, error, onRetry, initialDate, rangeStart, rangeEnd, timeZone, onSelect }: Props) {
  const small = useSyncExternalStore(subscribe, isSmall, serverSmall)
  const [chosenView, setChosenView] = useState<'day' | 'week' | null>(null)
  const [anchor, setAnchor] = useState(initialDate)
  const view = chosenView ?? (small ? 'day' : 'week')
  const start = view === 'week' ? startOfWeek(parseISO(anchor)) : parseISO(anchor)
  const days = Array.from({ length: view === 'week' ? 7 : 1 }, (_, index) => addDays(start, index))
  const draftDates = games.map((game) => game.localTime.slice(0, 10)).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
  const firstDate = [rangeStart, ...draftDates].sort()[0]
  const lastDate = [rangeEnd, ...draftDates].sort().at(-1) ?? rangeEnd
  const previousEnd = format(addDays(start, -1), 'yyyy-MM-dd')
  const nextStart = format(addDays(start, view === 'week' ? 7 : 1), 'yyyy-MM-dd')

  return <div className="flex flex-col gap-3" aria-label="Schedule calendar">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h4 className="font-medium">Calendar preview</h4><p className="text-xs text-muted-foreground">{timeZone} · Proposed games are editable; existing games are read-only.</p></div>
      <ToggleGroup value={[view]} onValueChange={(values) => { if (values[0] === 'day' || values[0] === 'week') setChosenView(values[0]) }} variant="outline" size="sm" aria-label="Calendar view">
        <ToggleGroupItem value="day">Day</ToggleGroupItem><ToggleGroupItem value="week">Week</ToggleGroupItem>
      </ToggleGroup>
    </div>
    <div className="flex items-center justify-between gap-2">
      <Button type="button" variant="outline" size="icon-sm" aria-label={`Previous ${view}`} disabled={previousEnd < firstDate} onClick={() => setAnchor(format(addDays(parseISO(anchor), view === 'week' ? -7 : -1), 'yyyy-MM-dd'))}><ChevronLeftIcon /></Button>
      <p className="text-sm font-medium">{format(days[0], 'MMM d, yyyy')}{view === 'week' ? ` – ${format(days[6], 'MMM d, yyyy')}` : ''}</p>
      <Button type="button" variant="outline" size="icon-sm" aria-label={`Next ${view}`} disabled={nextStart > lastDate} onClick={() => setAnchor(format(addDays(parseISO(anchor), view === 'week' ? 7 : 1), 'yyyy-MM-dd'))}><ChevronRightIcon /></Button>
    </div>
    {loading && <p className="text-sm text-muted-foreground" role="status">Loading existing games…</p>}
    {error && <Alert variant="destructive"><AlertTitle>Existing games could not be loaded</AlertTitle><AlertDescription>{error} <Button type="button" variant="link" size="sm" onClick={onRetry}>Retry</Button></AlertDescription></Alert>}
    {(format(days[0], 'yyyy-MM-dd') < rangeStart || format(days[days.length - 1], 'yyyy-MM-dd') > rangeEnd) && <p className="text-xs text-muted-foreground">Existing games outside the selected date range may not be shown.</p>}
    <div className="overflow-x-auto rounded-lg border">
      <div className={view === 'week' ? 'grid min-w-[840px] grid-cols-7' : 'grid grid-cols-1'}>
        {days.map((date) => {
          const day = format(date, 'yyyy-MM-dd')
          const items = [
            ...games.filter((game) => game.localTime.slice(0, 10) === day).map((game) => ({ ...game, key: `draft-${game.index}`, kind: 'proposed' as const })),
            ...bookings.filter((game) => game.localTime.slice(0, 10) <= day && game.endDate >= day).map((game) => ({ ...game, key: `existing-${game.id}`, kind: 'existing' as const })),
          ].sort((a, b) => a.localTime.localeCompare(b.localTime))
          return <div key={day} className="min-h-36 border-r p-2 last:border-r-0">
            <p className="mb-2 text-xs font-medium">{format(date, 'EEE, MMM d')}</p>
            <div className="flex flex-col gap-2">{items.map((item) => {
              const content = <><span className="font-medium">{item.localTime.slice(11, 16)} · {item.homeName} vs {item.awayName}</span><span>{item.divisionName} · {item.venueName}</span><span>{item.kind === 'existing' ? 'Existing game' : item.conflict ? 'Conflict · Edit game' : 'Proposed · Edit game'}</span></>
              return item.kind === 'proposed'
                ? <button key={item.key} type="button" onClick={() => onSelect(item.index)} className="flex flex-col gap-1 rounded-md border bg-muted/50 p-2 text-left text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{content}</button>
                : <div key={item.key} className="flex flex-col gap-1 rounded-md border border-dashed p-2 text-xs text-muted-foreground">{content}</div>
            })}</div>
          </div>
        })}
      </div>
    </div>
  </div>
}
