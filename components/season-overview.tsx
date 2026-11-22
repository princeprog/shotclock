'use client'

import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDaysIcon, ClockIcon, ShirtIcon, SparklesIcon, UsersIcon, type LucideIcon } from 'lucide-react'
import { leagueRequest } from '@/lib/league-client'
import { formatGameDateTime, zonedDate } from '@/lib/league-time'
import { seasonDay, unscheduledDivisions, type SeasonOverviewData } from '@/lib/season-overview'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'

type OverviewSeason = { id: string; name: string; status: 'draft' | 'active' | 'completed'; start_date: string | null; end_date: string | null }
type OverviewLeague = { id: string; name: string; time_zone?: string | null }

const statusLabel = { draft: 'Draft', active: 'Active', completed: 'Completed' }
const statusClass = {
  draft: 'border-border text-muted-foreground',
  active: 'border-emerald-600/20 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  completed: 'border-transparent bg-secondary text-secondary-foreground',
}
const rangeFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const calendarDay = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00Z`)

function seasonDates(season: OverviewSeason) {
  if (season.start_date && season.end_date) return rangeFormat.formatRange(calendarDay(season.start_date), calendarDay(season.end_date))
  if (season.start_date) return `Starts ${rangeFormat.format(calendarDay(season.start_date))}`
  return 'Dates not set'
}

// The season-wide Overview: what's next, what needs attention, and how each division stands.
export function SeasonOverview({ season, league }: { season: OverviewSeason; league: OverviewLeague }) {
  const client = useQueryClient()
  const path = `seasons/${season.id}/dashboard`
  const overview = useQuery({ queryKey: ['league', path], queryFn: () => leagueRequest<SeasonOverviewData>(path, client), retry: false })
  const timeZone = league.time_zone
  const today = zonedDate(new Date().toISOString(), timeZone)

  if (overview.isError) return <Alert variant="destructive"><AlertTitle>Couldn’t load the overview</AlertTitle><AlertDescription><p>{overview.error.message}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void overview.refetch()}>Try again</Button></AlertDescription></Alert>
  if (!overview.data) return <OverviewSkeleton />
  const data = overview.data

  return <div className="flex flex-col gap-6">
    <SeasonSummary season={season} data={data} today={today} />
    <StatCards data={data} timeZone={timeZone} />
  </div>
}

function OverviewSkeleton() {
  return <div role="status" aria-label="Loading the season overview" className="flex flex-col gap-6">
    <Skeleton className="h-36 w-full rounded-xl" />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-28 rounded-xl" />)}</div>
    <div className="grid gap-6 lg:grid-cols-3"><Skeleton className="h-80 rounded-xl lg:col-span-2" /><Skeleton className="h-80 rounded-xl" /></div>
  </div>
}

function SeasonSummary({ season, data, today }: { season: OverviewSeason; data: SeasonOverviewData; today: string }) {
  const { games, completedGames } = data.totals
  const day = seasonDay(season.start_date?.slice(0, 10) ?? null, season.end_date?.slice(0, 10) ?? null, today)
  const canGenerate = season.status !== 'completed' && unscheduledDivisions(data).length > 0
  return <Card>
    <CardContent className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="truncate text-xl font-semibold tracking-tight">{season.name}</h2>
            <Badge variant="outline" className={statusClass[season.status]}>{statusLabel[season.status]}</Badge>
          </div>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>{seasonDates(season)}</span>
            {day && <><span aria-hidden="true">·</span><span>Day {day.day} of {day.total}</span></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canGenerate && <Button nativeButton={false} render={<Link href="/manage/games/generate" />}><SparklesIcon data-icon="inline-start" />Generate schedule</Button>}
          <Button variant="outline" nativeButton={false} render={<Link href="/manage/games" />}><CalendarDaysIcon data-icon="inline-start" />View games</Button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium">Games played</span>
          <span className="tabular-nums text-muted-foreground">{games ? `${completedGames} of ${games}` : 'No games scheduled yet'}</span>
        </div>
        <Progress value={games ? Math.round((completedGames / games) * 100) : 0} aria-label="Games played" />
      </div>
    </CardContent>
  </Card>
}

function StatCard({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return <Card size="sm">
    <CardContent className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground"><span>{label}</span><Icon aria-hidden="true" className="size-4" /></div>
      <p className="truncate text-2xl font-semibold tracking-tight tabular-nums" title={value}>{value}</p>
      <p className="truncate text-xs text-muted-foreground" title={detail}>{detail}</p>
    </CardContent>
  </Card>
}

function StatCards({ data, timeZone }: { data: SeasonOverviewData; timeZone?: string | null }) {
  const { teams, players, divisions, games, completedGames } = data.totals
  const next = data.upcoming[0]
  return <section aria-label="Season totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard icon={UsersIcon} label="Teams" value={String(teams)} detail={`In ${divisions} ${divisions === 1 ? 'division' : 'divisions'}`} />
    <StatCard icon={ShirtIcon} label="Players" value={String(players)} detail="On season rosters" />
    <StatCard icon={CalendarDaysIcon} label="Games played" value={`${completedGames}/${games}`} detail={games ? `${games - completedGames} left to play` : 'No games scheduled'} />
    <StatCard icon={ClockIcon} label="Next game" value={next ? formatGameDateTime(next.scheduled_at, timeZone, { weekday: 'short', month: 'short', day: 'numeric' }) : 'None scheduled'}
      detail={next ? `${formatGameDateTime(next.scheduled_at, timeZone, { hour: 'numeric', minute: '2-digit' })} · ${next.home_name} vs ${next.away_name}` : 'Upcoming games appear here'} />
  </section>
}

