import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, isSameYear, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { zonedDate } from './league-time.ts'

export type CalendarView = 'week' | 'month'
// The fields the calendar needs from a game row.
export type CalendarGame = {
  id: string; scheduled_at: string | null; status: string; home_name: string; away_name: string
  home_score: number | null; away_score: number | null; division_name: string; venue_name: string | null; forfeited_by_season_team_id: string | null
}

const day = (date: Date) => format(date, 'yyyy-MM-dd')

// Visible days as yyyy-MM-dd. Weeks run Sunday to Saturday; months cover the full weeks that contain them.
export function calendarDays(view: CalendarView, anchor: string): string[] {
  const date = parseISO(anchor)
  const first = view === 'week' ? startOfWeek(date) : startOfWeek(startOfMonth(date))
  const last = view === 'week' ? endOfWeek(date) : endOfWeek(endOfMonth(date))
  const days: string[] = []
  for (let current = first; current <= last; current = addDays(current, 1)) days.push(day(current))
  return days
}

export function shiftAnchor(view: CalendarView, anchor: string, direction: 1 | -1): string {
  const date = parseISO(anchor)
  return day(view === 'week' ? addDays(date, 7 * direction) : addMonths(date, direction))
}

export function periodLabel(view: CalendarView, anchor: string): string {
  const date = parseISO(anchor)
  if (view === 'month') return format(date, 'MMMM yyyy')
  const start = startOfWeek(date)
  const end = endOfWeek(date)
  if (!isSameYear(start, end)) return `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`
  if (!isSameMonth(start, end)) return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
  return `${format(start, 'MMM d')} – ${format(end, 'd, yyyy')}`
}

// Games keyed by their day in the league's time zone, in time order.
export function groupGamesByDay<T extends CalendarGame>(games: T[], timeZone?: string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  const ordered = [...games].filter((game) => game.scheduled_at).sort((a, b) => Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!) || a.id.localeCompare(b.id))
  for (const game of ordered) {
    const key = zonedDate(game.scheduled_at!, timeZone)
    groups.set(key, [...(groups.get(key) ?? []), game])
  }
  return groups
}

// Opens on today when it falls within the season (or the season has no dates), otherwise on the nearest season edge.
export function defaultAnchor(season: { start_date: string | null; end_date: string | null }, today: string): string {
  const start = season.start_date?.slice(0, 10)
  const end = season.end_date?.slice(0, 10)
  if (start && today < start) return start
  if (end && today > end) return end
  return today
}

export function isInMonth(date: string, anchor: string): boolean {
  return isSameMonth(parseISO(date), parseISO(anchor))
}
