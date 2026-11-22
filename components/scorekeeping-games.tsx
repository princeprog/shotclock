'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRightIcon, CalendarDaysIcon, ClipboardListIcon, MapPinIcon, SearchIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { leagueRequest } from '@/lib/league-client'
import { formatGameTime, zonedDate } from '@/lib/league-time'
import { periodLabel } from '@/lib/live-scoring'
import { dayLabel, stageLabel } from '@/lib/season-overview'
import { cn } from '@/lib/utils'

type League = { id: string; name: string; organization_name: string; role: 'owner' | 'scorekeeper' }
export type ScorekeepingGame = {
  id: string
  league_name: string
  season_name: string
  division_id: string
  division_name: string
  home_name: string
  away_name: string
  home_season_team_id: string | null
  away_season_team_id: string | null
  scheduled_at: string | null
  venue_name: string | null
  status: 'scheduled' | 'live' | 'completed'
  stage: 'preliminary' | 'semifinal' | 'final' | 'third_place'
  time_zone: string | null
  live_home_score: number | null
  live_away_score: number | null
  period: number | null
  period_count: number | null
}

const GAME_LIMIT = 50

// The game's calendar date in its league's time zone, and today's date in that same zone.
function gameDay(game: ScorekeepingGame) {
  return { date: game.scheduled_at ? zonedDate(game.scheduled_at, game.time_zone) : null, today: zonedDate(new Date().toISOString(), game.time_zone) }
}

// Groups upcoming games under their calendar day, keeping the API's start-time order.
function groupByDay(games: ScorekeepingGame[]) {
  const groups: { key: string; label: string; games: ScorekeepingGame[] }[] = []
  for (const game of games) {
    const { date, today } = gameDay(game)
    const key = date ?? 'unscheduled'
    let group = groups.find((item) => item.key === key)
    if (!group) {
      group = { key, label: date ? dayLabel(date, today) : 'Date not set', games: [] }
      groups.push(group)
    }
    group.games.push(game)
  }
  return groups
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join('').toLocaleUpperCase()
}

// One side of a matchup. Sides still waiting on seeding or another game get a dashed mark.
function TeamLine({ name, set, score }: { name: string; set: boolean; score?: number | null }) {
  return <div className="flex min-w-0 items-center gap-2.5">
    <span aria-hidden="true" className={cn('flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold', set ? 'bg-[#E67145]/10 text-[#A64320] dark:text-[#FFAE88]' : 'border border-dashed text-muted-foreground')}>{set ? initials(name) : '?'}</span>
    <span className={cn('min-w-0 flex-1 truncate text-sm', set ? 'font-medium' : 'text-muted-foreground')}>{name}</span>
    {score !== undefined && <span className="w-8 shrink-0 text-right text-base font-semibold tabular-nums">{score ?? 0}</span>}
  </div>
}

function GameDetails({ game, showLeague, className }: { game: ScorekeepingGame; showLeague: boolean; className?: string }) {
  const stage = stageLabel(game.stage)
  return <div className={cn('min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground', className)}>
    <Badge variant="outline" className="font-normal">{showLeague ? `${game.league_name} · ${game.division_name}` : game.division_name}</Badge>
    {stage && <Badge variant="secondary">{stage}</Badge>}
    {game.venue_name && <span className="flex min-w-0 items-center gap-1"><MapPinIcon aria-hidden="true" className="size-3.5 shrink-0" /><span className="truncate">{game.venue_name}</span></span>}
  </div>
}

function ScoreAction({ game }: { game: ScorekeepingGame }) {
  if (!game.home_season_team_id || !game.away_season_team_id) return <span className="text-xs text-muted-foreground">Waiting for teams</span>
  const live = game.status === 'live'
  return <Button size="sm" variant={live ? 'default' : 'outline'} nativeButton={false} render={<Link href={`/scorekeeping/games/${game.id}`} aria-label={`${live ? 'Resume scoring' : 'Score'} ${game.home_name} vs ${game.away_name}`} />}>
    {live ? 'Resume' : 'Score'}<span className="hidden sm:inline">{live ? ' scoring' : ' game'}</span><ArrowRightIcon data-icon="inline-end" />
  </Button>
}

