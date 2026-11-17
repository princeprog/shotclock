'use client'

import type { ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format, parseISO } from 'date-fns'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { leagueRequest } from '@/lib/league-client'
import { formatGameTime, zonedDayStart } from '@/lib/league-time'
import { requirePaginatedResult } from '@/lib/pagination'
import { calendarDays, groupGamesByDay, isInMonth, type CalendarGame, type CalendarView } from '@/lib/games-calendar'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 100
const MAX_PAGES = 20
const MONTH_ITEMS = 3
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type Props<T extends CalendarGame> = {
  seasonId: string
  view: CalendarView
  anchor: string
  todayKey: string
  timeZone?: string | null
  divisionId: string
  onOpenWeek: (day: string) => void
  renderActions: (game: T) => ReactNode
}

// Every game in the visible days, scheduled and final together. The API pages at 100, so later pages load in parallel.
async function loadRange<T>(path: (page: number) => string, client: ReturnType<typeof useQueryClient>) {
  const first = requirePaginatedResult<T>(await leagueRequest<unknown>(path(1), client))
  const pages = Math.min(first.totalPages, MAX_PAGES)
  const rest = await Promise.all(Array.from({ length: pages - 1 }, async (_, index) => requirePaginatedResult<T>(await leagueRequest<unknown>(path(index + 2), client))))
  return { items: [first, ...rest].flatMap((page) => page.items), truncated: first.totalPages > MAX_PAGES }
}

const isFinal = (game: CalendarGame) => game.status === 'completed'
const statusLabel = (game: CalendarGame) => game.forfeited_by_season_team_id ? 'Forfeit' : isFinal(game) ? 'Final' : 'Scheduled'

function gameLabel(game: CalendarGame, timeZone?: string | null) {
  const time = game.scheduled_at ? formatGameTime(game.scheduled_at, timeZone) : 'No time'
  const score = isFinal(game) && game.home_score !== null && game.away_score !== null ? `, ${game.home_score} to ${game.away_score}` : ''
  return `${time}, ${game.home_name} vs ${game.away_name}${score}, ${game.venue_name ?? 'no venue'}, ${statusLabel(game)}. Open game actions`
}

function TeamLine({ name, score, winner }: { name: string; score: number | null; winner: boolean }) {
  return <span className="flex items-baseline justify-between gap-2"><span className={cn('truncate', winner ? 'font-semibold text-foreground' : 'text-foreground/90')}>{name}</span>{score !== null && <span className={cn('shrink-0 tabular-nums', winner ? 'font-semibold' : 'text-muted-foreground')}>{score}</span>}</span>
}

