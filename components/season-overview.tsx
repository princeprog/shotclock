'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRightIcon, CalendarDaysIcon, CalendarPlusIcon, CircleCheckIcon, ClipboardListIcon, ClockIcon, MapPinIcon, ShirtIcon, SparklesIcon, TrophyIcon, UserPlusIcon, UsersIcon, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from 'cn'
import { leagueRequest } from '@/lib/league-client'
import { saveGamesView } from '@/lib/games-view'
import { formatGameDateTime, formatGameTime, zonedDate } from '@/lib/league-time'
import { buildAttentionItems, buildSetupSteps, groupGamesByDay, seasonDay, stageLabel, unscheduledDivisions, type AttentionItem, type OverviewDivision, type OverviewGame, type SeasonOverviewData } from '@/lib/season-overview'
import { GameScoreDialog } from '@/components/game-score-dialog'
import { useWorkspace } from '@/components/workspace-context'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

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
  // While a game is live, the overview refreshes so its score keeps up.
  const overview = useQuery({ queryKey: ['league', path], queryFn: () => leagueRequest<SeasonOverviewData>(path, client), retry: false,
    refetchInterval: (query) => query.state.data?.live?.length ? 10_000 : false })
  const timeZone = league.time_zone
  const today = zonedDate(new Date().toISOString(), timeZone)

  if (overview.isError) return <Alert variant="destructive"><AlertTitle>Couldn’t load the overview</AlertTitle><AlertDescription><p>{overview.error.message}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void overview.refetch()}>Try again</Button></AlertDescription></Alert>
  if (!overview.data) return <OverviewSkeleton />
  const data = overview.data

  return <div className="flex flex-col gap-6">
    <SeasonSummary season={season} data={data} today={today} />
    <LiveNow games={data.live ?? []} />
    <StatCards data={data} timeZone={timeZone} />
    {season.status === 'draft' ? <SetupChecklist data={data} season={season} today={today} />
      : season.status === 'active' ? <NeedsAttention data={data} season={season} league={league} timeZone={timeZone} />
      : <SeasonResults data={data} />}
    <div className="grid items-start gap-6 lg:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
        <UpcomingGames games={data.upcoming} timeZone={timeZone} today={today} />
        <RecentResults games={data.recent} timeZone={timeZone} />
      </div>
      <div className="flex min-w-0 flex-col gap-6">
        <StandingsCard divisions={data.divisions} />
        <SeasonLeaders leaders={data.leaders} />
      </div>
    </div>
    <DivisionsTable divisions={data.divisions} />
    <PlayoffsSection divisions={data.divisions} timeZone={timeZone} />
  </div>
}

function OverviewSkeleton() {
  return <div role="status" aria-label="Loading the season overview" className="flex flex-col gap-6">
    <Skeleton className="h-36 w-full rounded-xl" />
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-28 rounded-xl" />)}</div>
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
      <p className="truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl" title={value}>{value}</p>
      <p className="truncate text-xs text-muted-foreground" title={detail}>{detail}</p>
    </CardContent>
  </Card>
}

