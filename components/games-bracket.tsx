'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontalIcon, TrophyIcon } from 'lucide-react'
import { PlayoffBracketBoard, type BracketGame } from '@/components/playoff-bracket'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { leagueRequest } from '@/lib/league-client'
import { formatGameDateTime } from '@/lib/league-time'

export type BracketRow = {
  id: string
  stage?: 'preliminary' | 'semifinal' | 'final' | 'third_place'
  status: string
  scheduled_at: string | null
  venue_name: string | null
  home_name: string
  away_name: string
  home_season_team_id: string | null
  away_season_team_id: string | null
  home_seed?: number | null
  away_seed?: number | null
  home_score: number | null
  away_score: number | null
}

type Props<T extends BracketRow> = {
  seasonId: string
  divisions: { id: string; name: string }[]
  // An empty value shows every division.
  divisionId: string
  timeZone?: string | null
  renderActions: (game: T) => ReactNode
}

const slotFormat: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }

// Saved playoff games for each division, drawn as a bracket that fills in as results are recorded.
export function GamesBracket<T extends BracketRow>({ seasonId, divisions, divisionId, timeZone, renderActions }: Props<T>) {
  const client = useQueryClient()
  const shown = divisionId ? divisions.filter((division) => division.id === divisionId) : divisions
  const queries = useQueries({ queries: shown.map((division) => {
    const path = `seasons/${seasonId}/games?divisionId=${division.id}`
    return { queryKey: ['league', path], queryFn: () => leagueRequest<T[]>(path, client), retry: false }
  }) })
  const failed = queries.find((query) => query.isError)
  if (failed) return <Alert variant="destructive"><AlertTitle>Couldn’t load the playoffs</AlertTitle><AlertDescription><p>{failed.error?.message}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void failed.refetch()}>Try again</Button></AlertDescription></Alert>
  if (queries.some((query) => query.isPending)) return <div className="grid gap-4 md:max-w-3xl md:grid-cols-2" role="status" aria-label="Loading playoffs"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>

  const brackets = shown.map((division, index) => ({ division, games: (queries[index].data ?? []).filter((game) => game.stage && game.stage !== 'preliminary') }))
    .filter((bracket) => bracket.games.length)
  if (!brackets.length) return <Empty className="rounded-xl border px-4 py-10 sm:py-14"><EmptyHeader><EmptyMedia variant="icon"><TrophyIcon aria-hidden="true" /></EmptyMedia><EmptyTitle><h3>No playoff brackets yet</h3></EmptyTitle><EmptyDescription>Generate the schedule with playoffs to add each division’s bracket after its round robin.</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" nativeButton={false} render={<Link href="/manage/games/generate" />}>Generate schedule</Button></EmptyContent></Empty>

  const toBracket = (game: T): BracketGame => {
    const final = game.status === 'completed'
    const seeds = game.stage === 'semifinal'
    return { key: game.id, stage: game.stage as BracketGame['stage'], final, venue: game.venue_name,
      when: game.scheduled_at ? formatGameDateTime(game.scheduled_at, timeZone, slotFormat) : 'Date not scheduled',
      home: { name: game.home_name, seed: seeds ? game.home_seed : null, score: final ? game.home_score : null, waiting: !game.home_season_team_id },
      away: { name: game.away_name, seed: seeds ? game.away_seed : null, score: final ? game.away_score : null, waiting: !game.away_season_team_id },
      actions: <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label={`Actions for ${game.home_name} vs ${game.away_name}`} />}><MoreHorizontalIcon /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">{renderActions(game)}</DropdownMenuContent>
      </DropdownMenu> }
  }
  // Semifinal 1 is seeds 1 and 4; brackets saved before seeds were recorded keep their time order.
  const order = (game: T) => [game.stage === 'semifinal' ? game.home_seed ?? 9 : 0, game.scheduled_at ?? ''].join(':')
  return <PlayoffBracketBoard key={divisionId} initialDivisionId={divisionId || undefined}
    divisions={brackets.map(({ division, games }) => ({ id: division.id, name: division.name, games: [...games].sort((a, b) => order(a).localeCompare(order(b))).map(toBracket) }))} />
}

