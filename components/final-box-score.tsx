import { AwardIcon } from 'lucide-react'
import { cn } from 'cn'
import { LineScore, PlayerTable } from '@/components/live-box-score'
import { sideColor, type Side } from '@/components/scoring-workspace'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatGameDateTime } from '@/lib/league-time'
import { periodLabel, type LivePlayer, type LiveState, type LiveTeam } from '@/lib/live-scoring'
import { stageLabel } from '@/lib/season-overview'
import styles from './final-box-score.module.css'

type StatKey = Exclude<keyof LivePlayer, 'rosterId' | 'name' | 'jersey'>
const sides = ['home', 'away'] as const
const panelClass = cn('gap-4 rounded-xl border py-5 shadow-xs ring-0', styles.rise)
const bestStats = [['points', 'PTS', 'Points'], ['rebounds', 'REB', 'Rebounds'], ['assists', 'AST', 'Assists'], ['steals', 'STL', 'Steals'], ['blocks', 'BLK', 'Blocks']] as const
const comparisons = [['rebounds', 'Rebounds'], ['assists', 'Assists'], ['steals', 'Steals'], ['blocks', 'Blocks'], ['turnovers', 'Turnovers'], ['fouls', 'Fouls']] as const

const total = (team: LiveTeam, key: StatKey) => team.players.reduce((sum, player) => sum + player[key], 0)
// Cards rise in one after another, 50ms apart; reduced motion keeps only the fade.
const stagger = (step: number) => ({ animationDelay: `${step * 50}ms` })

function Dot({ side }: { side: Side }) {
  return <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', sideColor[side])} />
}

