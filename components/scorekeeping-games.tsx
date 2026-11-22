'use client'

import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRightIcon, ClipboardListIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { leagueRequest } from '@/lib/league-client'
import { formatGameDateTime, zonedDate } from '@/lib/league-time'

const DAY_MS = 24 * 60 * 60 * 1000

type League = { id: string; name: string; organization_name: string; role: 'owner' | 'scorekeeper' }
export type ScorekeepingGame = {
  id: string
  league_name: string
  season_name: string
  division_name: string
  home_name: string
  away_name: string
  home_season_team_id: string | null
  away_season_team_id: string | null
  scheduled_at: string | null
  venue_name: string | null
  status: 'scheduled' | 'live' | 'completed'
  time_zone: string | null
}

function group(game: ScorekeepingGame) {
  if (game.status === 'live') return 'Live now'
  if (!game.scheduled_at) return 'Later'
  const now = Date.now()
  const gameDate = zonedDate(game.scheduled_at, game.time_zone)
  if (gameDate === zonedDate(new Date(now).toISOString(), game.time_zone)) return 'Today'
  return gameDate <= zonedDate(new Date(now + 7 * DAY_MS).toISOString(), game.time_zone) ? 'Next 7 days' : 'Later'
}

export function ScorekeepingGames() {
  const client = useQueryClient()
  const data = useQuery({ queryKey: ['league', 'scorekeeping/games'], queryFn: () => leagueRequest<{ leagues: League[]; games: ScorekeepingGame[] }>('scorekeeping/games', client), retry: false, refetchInterval: 30_000 })
  const owns = data.data?.leagues.some((league) => league.role === 'owner')
  const groups = ['Live now', 'Today', 'Next 7 days', 'Later'].map((label) => ({ label, games: (data.data?.games ?? []).filter((game) => group(game) === label) })).filter((item) => item.games.length)

  return <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 pt-8 pb-16 sm:px-8 sm:pt-12">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Scorekeeping</h1>
        <p className="text-sm text-muted-foreground">Live games and upcoming scheduled games in active seasons.</p>
      </div>
      {owns && <Button variant="outline" nativeButton={false} render={<Link href="/organizations" />}>Manage leagues<ArrowRightIcon data-icon="inline-end" /></Button>}
    </div>
    {data.isPending ? <div role="status" aria-label="Loading games" className="flex flex-col gap-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
      : data.isError ? <Alert variant="destructive"><AlertTitle>Couldn’t load your games</AlertTitle><AlertDescription><p>{data.error.message}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void data.refetch()}>Try again</Button></AlertDescription></Alert>
      : !data.data.leagues.length ? <Card><CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><ClipboardListIcon aria-hidden="true" /></span>
        <h2 className="font-medium">You don’t keep score for any league yet</h2>
        <p className="max-w-sm text-sm text-muted-foreground">Ask a league owner to invite you. The invitation email has a link that adds the league here.</p>
      </CardContent></Card>
      : <>
        <p className="text-sm text-muted-foreground">{data.data.leagues.map((league) => `${league.name} (${league.role === 'owner' ? 'owner' : 'scorekeeper'})`).join(' · ')}</p>
        {groups.length ? groups.map((item) => <section key={item.label} aria-labelledby={`scorekeeping-${item.label}`} className="flex flex-col gap-3">
          <h2 id={`scorekeeping-${item.label}`} className="text-sm font-medium text-muted-foreground">{item.label}</h2>
          <Card className="gap-0 py-0"><ul className="divide-y">{item.games.map((game) => <li key={game.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-6">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="truncate font-medium">{game.home_name} <span className="font-normal text-muted-foreground">vs</span> {game.away_name}</p>
              <p className="truncate text-sm text-muted-foreground">{[game.league_name, game.division_name, game.venue_name].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              {game.status === 'live' ? <Badge className="bg-red-600 text-white">Live</Badge>
                : <span className="text-sm tabular-nums text-muted-foreground">{formatGameDateTime(game.scheduled_at, game.time_zone, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
              {game.home_season_team_id && game.away_season_team_id
                ? <Button size="sm" variant={game.status === 'live' ? 'default' : 'outline'} nativeButton={false} render={<Link href={`/scorekeeping/games/${game.id}`} />}>{game.status === 'live' ? 'Open' : 'Score game'}</Button>
                : <span className="text-xs text-muted-foreground">Teams not set</span>}
            </div>
          </li>)}</ul></Card>
        </section>) : <p className="rounded-xl border px-4 py-10 text-center text-sm text-muted-foreground">No upcoming games. Generate a schedule for an active season to see games here.</p>}
      </>}
  </main>
}