// A game card opens the same actions menu as the list row.
function GameCard<T extends CalendarGame>({ game, timeZone, renderActions, wide = false }: { game: T; timeZone?: string | null; renderActions: (game: T) => ReactNode; wide?: boolean }) {
  const final = isFinal(game) && game.home_score !== null && game.away_score !== null
  const homeWins = final && game.home_score! > game.away_score!
  const awayWins = final && game.away_score! > game.home_score!
  return <DropdownMenu>
    <DropdownMenuTrigger render={<button type="button" aria-label={gameLabel(game, timeZone)} className={cn('flex w-full flex-col gap-1.5 rounded-lg border p-2.5 text-left text-xs transition-colors hover:border-foreground/25 focus-visible:outline-2 focus-visible:outline-ring data-popup-open:border-foreground/40', isFinal(game) ? 'bg-muted/50' : 'bg-background hover:bg-muted/30', wide && 'p-3 text-sm')} />}>
      <span className="flex items-center justify-between gap-2">
        <span className="font-semibold tabular-nums text-foreground">{game.scheduled_at ? formatGameTime(game.scheduled_at, timeZone) : '—'}</span>
        {isFinal(game) && <span className={cn('rounded-full px-1.5 py-px text-[10px] font-medium uppercase tracking-wide', game.forfeited_by_season_team_id ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200' : 'bg-foreground/10 text-foreground/80')}>{statusLabel(game)}</span>}
      </span>
      <span className="flex flex-col gap-0.5">
        <TeamLine name={game.home_name} score={final ? game.home_score : null} winner={homeWins} />
        <TeamLine name={game.away_name} score={final ? game.away_score : null} winner={awayWins} />
      </span>
      <span className="truncate text-[11px] text-muted-foreground">{game.division_name}{game.venue_name ? ` · ${game.venue_name}` : ''}</span>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-56">{renderActions(game)}</DropdownMenuContent>
  </DropdownMenu>
}

function MonthItem<T extends CalendarGame>({ game, timeZone, renderActions }: { game: T; timeZone?: string | null; renderActions: (game: T) => ReactNode }) {
  // Month cells are narrow, so items keep the team names and leave the score to the week view and the label.
  return <DropdownMenu>
    <DropdownMenuTrigger render={<button type="button" aria-label={gameLabel(game, timeZone)} title={`${game.home_name} vs ${game.away_name}`} className={cn('flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] leading-tight transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring data-popup-open:bg-muted', isFinal(game) ? 'text-muted-foreground' : 'text-foreground')} />}>
      <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', isFinal(game) ? 'bg-muted-foreground/50' : 'bg-primary')} />
      <span className="shrink-0 font-medium tabular-nums">{game.scheduled_at ? formatGameTime(game.scheduled_at, timeZone) : '—'}</span>
      <span className="truncate">{game.home_name} vs {game.away_name}</span>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-56">{renderActions(game)}</DropdownMenuContent>
  </DropdownMenu>
}

function DayNumber({ day, today, muted = false, onClick }: { day: string; today: boolean; muted?: boolean; onClick?: () => void }) {
  const className = cn('grid size-7 place-items-center rounded-full text-sm font-semibold tabular-nums transition-colors', today ? 'bg-primary text-primary-foreground' : muted ? 'text-muted-foreground/60' : 'text-foreground', onClick && !today && 'hover:bg-muted', onClick && 'focus-visible:outline-2 focus-visible:outline-ring')
  const label = format(parseISO(day), 'd')
  return onClick ? <button type="button" onClick={onClick} aria-label={`Show the week of ${format(parseISO(day), 'MMMM d')}`} className={className}>{label}</button> : <span className={className}>{label}</span>
}

function CalendarSkeleton({ view }: { view: CalendarView }) {
  return <div role="status" aria-label="Loading calendar" className="overflow-clip rounded-xl border">
    <div className="grid grid-cols-7 border-b bg-muted/30">{weekdays.map((name) => <div key={name} className="flex justify-center py-2.5"><Skeleton className="h-4 w-8" /></div>)}</div>
    <div className="grid grid-cols-7">{Array.from({ length: view === 'week' ? 7 : 35 }, (_, index) => <div key={index} className={cn('flex flex-col gap-2 border-r border-b p-2 nth-[7n]:border-r-0', view === 'week' ? 'min-h-56' : 'min-h-28')}><Skeleton className={view === 'week' ? 'h-20 w-full' : 'h-4 w-2/3'} />{index % 3 === 0 && <Skeleton className={view === 'week' ? 'h-20 w-full' : 'h-4 w-1/2'} />}</div>)}</div>
  </div>
}

export function GamesCalendar<T extends CalendarGame>({ seasonId, view, anchor, todayKey, timeZone, divisionId, onOpenWeek, renderActions }: Props<T>) {
  const client = useQueryClient()
  const days = calendarDays(view, anchor)
  const pathFor = (page: number) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sort: 'asc' })
    if (divisionId) params.set('divisionId', divisionId)
    else params.set('scope', 'season')
    // Whole days in the league's time zone, end exclusive.
    params.set('from', zonedDayStart(days[0], timeZone))
    params.set('to', zonedDayStart(format(addDays(parseISO(days.at(-1)!), 1), 'yyyy-MM-dd'), timeZone))
    return `seasons/${seasonId}/games?${params}`
  }
  const path = pathFor(1)
  const range = useQuery({ queryKey: ['league', path], queryFn: () => loadRange<T>(pathFor, client), retry: false, placeholderData: (previous) => previous })
  if (range.isError) return <Alert variant="destructive"><AlertTitle>Couldn’t load the calendar</AlertTitle><AlertDescription><p>{range.error.message}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void range.refetch()}>Try again</Button></AlertDescription></Alert>
  if (!range.data) return <CalendarSkeleton view={view} />
  const groups = groupGamesByDay(range.data.items, timeZone)
  const visible = days.filter((day) => view === 'week' || isInMonth(day, anchor))
  const withGames = visible.filter((day) => groups.has(day))
  const busy = range.isPlaceholderData
  const period = view === 'week' ? 'week' : 'month'
  const countLabel = (count: number) => `${count} ${count === 1 ? 'game' : 'games'}`

  // Narrow containers (phones, or a tablet with the sidebar open) list the period day by day instead of a grid.
  const agenda = <div className="flex flex-col gap-6 @3xl:hidden">
    {withGames.length ? withGames.map((day) => <section key={day} aria-label={format(parseISO(day), 'EEEE, MMMM d, yyyy')} className="flex flex-col gap-2.5">
      <h3 className="flex items-baseline gap-2 text-sm font-semibold">{format(parseISO(day), 'EEEE, MMM d')}{day === todayKey && <span className="rounded-full bg-primary px-2 py-px text-[11px] font-medium text-primary-foreground">Today</span>}<span className="text-xs font-normal text-muted-foreground">{countLabel(groups.get(day)!.length)}</span></h3>
      <ul className="flex flex-col gap-2">{groups.get(day)!.map((game) => <li key={game.id}><GameCard game={game} timeZone={timeZone} renderActions={renderActions} wide /></li>)}</ul>
    </section>) : <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">No games this {period}.</p>}
  </div>

  const week = <div className="hidden overflow-clip rounded-xl border bg-card @3xl:grid @3xl:grid-cols-7">
    {days.map((day) => {
      const games = groups.get(day) ?? []
      const date = parseISO(day)
      return <section key={day} aria-label={`${format(date, 'EEEE, MMMM d, yyyy')}, ${countLabel(games.length)}`} className="flex min-w-0 flex-col border-r last:border-r-0">
        <div className="flex flex-col items-center gap-1 border-b bg-muted/30 py-2.5" aria-current={day === todayKey ? 'date' : undefined}>
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{format(date, 'EEE')}</span>
          <DayNumber day={day} today={day === todayKey} />
        </div>
        {games.length ? <ul className="flex min-h-56 flex-col gap-2 p-2">{games.map((game) => <li key={game.id}><GameCard game={game} timeZone={timeZone} renderActions={renderActions} /></li>)}</ul>
          : <p className="flex min-h-56 items-start justify-center p-2 pt-6 text-xs text-muted-foreground/70">No games</p>}
      </section>
    })}
  </div>

  const month = <div className="hidden overflow-clip rounded-xl border bg-card @3xl:block">
    <div aria-hidden="true" className="grid grid-cols-7 border-b bg-muted/30">{weekdays.map((name) => <span key={name} className="py-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{name}</span>)}</div>
    <div className="grid grid-cols-7">{days.map((day) => {
      const games = groups.get(day) ?? []
      const inMonth = isInMonth(day, anchor)
      const extra = games.length - MONTH_ITEMS
      return <section key={day} aria-label={`${format(parseISO(day), 'EEEE, MMMM d, yyyy')}, ${countLabel(games.length)}`} aria-current={day === todayKey ? 'date' : undefined} className={cn('flex min-h-28 min-w-0 flex-col gap-1 border-r border-b p-1.5 nth-[7n]:border-r-0 nth-last-[-n+7]:border-b-0', !inMonth && 'bg-muted/20')}>
        <DayNumber day={day} today={day === todayKey} muted={!inMonth} onClick={() => onOpenWeek(day)} />
        {games.length > 0 && <ul className="flex min-w-0 flex-col gap-0.5">{games.slice(0, MONTH_ITEMS).map((game) => <li key={game.id} className="min-w-0"><MonthItem game={game} timeZone={timeZone} renderActions={renderActions} /></li>)}</ul>}
        {extra > 0 && <button type="button" onClick={() => onOpenWeek(day)} className="self-start rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">+{extra} more</button>}
      </section>
    })}</div>
  </div>

  return <div aria-busy={busy || undefined} className={cn('@container flex flex-col gap-3 transition-opacity duration-200', busy && 'opacity-60')}>
    {range.data.truncated && <p role="status" className="text-sm text-muted-foreground">Showing the first {(PAGE_SIZE * MAX_PAGES).toLocaleString()} games in this {period}.</p>}
    {agenda}
    {view === 'week' ? week : month}
  </div>
}