// A matchup row. The lead column holds the start time, or the Live badge and period while a game is being scored.
// From md up, the division and venue move out from under the teams into their own column.
function GameRow({ game, showLeague, lead }: { game: ScorekeepingGame; showLeague: boolean; lead: ReactNode }) {
  const live = game.status === 'live'
  return <li className="grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3.5 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:px-6 md:grid-cols-[5rem_minmax(0,1fr)_minmax(0,13rem)_auto]">
    <div className="flex flex-col items-start gap-1">{lead}</div>
    <div className="flex min-w-0 flex-col gap-1.5">
      <TeamLine name={game.home_name} set={!!game.home_season_team_id} score={live ? game.live_home_score : undefined} />
      <TeamLine name={game.away_name} set={!!game.away_season_team_id} score={live ? game.live_away_score : undefined} />
      <GameDetails game={game} showLeague={showLeague} className="mt-1 flex md:hidden" />
    </div>
    <GameDetails game={game} showLeague={showLeague} className="hidden md:flex md:flex-col md:items-start" />
    <ScoreAction game={game} />
  </li>
}

function LiveGames({ games, showLeague }: { games: ScorekeepingGame[]; showLeague: boolean }) {
  return <section aria-labelledby="scorekeeping-live" className="flex flex-col gap-3">
    <h2 id="scorekeeping-live" className="flex items-center gap-2 text-sm font-semibold"><span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-red-600" />Live now</h2>
    <Card className="gap-0 border-red-600/30 py-0"><ul className="divide-y">{games.map((game) => <GameRow key={game.id} game={game} showLeague={showLeague} lead={<>
      <Badge className="bg-red-600 text-white">Live</Badge>
      {game.period && game.period_count && <span className="text-xs font-medium tabular-nums text-muted-foreground">{periodLabel(game.period, game.period_count)}</span>}
    </>} />)}</ul></Card>
  </section>
}

function UpcomingDay({ day, label, games, showLeague }: { day: string; label: string; games: ScorekeepingGame[]; showLeague: boolean }) {
  const id = `scorekeeping-day-${day}`
  return <section aria-labelledby={id} className="flex flex-col gap-3">
    <div className="flex items-baseline justify-between gap-4">
      <h2 id={id} className="text-sm font-semibold">{label}</h2>
      <span className="text-xs text-muted-foreground">{games.length} {games.length === 1 ? 'game' : 'games'}</span>
    </div>
    <Card className="gap-0 py-0"><ul className="divide-y">{games.map((game) => <GameRow key={game.id} game={game} showLeague={showLeague} lead={<span className="text-sm font-medium tabular-nums">{game.scheduled_at ? formatGameTime(game.scheduled_at, game.time_zone) : 'TBD'}</span>} />)}</ul></Card>
  </section>
}

function Summary({ live, today, next }: { live: number; today: number; next: ScorekeepingGame | undefined }) {
  const nextDay = next ? gameDay(next) : null
  const stats = [
    { label: 'Live now', value: String(live) },
    { label: 'Today', value: String(today) },
    { label: 'Next game', value: next?.scheduled_at && nextDay?.date ? `${dayLabel(nextDay.date, nextDay.today)}, ${formatGameTime(next.scheduled_at, next.time_zone)}` : 'None scheduled' },
  ]
  return <dl className="grid grid-cols-2 overflow-hidden rounded-xl border sm:grid-cols-[1fr_1fr_2fr]">
    {stats.map((stat, index) => <div key={stat.label} className={cn('flex flex-col gap-1 px-4 py-3 sm:px-5', index === 2 ? 'col-span-2 border-t sm:col-span-1 sm:border-t-0 sm:border-l' : index === 1 && 'border-l')}>
      <dt className="text-xs text-muted-foreground">{stat.label}</dt>
      <dd className="truncate text-lg font-semibold tabular-nums">{stat.value}</dd>
    </div>)}
  </dl>
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <Card><CardContent><Empty className="px-4 py-10 sm:py-14"><EmptyHeader>
    <EmptyMedia variant="icon"><CalendarDaysIcon aria-hidden="true" /></EmptyMedia>
    <EmptyTitle><h2>{title}</h2></EmptyTitle>
    <EmptyDescription>{description}</EmptyDescription>
  </EmptyHeader>{action && <EmptyContent>{action}</EmptyContent>}</Empty></CardContent></Card>
}