function StatCards({ data, timeZone }: { data: SeasonOverviewData; timeZone?: string | null }) {
  const { teams, players, divisions, games, completedGames } = data.totals
  const next = data.upcoming[0]
  return <section aria-label="Season totals" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
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
    <CardHeader className="border-b py-4 [.border-b]:pb-4">
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
    <CardHeader className="border-b py-4 [.border-b]:pb-4">
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
    <CardHeader className="border-b py-4 [.border-b]:pb-4"><CardTitle><h3 className="text-base font-semibold">Season results</h3></CardTitle></CardHeader>
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

// A side waiting for the standings or an earlier playoff game has no team yet, so its placeholder name is muted.
function TeamName({ name, teamId, bold = false }: { name: string; teamId: string | null; bold?: boolean }) {
  return <span className={cn(!teamId && 'text-muted-foreground', bold && 'font-semibold')}>{name}</span>
}

function SectionCard({ title, href, linkLabel, children }: { title: string; href: string; linkLabel: string; children: ReactNode }) {
  return <Card className="gap-0 py-0">
    <CardHeader className="items-center border-b py-3 [.border-b]:pb-3">
      <CardTitle><h3 className="text-base font-semibold">{title}</h3></CardTitle>
      <CardAction className="self-center"><Button variant="ghost" size="sm" nativeButton={false} render={<Link href={href} />}>{linkLabel}<ArrowRightIcon data-icon="inline-end" /></Button></CardAction>
    </CardHeader>
    {children}
  </Card>
}

function UpcomingGames({ games, timeZone, today }: { games: OverviewGame[]; timeZone?: string | null; today: string }) {
  return <SectionCard title="Upcoming games" href="/manage/games" linkLabel="All games">
    {games.length ? groupGamesByDay(games, timeZone, today).map((group) => <section key={group.key} aria-label={group.label}>
      <h4 className="border-b bg-muted/30 px-(--card-spacing) py-1.5 text-xs font-medium text-muted-foreground">{group.label}</h4>
      <ul className="divide-y border-b last:border-b-0">{group.games.map((game) => <li key={game.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-3 px-(--card-spacing) py-3 sm:grid-cols-[5rem_minmax(0,1fr)_auto]">
        <span className="pt-px text-sm tabular-nums text-muted-foreground">{game.scheduled_at ? formatGameTime(game.scheduled_at, timeZone) : '—'}</span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate text-sm font-medium"><TeamName name={game.home_name} teamId={game.home_season_team_id} /> <span className="font-normal text-muted-foreground">vs</span> <TeamName name={game.away_name} teamId={game.away_season_team_id} /></p>
          <p className="truncate text-xs text-muted-foreground">{[game.division_name, game.venue_name].filter(Boolean).join(' · ')}</p>
        </div>
        {stageLabel(game.stage) && <Badge variant="outline" className="col-start-2 justify-self-start sm:col-start-3">{stageLabel(game.stage)}</Badge>}
      </li>)}</ul>
    </section>) : <p className="px-(--card-spacing) py-8 text-center text-sm text-muted-foreground">No upcoming games. Generated and scheduled games appear here.</p>}
  </SectionCard>
}

function RecentResults({ games, timeZone }: { games: OverviewGame[]; timeZone?: string | null }) {
  return <SectionCard title="Recent results" href="/manage/games" linkLabel="All results">
    {games.length ? <ul className="divide-y">{games.map((game) => {
      const homeWon = (game.home_score ?? 0) > (game.away_score ?? 0)
      return <li key={game.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-3 px-(--card-spacing) py-3 sm:grid-cols-[5rem_minmax(0,1fr)_auto]">
        <span className="pt-px text-sm tabular-nums text-muted-foreground">{formatGameDateTime(game.scheduled_at, timeZone, { month: 'short', day: 'numeric' })}</span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="flex min-w-0 items-baseline gap-2 text-sm">
            <span className="truncate"><TeamName name={game.home_name} teamId={game.home_season_team_id} bold={homeWon} /></span>
            <span className="shrink-0 tabular-nums"><span className={cn(homeWon ? 'font-semibold' : 'text-muted-foreground')}>{game.home_score}</span> – <span className={cn(!homeWon ? 'font-semibold' : 'text-muted-foreground')}>{game.away_score}</span></span>
            <span className="truncate"><TeamName name={game.away_name} teamId={game.away_season_team_id} bold={!homeWon} /></span>
          </p>
          <p className="truncate text-xs text-muted-foreground">{[game.division_name, stageLabel(game.stage), game.venue_name].filter(Boolean).join(' · ')}</p>
        </div>
        {game.forfeited_by_season_team_id && <Badge variant="secondary" className="col-start-2 justify-self-start sm:col-start-3">Forfeit</Badge>}
      </li>
    })}</ul> : <p className="px-(--card-spacing) py-8 text-center text-sm text-muted-foreground">No results yet. Final scores appear here once recorded.</p>}
  </SectionCard>
}

const signed = (value: number) => value > 0 ? `+${value}` : String(value)

// Standings for one division at a time. The picker follows the workspace division, so Full standings opens the same one.
function StandingsCard({ divisions }: { divisions: OverviewDivision[] }) {
  const { division: workspaceDivision, changeDivision } = useWorkspace()
  const selected = divisions.find((division) => division.id === workspaceDivision?.id) ?? divisions[0]
  const rows = selected?.standings.slice(0, 6) ?? []
  const playoffLine = !!selected?.playoffs && selected.standings.length > 4
  return <Card className="gap-0 py-0">
    <CardHeader className="items-center border-b py-3 [.border-b]:pb-3">
      <CardTitle><h3 className="text-base font-semibold">Standings</h3></CardTitle>
      {divisions.length > 1 && <CardAction className="self-center">
        <Select value={selected?.id ?? null} onValueChange={(value) => { if (value) changeDivision(value) }} items={divisions.map((division) => ({ value: division.id, label: division.name }))}>
          <SelectTrigger size="sm" aria-label="Standings division" className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent alignItemWithTrigger={false}><SelectGroup>{divisions.map((division) => <SelectItem key={division.id} value={division.id}>{division.name}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </CardAction>}
    </CardHeader>
    {rows.length ? <Table className="table-fixed">
      <caption className="sr-only">Top teams in {selected!.name}, ordered by wins and point difference</caption>
      <TableHeader className="bg-muted/30"><TableRow>
        <TableHead scope="col" className="w-10 pl-(--card-spacing)">#</TableHead>
        <TableHead scope="col">Team</TableHead>
        <TableHead scope="col" className="w-16 text-right"><abbr title="Wins and losses" className="no-underline">W–L</abbr></TableHead>
        <TableHead scope="col" className="w-16 pr-(--card-spacing) text-right"><abbr title="Point difference" className="no-underline">Diff</abbr></TableHead>
      </TableRow></TableHeader>
      <TableBody>{rows.map((row, index) => <TableRow key={row.id} className={cn(playoffLine && index === 3 && 'border-b-2 border-dashed border-b-primary/30')}>
        <TableCell className="pl-(--card-spacing) tabular-nums text-muted-foreground">{index + 1}</TableCell>
        <TableCell className="truncate font-medium" title={row.name}>{row.name}</TableCell>
        <TableCell className="text-right tabular-nums">{row.wins}–{row.losses}</TableCell>
        <TableCell className="pr-(--card-spacing) text-right tabular-nums text-muted-foreground">{signed(row.pointDifference)}</TableCell>
      </TableRow>)}</TableBody>
    </Table> : <p className="px-(--card-spacing) py-8 text-center text-sm text-muted-foreground">{selected ? 'No teams in this division yet.' : 'Add divisions to see standings.'}</p>}
    <div className="flex items-center justify-between gap-3 border-t px-(--card-spacing) py-2.5">
      <span className="text-xs text-muted-foreground">{playoffLine ? 'Top four advance to the playoffs' : 'Ordered by wins, then point difference'}</span>
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/manage/standings" onClick={() => { if (selected) changeDivision(selected.id) }} />}>Full standings<ArrowRightIcon data-icon="inline-end" /></Button>
    </div>
  </Card>
}

function divisionStatus(division: OverviewDivision) {
  if (!division.scheduled) return { label: 'Not scheduled', className: 'border-border text-muted-foreground' }
  const finished = division.playoffs ? division.playoffs.stage === 'complete' : division.games > 0 && division.completedGames === division.games
  if (finished) return { label: 'Complete', className: 'border-transparent bg-secondary text-secondary-foreground' }
  if (division.playoffs && division.playoffs.stage !== 'waiting') return { label: 'Playoffs', className: 'border-amber-600/20 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' }
  return { label: 'Round robin', className: 'border-sky-600/20 bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300' }
}

function DivisionsTable({ divisions }: { divisions: OverviewDivision[] }) {
  return <Card className="gap-0 py-0">
    <CardHeader className="items-center border-b py-3 [.border-b]:pb-3">
      <CardTitle><h3 className="text-base font-semibold">Divisions</h3></CardTitle>
      <CardAction className="self-center"><Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/manage/divisions" />}>Manage<ArrowRightIcon data-icon="inline-end" /></Button></CardAction>
    </CardHeader>
    {divisions.length ? <Table>
      <caption className="sr-only">Progress of each division</caption>
      <TableHeader className="bg-muted/30"><TableRow>
        <TableHead scope="col" className="pl-(--card-spacing)">Division</TableHead>
        <TableHead scope="col" className="w-20 text-right">Teams</TableHead>
        <TableHead scope="col" className="hidden w-20 text-right sm:table-cell">Players</TableHead>
        <TableHead scope="col" className="hidden w-56 md:table-cell">Games played</TableHead>
        <TableHead scope="col" className="w-32 pr-(--card-spacing)">Status</TableHead>
      </TableRow></TableHeader>
      <TableBody>{divisions.map((division) => {
        const status = divisionStatus(division)
        return <TableRow key={division.id}>
          <TableCell className="pl-(--card-spacing) font-medium">{division.name}</TableCell>
          <TableCell className="text-right tabular-nums">{division.teams}</TableCell>
          <TableCell className="hidden text-right tabular-nums sm:table-cell">{division.players}</TableCell>
          <TableCell className="hidden md:table-cell">
            <div className="flex items-center gap-3">
              <Progress value={division.games ? Math.round((division.completedGames / division.games) * 100) : 0} aria-label={`${division.name} games played`} className="flex-1" />
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{division.completedGames}/{division.games}</span>
            </div>
          </TableCell>
          <TableCell className="pr-(--card-spacing)"><Badge variant="outline" className={status.className}>{status.label}</Badge></TableCell>
        </TableRow>
      })}</TableBody>
    </Table> : <p className="px-(--card-spacing) py-8 text-center text-sm text-muted-foreground">No divisions in this season yet.</p>}
  </Card>
}

const playoffStageLabel = { waiting: 'After round robin', quarterfinals: 'Quarterfinals', semifinals: 'Semifinals', final: 'Championship', complete: 'Champion decided' }

// One compact card per division with playoffs: its stage and next playoff game, or the champion.
function PlayoffsSection({ divisions, timeZone }: { divisions: OverviewDivision[]; timeZone?: string | null }) {
  const withPlayoffs = divisions.filter((division) => division.playoffs)
  if (!withPlayoffs.length) return null
  return <section aria-labelledby="overview-playoffs-heading" className="flex flex-col gap-3">
    <div className="flex items-center justify-between gap-3">
      <h3 id="overview-playoffs-heading" className="text-base font-semibold">Playoffs</h3>
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/manage/games" onClick={() => saveGamesView('bracket')} />}>View brackets<ArrowRightIcon data-icon="inline-end" /></Button>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{withPlayoffs.map((division) => {
      const playoffs = division.playoffs!
      const next = playoffs.nextGame
      return <Card key={division.id} size="sm">
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">{division.name}</span>
            <Badge variant="outline" className="shrink-0">{playoffStageLabel[playoffs.stage]}</Badge>
          </div>
          {playoffs.champion ? <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300"><TrophyIcon aria-hidden="true" className="size-4" /></span>
            <div className="flex min-w-0 flex-col"><span className="text-xs text-muted-foreground">Champion</span><span className="truncate font-semibold" title={playoffs.champion}>{playoffs.champion}</span></div>
          </div> : next ? <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{stageLabel(next.stage)} · {formatGameDateTime(next.scheduled_at, timeZone, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            <span className="truncate text-sm font-medium"><TeamName name={next.home_name} teamId={next.home_season_team_id} /> <span className="font-normal text-muted-foreground">vs</span> <TeamName name={next.away_name} teamId={next.away_season_team_id} /></span>
          </div> : <span className="text-sm text-muted-foreground">No playoff games left to schedule.</span>}
        </CardContent>
      </Card>
    })}</div>
  </section>
}

// Games being scored right now, with their running score and a link to the console.
function LiveNow({ games }: { games: OverviewGame[] }) {
  if (!games.length) return null
  return <Card className="gap-0 border-red-600/30 py-0">
    <CardHeader className="items-center border-b py-3 [.border-b]:pb-3">
      <CardTitle><h3 className="flex items-center gap-2 text-base font-semibold"><span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-red-600" />Live now</h3></CardTitle>
    </CardHeader>
    <ul className="divide-y">{games.map((game) => <li key={game.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-(--card-spacing) py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex min-w-0 items-baseline gap-2 text-sm font-medium"><span className="truncate">{game.home_name}</span><span className="shrink-0 tabular-nums text-red-600 dark:text-red-400">{game.live_home_score ?? 0} – {game.live_away_score ?? 0}</span><span className="truncate">{game.away_name}</span></p>
        <p className="truncate text-xs text-muted-foreground">{[game.division_name, stageLabel(game.stage), game.venue_name].filter(Boolean).join(' · ')}</p>
      </div>
      <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/scorekeeping/games/${game.id}`} />}>Open<ArrowRightIcon data-icon="inline-end" /></Button>
    </li>)}</ul>
  </Card>
}

const leaderCategories = [{ key: 'points', label: 'Points' }, { key: 'rebounds', label: 'Rebounds' }, { key: 'assists', label: 'Assists' }] as const

// The season's best per-game players from games scored live.
function SeasonLeaders({ leaders }: { leaders: SeasonOverviewData['leaders'] }) {
  if (!leaders || leaderCategories.every(({ key }) => !leaders[key].length)) return null
  return <Card className="gap-0 py-0">
    <CardHeader className="border-b py-3 [.border-b]:pb-3"><CardTitle><h3 className="text-base font-semibold">Season leaders</h3></CardTitle><CardDescription>Per game, from games scored live</CardDescription></CardHeader>
    <div className="divide-y">{leaderCategories.map(({ key, label }) => leaders[key].length > 0 && <section key={key} aria-label={`${label} leaders`} className="flex flex-col gap-2 px-(--card-spacing) py-3">
      <h4 className="text-xs font-medium text-muted-foreground">{label}</h4>
      <ol className="flex flex-col gap-1.5">{leaders[key].slice(0, 3).map((leader, index) => <li key={leader.rosterId} className="flex items-center gap-3 text-sm">
        <span className="w-3 shrink-0 tabular-nums text-muted-foreground">{index + 1}</span>
        <span className="flex min-w-0 flex-1 flex-col"><span className={cn('truncate', index === 0 && 'font-medium')}>{leader.name}</span><span className="truncate text-xs text-muted-foreground">{leader.teamName} · {leader.divisionName}</span></span>
        <span className="shrink-0 font-semibold tabular-nums">{leader.perGame.toFixed(1)}</span>
      </li>)}</ol>
    </section>)}</div>
  </Card>
}
