'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDaysIcon, CalendarPlusIcon, CircleCheckIcon, ClipboardListIcon, ClockIcon, MapPinIcon, ShirtIcon, SparklesIcon, TrophyIcon, UserPlusIcon, UsersIcon, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from 'cn'
import { leagueRequest } from '@/lib/league-client'
import { formatGameDateTime, zonedDate } from '@/lib/league-time'
import { buildAttentionItems, buildSetupSteps, seasonDay, stageLabel, unscheduledDivisions, type AttentionItem, type OverviewGame, type SeasonOverviewData } from '@/lib/season-overview'
import { GameScoreDialog } from '@/components/game-score-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
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
    {season.status === 'draft' ? <SetupChecklist data={data} season={season} today={today} />
      : season.status === 'active' ? <NeedsAttention data={data} season={season} league={league} timeZone={timeZone} />
      : <SeasonResults data={data} />}
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

const attentionIcon: Record<AttentionItem['key'], LucideIcon> = { scores: ClipboardListIcon, schedule: CalendarPlusIcon, rosters: UserPlusIcon, venues: MapPinIcon }

// Problems in a started season, each with one action. Games that ended without a score can be scored right here.
function NeedsAttention({ data, season, league, timeZone }: { data: SeasonOverviewData; season: OverviewSeason; league: OverviewLeague; timeZone?: string | null }) {
  const [scoring, setScoring] = useState<OverviewGame | null>(null)
  const [pending, setPending] = useState(false)
  const items = buildAttentionItems(data, league.name)
  if (!items.length) return <Card size="sm">
    <CardContent className="flex-row items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"><CircleCheckIcon aria-hidden="true" className="size-4.5" /></span>
      <div className="flex flex-col gap-0.5"><h3 className="font-medium">Everything is up to date</h3><p className="text-sm text-muted-foreground">No missing scores, schedules, short rosters or venues.</p></div>
    </CardContent>
  </Card>

  return <Card className="gap-0 py-0">
    <CardHeader className="border-b py-4">
      <CardTitle><h3 className="flex items-center gap-2 text-base font-semibold">Needs attention<Badge variant="secondary" className="tabular-nums">{items.length}</Badge></h3></CardTitle>
    </CardHeader>
    <ul className="divide-y">{items.map((item) => {
      const Icon = attentionIcon[item.key]
      const scoreGames = item.key === 'scores' && season.status === 'active' ? data.awaitingResults.games : []
      return <li key={item.key} className="flex flex-col gap-3 px-(--card-spacing) py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"><Icon aria-hidden="true" className="size-4.5" /></span>
            <div className="flex min-w-0 flex-col gap-0.5"><p className="font-medium">{item.title}</p><p className="text-sm break-words text-muted-foreground">{item.detail}</p></div>
          </div>
          <Button variant="outline" size="sm" className="self-start sm:self-center" nativeButton={false} render={<Link href={item.href} />}>{item.action}</Button>
        </div>
        {scoreGames.length > 0 && <ul className="flex flex-col divide-y rounded-lg border sm:ml-12">{scoreGames.map((game) => <li key={game.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-medium">{game.home_name} vs {game.away_name}</span>
            <span className="truncate text-xs text-muted-foreground">{[game.division_name, stageLabel(game.stage), formatGameDateTime(game.scheduled_at, timeZone, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })].filter(Boolean).join(' · ')}</span>
          </div>
          <Button size="sm" onClick={() => setScoring(game)}>Record score</Button>
        </li>)}</ul>}
      </li>
    })}</ul>
    <Dialog open={!!scoring} onOpenChange={(open) => { if (!open && !pending) setScoring(null) }}>
      <DialogContent showCloseButton={!pending} className="sm:max-w-lg">
        {scoring && <GameScoreDialog key={scoring.id} game={scoring} stage={stageLabel(scoring.stage)} timeZone={timeZone} onClose={() => setScoring(null)} onSaved={() => { setScoring(null); toast.success('Final score saved.') }} onPendingChange={setPending} />}
      </DialogContent>
    </Dialog>
  </Card>
}

// The steps that take a draft season to its start. Only the first open step gets the primary button.
function SetupChecklist({ data, season, today }: { data: SeasonOverviewData; season: OverviewSeason; today: string }) {
  const steps = buildSetupSteps(data, season.start_date?.slice(0, 10) ?? null, today)
  const done = steps.filter((step) => step.done).length
  const firstOpen = steps.find((step) => !step.done)
  return <Card className="gap-0 py-0">
    <CardHeader className="border-b py-4">
      <CardTitle><h3 className="text-base font-semibold">Season setup</h3></CardTitle>
      <CardDescription>{done} of {steps.length} steps done</CardDescription>
    </CardHeader>
    <ol className="divide-y">{steps.map((step, index) => <li key={step.key} className="flex flex-col gap-3 px-(--card-spacing) py-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {step.done
          ? <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"><CircleCheckIcon aria-hidden="true" className="size-4" /></span>
          : <span className="flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums text-muted-foreground">{index + 1}</span>}
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className={cn('font-medium', step.done && 'text-muted-foreground')}>{step.title}<span className="sr-only">{step.done ? ' (done)' : ' (to do)'}</span></p>
          <p className="text-sm text-muted-foreground">{step.detail}</p>
        </div>
      </div>
      {!step.done && <Button variant={step === firstOpen ? 'default' : 'outline'} size="sm" className="self-start sm:self-center" nativeButton={false} render={<Link href={step.href} />}>{step.action}</Button>}
    </li>)}</ol>
  </Card>
}

// A completed season's winners: the playoff champion, or the first-place team when a division had no playoffs.
function SeasonResults({ data }: { data: SeasonOverviewData }) {
  return <Card className="gap-0 py-0">
    <CardHeader className="border-b py-4"><CardTitle><h3 className="text-base font-semibold">Season results</h3></CardTitle></CardHeader>
    <ul className="grid divide-y sm:grid-cols-2 sm:divide-y-0">{data.divisions.map((division) => {
      const winner = division.playoffs?.champion ?? division.standings[0]?.name
      return <li key={division.id} className="flex items-center gap-3 px-(--card-spacing) py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300"><TrophyIcon aria-hidden="true" className="size-4.5" /></span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">{division.name} · {division.playoffs?.champion ? 'Champion' : 'First place'}</span>
          <span className="truncate font-medium">{winner ?? 'No results'}</span>
        </div>
      </li>
    })}</ul>
  </Card>
}


