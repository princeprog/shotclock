'use client'

import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import { ChevronLeftIcon, ChevronRightIcon, CircleAlertIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

type ProposedGame = { index: number; localTime: string; homeName: string; awayName: string; divisionName: string; venueName: string; conflict: boolean }
type Booking = { id: string; localTime: string; endDate: string; homeName: string; awayName: string; divisionName: string; venueName: string }
type Props = { games: ProposedGame[]; bookings: Booking[]; loading: boolean; error: string; onRetry: () => void; initialDate: string; rangeStart: string; rangeEnd: string; timeZone: string; onSelect: (index: number) => void; onMove?: (index: number, day: string) => void }

const instructions = 'Press Enter to edit this game. To move it to another day, press Space, use the arrow keys, then press Space again to drop it or Escape to cancel.'

// Wall-time labels such as "9:00 AM", independent of the browser's time zone.
function formatClock(localTime: string): string {
  const date = new Date(`${localTime}:00Z`)
  return Number.isNaN(date.getTime()) ? localTime.slice(11, 16) : new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' }).format(date)
}

function DayColumn({ day, droppable, children }: { day: string; droppable: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: day, disabled: !droppable })
  return <div ref={setNodeRef} data-day={day} className={`flex min-h-28 flex-col gap-2 border-r p-2 transition-colors last:border-r-0 ${isOver ? 'bg-muted' : ''}`}>{children}</div>
}

function DraggableGame({ index, draggable, label, className, onSelect, children }: { index: number; draggable: boolean; label: string; className: string; onSelect: () => void; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `draft-${index}`, data: { index }, disabled: !draggable })
  return <button ref={setNodeRef} type="button" onClick={onSelect} {...(draggable ? { ...attributes, ...listeners } : {})} aria-label={label}
    style={{ transform: CSS.Translate.toString(transform) }} className={`${className} ${draggable ? 'cursor-grab touch-none' : ''} ${isDragging ? 'relative z-10 opacity-80 shadow-md' : ''}`}>{children}</button>
}

const subscribe = (callback: () => void) => {
  const media = window.matchMedia('(max-width: 639px)')
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}
const isSmall = () => window.matchMedia('(max-width: 639px)').matches
const serverSmall = () => false

export function SchedulePreviewCalendar({ games, bookings, loading, error, onRetry, initialDate, rangeStart, rangeEnd, onSelect, onMove }: Props) {
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
  const sameYear = format(days[0], 'yyyy') === format(days[days.length - 1], 'yyyy')
  // Space starts a keyboard drag so Enter keeps opening the game; a short pointer move starts a mouse or touch drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }))
  const draggable = view === 'week' && !!onMove
  const columns = days.map((date) => {
    const day = format(date, 'yyyy-MM-dd')
    const items = [
      ...games.filter((game) => game.localTime.slice(0, 10) === day).map((game) => ({ ...game, key: `draft-${game.index}`, kind: 'proposed' as const })),
      ...bookings.filter((game) => game.localTime.slice(0, 10) <= day && game.endDate >= day).map((game) => ({ ...game, key: `existing-${game.id}`, kind: 'existing' as const, conflict: false })),
    ].sort((a, b) => a.localTime.localeCompare(b.localTime))
    return { date, day, items }
  })
  // Days without games stay as narrow drop targets so busy days get the width.
  const template = view === 'week' ? columns.map(({ items }) => items.length ? 'minmax(8.5rem, 1fr)' : 'minmax(5rem, 0.5fr)').join(' ') : undefined
  function dropped({ active, over }: DragEndEvent) {
    const index = active.data.current?.index
    const game = games.find((item) => item.index === index)
    if (!over || typeof index !== 'number' || !game || game.localTime.slice(0, 10) === String(over.id)) return
    onMove?.(index, String(over.id))
  }

  return <div className="flex flex-col gap-3" aria-label="Schedule calendar">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Previous ${view}`} disabled={previousEnd < firstDate} onClick={() => setAnchor(format(addDays(parseISO(anchor), view === 'week' ? -7 : -1), 'yyyy-MM-dd'))}><ChevronLeftIcon /></Button>
        <p className="min-w-40 text-center text-sm font-medium tabular-nums">{view === 'week' ? `${format(days[0], sameYear ? 'MMM d' : 'MMM d, yyyy')} – ${format(days[6], 'MMM d, yyyy')}` : format(days[0], 'EEE, MMM d, yyyy')}</p>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Next ${view}`} disabled={nextStart > lastDate} onClick={() => setAnchor(format(addDays(parseISO(anchor), view === 'week' ? 7 : 1), 'yyyy-MM-dd'))}><ChevronRightIcon /></Button>
        {loading && <span className="ml-2 text-xs text-muted-foreground" role="status">Loading bookings…</span>}
      </div>
      <ToggleGroup value={[view]} onValueChange={(values) => { if (values[0] === 'day' || values[0] === 'week') setChosenView(values[0]) }} variant="outline" size="sm" aria-label="Calendar view">
        <ToggleGroupItem value="day">Day</ToggleGroupItem><ToggleGroupItem value="week">Week</ToggleGroupItem>
      </ToggleGroup>
    </div>
    {error && <Alert variant="destructive"><AlertTitle>Existing games couldn’t be loaded</AlertTitle><AlertDescription>{error} <Button type="button" variant="link" size="sm" onClick={onRetry}>Retry</Button></AlertDescription></Alert>}
    <DndContext sensors={sensors} onDragEnd={dropped} accessibility={{ screenReaderInstructions: { draggable: instructions } }}>
    <div className="overflow-x-auto rounded-lg border">
      <div className={view === 'week' ? 'grid min-w-max' : 'grid grid-cols-1'} style={template ? { gridTemplateColumns: template } : undefined}>
        {columns.map(({ date, day, items }) => {
          return <DayColumn key={day} day={day} droppable={draggable}>
            <p className={`text-xs font-medium ${items.length ? '' : 'text-muted-foreground'}`}>{format(date, 'EEE, MMM d')}</p>
            {items.map((item) => {
              const time = formatClock(item.localTime)
              const content = <>
                <span className="flex items-center gap-1 font-medium tabular-nums">{item.conflict && <CircleAlertIcon className="size-3 text-destructive" aria-hidden="true" />}{time}</span>
                <span className="line-clamp-2">{item.homeName} vs {item.awayName}</span>
                <span className="truncate text-muted-foreground">{item.venueName}</span>
              </>
              return item.kind === 'proposed'
                ? <DraggableGame key={item.key} index={item.index} draggable={draggable} onSelect={() => onSelect(item.index)}
                  label={`Edit ${item.homeName} vs ${item.awayName}, ${time}, ${item.venueName}${item.conflict ? ', has a conflict' : ''}`}
                  className={`flex flex-col gap-0.5 rounded-md border px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${item.conflict ? 'border-destructive/40 bg-destructive/5 hover:bg-destructive/10' : 'bg-background hover:bg-muted'}`}>{content}</DraggableGame>
                : <div key={item.key} className="flex flex-col gap-0.5 rounded-md border border-dashed px-2 py-1.5 text-xs text-muted-foreground"><span className="sr-only">Existing game: </span>{content}</div>
            })}
          </DayColumn>
        })}
      </div>
    </div>
    </DndContext>
  </div>
}

