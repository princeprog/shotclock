import type { CSSProperties } from 'react'
import { AwardIcon } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatGameDateTime } from '@/lib/league-time'
import { periodLabel, type LivePlayer, type LiveState, type LiveTeam } from '@/lib/live-scoring'
import { stageLabel } from '@/lib/season-overview'

const statColumns = [
  { key: 'points', label: 'PTS', title: 'Points' },
  { key: 'rebounds', label: 'REB', title: 'Rebounds' },
  { key: 'assists', label: 'AST', title: 'Assists' },
  { key: 'steals', label: 'STL', title: 'Steals' },
  { key: 'blocks', label: 'BLK', title: 'Blocks' },
  { key: 'turnovers', label: 'TO', title: 'Turnovers' },
  { key: 'fouls', label: 'PF', title: 'Personal fouls' },
] as const satisfies readonly { key: keyof LivePlayer; label: string; title: string }[]
type StatKey = (typeof statColumns)[number]['key']
type Totals = Record<StatKey, number>

function teamTotals(team: LiveTeam) {
  return Object.fromEntries(statColumns.map(({ key }) => [key, team.players.reduce((sum, player) => sum + player[key], 0)])) as Totals
}

function TeamMark({ name, className }: { name: string; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join('').toLocaleUpperCase()
  return <span aria-hidden="true" className={cn('flex shrink-0 items-center justify-center rounded-lg bg-[#E67145]/10 font-semibold text-[#A64320] dark:text-[#FFAE88]', className)}>{initials}</span>
}

// A finished live-scored game: final score and line score, best player, team totals and each team's box score.
export function FinalBoxScore({ view }: { view: LiveState }) {
  const homeWon = view.home.score > view.away.score
  const home = teamTotals(view.home)
  const away = teamTotals(view.away)
  return <div className="flex flex-col gap-4">
    <Scoreboard view={view} homeWon={homeWon} />
    <div className={cn('grid gap-4', view.bestPlayer && 'lg:grid-cols-2')}>
      {view.bestPlayer && <BestPlayer player={view.bestPlayer} />}
      <TeamComparison view={view} home={home} away={away} />
    </div>
    <TeamBoxScore team={view.home} totals={home} won={homeWon} bestRosterId={view.bestPlayer?.rosterId} />
    <TeamBoxScore team={view.away} totals={away} won={!homeWon} bestRosterId={view.bestPlayer?.rosterId} />
  </div>
}

function Scoreboard({ view, homeWon }: { view: LiveState; homeWon: boolean }) {
  const overtime = view.period > view.format.periodCount
  const stage = stageLabel(view.stage)
  const sides = [['home', view.home], ['away', view.away]] as const
  return <Card className="gap-0 py-0">
    <section aria-label="Final score" className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 py-6 sm:gap-6 sm:px-8 sm:py-8">
      <FinalTeam team={view.home} won={homeWon} />
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold tracking-wide uppercase">{overtime ? `Final/${periodLabel(view.period, view.format.periodCount)}` : 'Final'}</span>
        {view.scheduledAt && <span className="text-xs text-muted-foreground">{formatGameDateTime(view.scheduledAt, view.timeZone, { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
        {stage && <span className="text-xs font-medium text-muted-foreground">{stage}</span>}
      </div>
      <FinalTeam team={view.away} won={!homeWon} align="end" />
    </section>
    {view.periodScores.length > 0 && <div className="border-t">
      <Table aria-label="Score by period">
        <TableHeader><TableRow className="hover:bg-transparent">
          <TableHead className="pl-4 sm:pl-8">Team</TableHead>
          {view.periodScores.map((line) => <TableHead key={line.period} className="w-12 text-center">{periodLabel(line.period, view.format.periodCount)}</TableHead>)}
          <TableHead className="w-14 pr-4 text-center sm:pr-8"><abbr title="Total" className="no-underline">T</abbr></TableHead>
        </TableRow></TableHeader>
        <TableBody>{sides.map(([side, team]) => <TableRow key={side} className="hover:bg-transparent">
          <TableCell className="max-w-0 truncate pl-4 font-medium sm:pl-8">{team.name}</TableCell>
          {view.periodScores.map((line) => <TableCell key={line.period} className="text-center tabular-nums text-muted-foreground">{line[side]}</TableCell>)}
          <TableCell className="pr-4 text-center font-semibold tabular-nums sm:pr-8">{team.score}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </div>}
  </Card>
}

function FinalTeam({ team, won, align = 'start' }: { team: LiveTeam; won: boolean; align?: 'start' | 'end' }) {
  return <div className={cn('flex min-w-0 items-center gap-4', align === 'end' && 'flex-row-reverse text-right')}>
    <TeamMark name={team.name} className="hidden size-12 text-base sm:flex" />
    <div className={cn('flex min-w-0 flex-col gap-1', align === 'end' && 'items-end')}>
      <span className="max-w-full truncate text-sm font-medium sm:text-base" title={team.name}>{team.name}</span>
      <span className={cn('text-4xl leading-none font-semibold tabular-nums sm:text-6xl', !won && 'text-muted-foreground')}>{team.score}</span>
    </div>
  </div>
}

function BestPlayer({ player }: { player: NonNullable<LiveState['bestPlayer']> }) {
  return <Card className="gap-0 py-0">
    <section aria-labelledby="best-player" className="flex h-full flex-col gap-5 p-5 sm:p-6">
      <h2 id="best-player" className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><AwardIcon aria-hidden="true" className="size-4 text-amber-600 dark:text-amber-400" />Best player</h2>
      <div className="flex min-w-0 items-center gap-4">
        <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-full bg-amber-100 text-lg font-semibold tabular-nums text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">{player.jersey ?? '–'}</span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate text-xl font-semibold">{player.name}</p>
          <p className="truncate text-sm text-muted-foreground">{player.teamName}{player.jersey !== null && ` · #${player.jersey}`}</p>
        </div>
      </div>
      <dl className="mt-auto grid grid-cols-5 divide-x rounded-lg border">{statColumns.slice(0, 5).map(({ key, label, title }) => <div key={key} className="flex flex-col-reverse items-center gap-0.5 py-3">
        <dt className="text-xs text-muted-foreground"><abbr title={title} className="no-underline">{label}</abbr></dt>
        <dd className="text-xl font-semibold tabular-nums">{player[key]}</dd>
      </div>)}</dl>
    </section>
  </Card>
}

// Team totals side by side. Each bar shows a team's share of that stat between the two teams.
function TeamComparison({ view, home, away }: { view: LiveState; home: Totals; away: Totals }) {
  const share = (value: number, total: number): CSSProperties => ({ width: total ? `${(value / total) * 100}%` : '0%' })
  return <Card className="gap-0 py-0">
    <section aria-labelledby="team-stats" className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium"><span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-[#E67145]" /><span className="truncate">{view.home.name}</span></span>
        <h2 id="team-stats" className="text-xs font-medium text-muted-foreground">Team stats</h2>
        <span className="flex min-w-0 items-center justify-end gap-2 text-sm font-medium"><span className="truncate">{view.away.name}</span><span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-slate-500" /></span>
      </div>
      <ul className="flex flex-col gap-3">{statColumns.slice(1).map(({ key, title }) => {
        const total = home[key] + away[key]
        return <li key={key} aria-label={`${title}: ${view.home.name} ${home[key]}, ${view.away.name} ${away[key]}`} className="grid grid-cols-[2rem_minmax(0,1fr)_6.5rem_minmax(0,1fr)_2rem] items-center gap-2 text-sm">
          <span aria-hidden="true" className="font-medium tabular-nums">{home[key]}</span>
          <span aria-hidden="true" className="flex h-1.5 justify-end overflow-hidden rounded-full bg-muted"><span className="h-full rounded-full bg-[#E67145]" style={share(home[key], total)} /></span>
          <span aria-hidden="true" className="text-center text-xs text-muted-foreground">{title}</span>
          <span aria-hidden="true" className="flex h-1.5 overflow-hidden rounded-full bg-muted"><span className="h-full rounded-full bg-slate-500" style={share(away[key], total)} /></span>
          <span aria-hidden="true" className="text-right font-medium tabular-nums">{away[key]}</span>
        </li>
      })}</ul>
    </section>
  </Card>
}

function TeamBoxScore({ team, totals, won, bestRosterId }: { team: LiveTeam; totals: Totals; won: boolean; bestRosterId?: string }) {
  const headingId = `box-score-${team.seasonTeamId}`
  return <Card className="gap-0 py-0">
    <section aria-labelledby={headingId}>
      <div className="flex items-center gap-3 border-b px-4 py-3.5 sm:px-6">
        <TeamMark name={team.name} className="size-9 text-xs" />
        <h2 id={headingId} className="min-w-0 flex-1 truncate text-base font-semibold">{team.name}</h2>
        {won ? <Badge variant="seasonActive">Won</Badge> : <Badge className="bg-red-600 text-white">Lost</Badge>}
        <span className="text-lg font-semibold tabular-nums">{team.score}</span>
      </div>
      <Table className="min-w-[36rem]">
        <TableHeader><TableRow className="hover:bg-transparent">
          <TableHead className="sticky left-0 z-10 bg-card pl-4 text-xs text-muted-foreground sm:pl-6">Player</TableHead>
          {statColumns.map(({ key, label, title }) => <TableHead key={key} className="w-14 text-right text-xs text-muted-foreground last:pr-4 sm:last:pr-6"><abbr title={title} className="no-underline">{label}</abbr></TableHead>)}
        </TableRow></TableHeader>
        <TableBody>{team.players.map((player) => {
          const recorded = statColumns.some(({ key }) => player[key] > 0)
          return <TableRow key={player.rosterId} className={cn('hover:bg-transparent', !recorded && 'text-muted-foreground')}>
            <TableCell className="sticky left-0 z-10 bg-card pl-4 sm:pl-6">
              <span className="flex items-center gap-3">
                <span className="w-6 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">{player.jersey ?? '–'}</span>
                <span className={cn(recorded && 'font-medium')}>{player.name}</span>
                {player.rosterId === bestRosterId && <><AwardIcon aria-hidden="true" className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" /><span className="sr-only">Best player</span></>}
              </span>
            </TableCell>
            {statColumns.map(({ key }) => <TableCell key={key} className={cn('text-right tabular-nums last:pr-4 sm:last:pr-6', key === 'points' && recorded && 'font-semibold')}>{player[key]}</TableCell>)}
          </TableRow>
        })}</TableBody>
        <TableFooter className="bg-transparent"><TableRow className="hover:bg-transparent">
          <TableCell className="sticky left-0 z-10 bg-card pl-4 font-semibold sm:pl-6"><span className="flex items-center gap-3"><span className="w-6 shrink-0" />Totals</span></TableCell>
          {statColumns.map(({ key }) => <TableCell key={key} className="text-right font-semibold tabular-nums last:pr-4 sm:last:pr-6">{totals[key]}</TableCell>)}
        </TableRow></TableFooter>
      </Table>
    </section>
  </Card>
}