export function ScorekeepingGames() {
  const client = useQueryClient()
  const data = useQuery({ queryKey: ['league', 'scorekeeping/games'], queryFn: () => leagueRequest<{ leagues: League[]; games: ScorekeepingGame[] }>('scorekeeping/games', client), retry: false, refetchInterval: 30_000 })
  const [search, setSearch] = useState('')
  const [division, setDivision] = useState('')
  const leagues = data.data?.leagues ?? []
  const games = data.data?.games ?? []
  const owns = leagues.some((league) => league.role === 'owner')
  const showLeague = leagues.length > 1
  const query = search.trim().toLocaleLowerCase()
  const visible = games.filter((game) => (!division || game.division_id === division) && (!query || `${game.home_name} ${game.away_name}`.toLocaleLowerCase().includes(query)))
  const live = visible.filter((game) => game.status === 'live')
  const upcoming = visible.filter((game) => game.status === 'scheduled')
  const divisions = Array.from(new Map(games.map((game) => [game.division_id, { id: game.division_id, name: game.division_name, league: game.league_name }])).values())
  const todayCount = games.filter((game) => {
    const day = gameDay(game)
    return game.status === 'scheduled' && day.date === day.today
  }).length
  const filtered = !!division || !!query
  const clearFilters = () => { setSearch(''); setDivision('') }

  return <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 pt-8 pb-16 sm:px-8 sm:pt-12">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Scorekeeping</h1>
        <p className="text-sm text-muted-foreground">Pick a game to open the live scoring console.</p>
        {leagues.length > 0 && <ul aria-label="Your leagues" className="flex flex-wrap gap-1.5">{leagues.map((league) => <li key={league.id}><Badge variant="outline" className="font-normal">{league.name}<span className="text-muted-foreground">· {league.role === 'owner' ? 'Owner' : 'Scorekeeper'}</span></Badge></li>)}</ul>}
      </div>
      {owns && <Button variant="outline" nativeButton={false} render={<Link href="/organizations" />}>Manage leagues<ArrowRightIcon data-icon="inline-end" /></Button>}
    </div>

    {data.isPending ? <div role="status" aria-label="Loading games" className="flex flex-col gap-4"><Skeleton className="h-20 w-full rounded-xl" /><Skeleton className="h-9 w-full" /><Skeleton className="h-64 w-full rounded-xl" /></div>
      : data.isError ? <Alert variant="destructive"><AlertTitle>Couldn’t load your games</AlertTitle><AlertDescription><p>{data.error.message}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void data.refetch()}>Try again</Button></AlertDescription></Alert>
      : !leagues.length ? <Card><CardContent><Empty className="px-4 py-10 sm:py-14"><EmptyHeader>
        <EmptyMedia variant="icon"><ClipboardListIcon aria-hidden="true" /></EmptyMedia>
        <EmptyTitle><h2>You don’t keep score for any league yet</h2></EmptyTitle>
        <EmptyDescription>Ask a league owner to invite you. The invitation email has a link that adds the league here.</EmptyDescription>
      </EmptyHeader></Empty></CardContent></Card>
      : !games.length ? <EmptyState title="No upcoming games" description="Games appear here once an active season has a schedule." action={owns ? <Button nativeButton={false} render={<Link href="/organizations" />}>Manage leagues</Button> : undefined} />
      : <>
        <Summary live={games.filter((game) => game.status === 'live').length} today={todayCount} next={games.find((game) => game.status === 'scheduled')} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="scorekeeping-search" className="sr-only">Search teams</label>
          <InputGroup className="sm:max-w-xs"><InputGroupAddon><SearchIcon aria-hidden="true" /></InputGroupAddon><InputGroupInput id="scorekeeping-search" type="search" placeholder="Search teams" maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} /></InputGroup>
          <label htmlFor="scorekeeping-division" className="sr-only">Division</label>
          <NativeSelect id="scorekeeping-division" className="w-full sm:w-56" value={division} onChange={(event) => setDivision(event.target.value)}>
            <NativeSelectOption value="">All divisions</NativeSelectOption>
            {showLeague
              ? leagues.map((league) => <NativeSelectOptGroup key={league.id} label={league.name}>{divisions.filter((item) => item.league === league.name).map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}</NativeSelectOptGroup>)
              : divisions.map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}
          </NativeSelect>
          {filtered && <Button variant="ghost" onClick={clearFilters}>Clear</Button>}
        </div>
        {live.length > 0 && <LiveGames games={live} showLeague={showLeague} />}
        {groupByDay(upcoming).map((group) => <UpcomingDay key={group.key} day={group.key} label={group.label} games={group.games} showLeague={showLeague} />)}
        {!visible.length && <EmptyState title="No matching games" description="Try a different team name or division." action={<Button variant="outline" onClick={clearFilters}>Clear filters</Button>} />}
        {games.length >= GAME_LIMIT && <p className="text-center text-xs text-muted-foreground">Showing the next {GAME_LIMIT} games. Later games appear as these are played.</p>}
      </>}
  </main>
}