// A finished live-scored game: the result with its line score, the best player, team stats and each team's box score.
export function FinalBoxScore({ view }: { view: LiveState }) {
  const winner: Side = view.home.score > view.away.score ? 'home' : 'away'
  return <div className="flex flex-col gap-4 lg:gap-5">
    <Result view={view} winner={winner} />
    <div className={cn('grid gap-4 lg:gap-5', view.bestPlayer && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]')}>
      {view.bestPlayer && <BestPlayer player={view.bestPlayer} side={view.bestPlayer.seasonTeamId === view.home.seasonTeamId ? 'home' : 'away'} />}
      <TeamStats view={view} />
    </div>
    <div className="grid gap-4 lg:gap-5 xl:grid-cols-2 xl:items-start">
      {sides.map((side, index) => <TeamBoxScore key={side} team={view[side]} side={side} step={3 + index} bestRosterId={view.bestPlayer?.rosterId} />)}
    </div>
    <p className="text-xs text-muted-foreground">Bold marks each team’s high in points, rebounds, assists, steals and blocks. Fouls turn amber at four and red at five.</p>
  </div>
}

function Result({ view, winner }: { view: LiveState; winner: Side }) {
  const overtime = view.period > view.format.periodCount
  const played = view.scheduledAt && formatGameDateTime(view.scheduledAt, view.timeZone, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  return <Card className={cn(panelClass, 'gap-0 py-0')}>
    <section aria-label="Final score" className="grid grid-cols-2 items-center gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:px-8 sm:py-6">
      <FinalTeam team={view.home} side="home" won={winner === 'home'} />
      <div className="col-span-2 flex flex-col items-center gap-1.5 text-center sm:col-span-1 sm:col-start-2 sm:row-start-1">
        <Badge variant="secondary" className="h-6 px-2.5 text-xs font-semibold">{overtime ? `Final/${periodLabel(view.period, view.format.periodCount)}` : 'Final'}</Badge>
        {(played || view.venueName) && <p className="text-sm text-muted-foreground">{[played, view.venueName].filter(Boolean).join(' · ')}</p>}
        <p className="text-sm text-muted-foreground">{[view.leagueName, view.divisionName, stageLabel(view.stage)].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="col-start-2 row-start-1 sm:col-start-3"><FinalTeam team={view.away} side="away" won={winner === 'away'} /></div>
    </section>
    {view.periodScores.length > 0 && <LineScore view={view} final className="rounded-none border-0 border-t" />}
  </Card>
}

function FinalTeam({ team, side, won }: { team: LiveTeam; side: Side; won: boolean }) {
  const away = side === 'away'
  return <div className={cn('flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-6', away ? 'items-end text-right lg:flex-row-reverse' : 'items-start')}>
    <div className="min-w-0">
      <h2 className={cn('flex items-center gap-2 text-xl leading-tight font-semibold tracking-tight lg:text-2xl', away && 'flex-row-reverse')}><Dot side={side} /><span className="break-words">{team.name}</span></h2>
      <p className="mt-1 text-sm text-muted-foreground">{away ? 'Away' : 'Home'}</p>
    </div>
    <div className={cn('flex items-center gap-3', away && 'flex-row-reverse')}>
      <strong className={cn('text-5xl leading-none font-bold tracking-tight tabular-nums lg:text-7xl', !won && 'text-muted-foreground')}>{team.score}</strong>
      {won && <Badge className="bg-emerald-50 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">Won</Badge>}
    </div>
  </div>
}

function BestPlayer({ player, side }: { player: NonNullable<LiveState['bestPlayer']>; side: Side }) {
  return <Card className={panelClass} style={stagger(1)}>
    <CardHeader><CardTitle><h2 className="flex items-center gap-2 text-base font-semibold"><AwardIcon aria-hidden="true" className="size-4 text-amber-600 dark:text-amber-400" />Best player</h2></CardTitle></CardHeader>
    <CardContent className="gap-5">
      <div className="flex min-w-0 items-center gap-4">
        <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full bg-amber-100 text-xl font-bold text-amber-900 tabular-nums dark:bg-amber-500/15 dark:text-amber-200">{player.jersey ?? '–'}</span>
        <div className="min-w-0">
          <p className="text-xl leading-tight font-semibold break-words">{player.name}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><Dot side={side} />{player.teamName}{player.jersey !== null && ` · #${player.jersey}`}</p>
        </div>
      </div>
      <dl className="grid grid-cols-5 divide-x border-t pt-4">{bestStats.map(([key, label, title]) => <div key={key} className="flex flex-col-reverse items-center gap-0.5">
        <dt className="text-xs text-muted-foreground"><abbr title={title} className="no-underline">{label}</abbr></dt>
        <dd className="text-2xl font-semibold tabular-nums">{player[key]}</dd>
      </div>)}</dl>
    </CardContent>
  </Card>
}

// Each pair of bars splits one stat between the teams, growing outward from the label in the middle.
function TeamStats({ view }: { view: LiveState }) {
  const share = (value: number, sum: number) => ({ width: sum ? `${(value / sum) * 100}%` : '0%' })
  return <Card className={panelClass} style={stagger(2)}>
    <CardHeader>
      <CardTitle><h2 className="text-base font-semibold">Team stats</h2></CardTitle>
      <CardDescription className="flex flex-wrap gap-x-4 gap-y-1">{sides.map((side) => <span key={side} className="flex items-center gap-1.5"><Dot side={side} />{view[side].name}</span>)}</CardDescription>
    </CardHeader>
    <CardContent>
      <ul className="grid gap-3">{comparisons.map(([key, label]) => {
        const home = total(view.home, key)
        const away = total(view.away, key)
        return <li key={key} className="grid grid-cols-[2rem_minmax(0,1fr)_5.5rem_minmax(0,1fr)_2rem] items-center gap-2 text-sm sm:gap-3">
          <span className="sr-only">{label}: {view.home.name} {home}, {view.away.name} {away}</span>
          <span aria-hidden="true" className={cn('tabular-nums', home > away ? 'font-semibold' : 'text-muted-foreground')}>{home}</span>
          <span aria-hidden="true" className="flex h-2 justify-end overflow-hidden rounded-full bg-muted"><span className={cn('h-full rounded-full', sideColor.home, styles.bar, styles.fromRight)} style={share(home, home + away)} /></span>
          <span aria-hidden="true" className="text-center text-muted-foreground">{label}</span>
          <span aria-hidden="true" className="flex h-2 overflow-hidden rounded-full bg-muted"><span className={cn('h-full rounded-full', sideColor.away, styles.bar)} style={share(away, home + away)} /></span>
          <span aria-hidden="true" className={cn('text-right tabular-nums', away > home ? 'font-semibold' : 'text-muted-foreground')}>{away}</span>
        </li>
      })}</ul>
    </CardContent>
  </Card>
}

function TeamBoxScore({ team, side, step, bestRosterId }: { team: LiveTeam; side: Side; step: number; bestRosterId?: string }) {
  return <Card className={cn(panelClass, 'gap-0 py-0')} style={stagger(step)}>
    <CardHeader className="border-b py-4 [.border-b]:pb-4">
      <CardTitle><h2 className="flex items-center gap-2 text-lg leading-tight font-semibold"><Dot side={side} />{team.name}<span className="text-sm font-normal text-muted-foreground">{side === 'home' ? 'Home' : 'Away'}</span></h2></CardTitle>
      <CardAction className="self-center text-2xl font-bold tabular-nums">{team.score}</CardAction>
    </CardHeader>
    <PlayerTable team={team} bestRosterId={bestRosterId} className="rounded-none border-0" />
  </Card>
}
