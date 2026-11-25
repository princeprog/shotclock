'use client'

import { Fragment, type ReactNode } from 'react'
import { CheckIcon, HistoryIcon, TimerIcon, Undo2Icon, UserRoundIcon } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { describePlay, formatClock, periodLabel, type LivePlay, type LivePlayer, type LiveState, type LiveTeam, type PlayKind } from '@/lib/live-scoring'
import styles from './scorekeeper-console.module.css'

export type PlayerSelection = { teamId: string; rosterId: string } | null
export type Side = 'home' | 'away'
type RecordPlay = (kind: PlayKind, points?: number) => void

// Shotclock orange marks the home side, slate the away side, in the scoreboard, the line score and the rosters.
// The fallbacks keep the jersey badge readable if the console stylesheet has not loaded yet.
export const sideColor: Record<Side, string> = { home: 'bg-(--home,#e67145)', away: 'bg-(--away,#64748b)' }
const scores = [1, 2, 3] as const
const statistics = [
  ['rebound', 'Rebound'], ['assist', 'Assist'], ['steal', 'Steal'],
  ['block', 'Block'], ['turnover', 'Turnover'], ['foul', 'Foul'],
] as const
const panelClass = 'min-w-0 gap-0 rounded-xl border py-0 shadow-xs ring-0 [--card-spacing:1rem] lg:[--card-spacing:1.25rem]'

export function deskClock(ms: number) {
  const time = formatClock(ms)
  return time.includes(':') ? time.padStart(5, '0') : time
}

function TeamScore({ team, side }: { team: LiveTeam; side: Side }) {
  const away = side === 'away'
  return <div className={cn('flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4', away ? 'items-end text-right lg:flex-row-reverse' : 'items-start')}>
    <div className="min-w-0">
      <h2 className={cn('flex items-center gap-2 text-xl leading-tight font-semibold tracking-tight lg:text-2xl', away && 'flex-row-reverse')}>
        <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', sideColor[side])} /><span className="break-words">{team.name}</span>
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{away ? 'Away' : 'Home'} · {team.teamFouls} {team.teamFouls === 1 ? 'foul' : 'fouls'}
        {team.inBonus && <strong className="ml-1.5 font-semibold text-amber-700 dark:text-amber-400">Bonus</strong>}
      </p>
    </div>
    <strong aria-live="polite" className="shrink-0 text-5xl leading-none font-bold tracking-tight tabular-nums lg:text-6xl">{team.score}</strong>
  </div>
}

// The line score drawn as paired bars, so the scorekeeper sees how each period went while entering plays.
function LineScore({ view }: { view: LiveState }) {
  const lines = view.periodScores
  const most = Math.max(1, ...lines.map((line) => Math.max(line.home, line.away)))
  const summary = lines.map((line) => `${periodLabel(line.period, view.format.periodCount)} ${view.home.name} ${line.home}, ${view.away.name} ${line.away}`).join('; ')
  return <figure role="img" aria-label={`Line score. ${summary}`} className="flex h-28 items-end justify-center gap-2 sm:gap-3 lg:gap-4">
    {lines.map((line) => {
      const played = line.period <= view.period
      return <div key={line.period} className={cn('flex h-full min-w-9 flex-1 basis-14 flex-col items-center gap-1 rounded-md px-1 pt-1 sm:max-w-16', line.period === view.period && 'bg-muted/70')}>
        <div className="flex w-full flex-1 items-end justify-center gap-1 border-b">
          {(['home', 'away'] as const).map((side) => <span key={side} className={cn('w-1/3 max-w-5 rounded-t-sm motion-safe:transition-[height] motion-safe:duration-500 motion-safe:ease-out', sideColor[side])}
            style={{ height: played ? `max(3px, ${(line[side] / most) * 100}%)` : 0 }} />)}
        </div>
        <span className={cn('text-xs tabular-nums', line.period === view.period ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{periodLabel(line.period, view.format.periodCount)}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{played ? `${line.home}–${line.away}` : '–'}</span>
      </div>
    })}
  </figure>
}

export function GameFlowBoard({ view, children }: { view: LiveState; children: ReactNode }) {
  return <Card className="gap-0 rounded-xl border py-0 shadow-xs ring-0">
    <div className="grid grid-cols-2 items-center gap-x-6 gap-y-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,20rem)_minmax(0,1fr)] sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,26rem)_minmax(0,1fr)] lg:gap-x-10 lg:px-8">
      <TeamScore team={view.home} side="home" />
      <div className="col-span-2 sm:col-span-1 sm:col-start-2 sm:row-start-1"><LineScore view={view} /></div>
      <div className="col-start-2 row-start-1 sm:col-start-3"><TeamScore team={view.away} side="away" /></div>
    </div>
    {children}
  </Card>
}

// Until a player is selected the score buttons stay outlined, so the resting pad does not shout.
function PlayButtons({ disabled, idle = false, onPlay }: { disabled: boolean; idle?: boolean; onPlay: RecordPlay }) {
  return <div className="grid grid-cols-3 gap-2">
    {scores.map((points) => <Button key={points} variant={idle ? 'outline' : 'default'} disabled={disabled} onClick={() => onPlay('points', points)} className="mb-1 h-14 text-2xl font-semibold">+{points}</Button>)}
    {statistics.map(([kind, name]) => <Button key={kind} variant="outline" disabled={disabled} onClick={() => onPlay(kind)} className="h-12 px-1">{name}</Button>)}
  </div>
}

// The most recent play, with Undo. A fresh play arrives with a brief orange wash, the confirmation the scorekeeper looks for.
function PlayReceipt({ view, canUndo, freshPlayId, onUndo }: { view: LiveState; canUndo: boolean; freshPlayId: string | null; onUndo: (play: LivePlay) => void }) {
  const play = view.plays[0]
  const team = play?.seasonTeamId === view.home.seasonTeamId ? view.home : view.away
  let description = 'No plays recorded yet.'
  if (play?.kind === 'timeout') description = `${team.name} timeout`
  else if (play?.kind === 'period_end') description = `End of ${periodLabel(play.period, view.format.periodCount)}`
  else if (play?.kind === 'points') description = `${play.player ?? team.name} +${play.points}`
  else if (play) description = `${play.player ?? team.name} · ${describePlay({ ...play, player: null })}`
  return <div aria-live="polite">
    <div key={play?.id ?? 'none'} className={cn('flex min-h-14 items-center gap-3 rounded-lg border bg-muted/40 py-1.5 pr-1.5 pl-3', play && !play.voided && play.id === freshPlayId && styles.confirm)}>
      <HistoryIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <p className={cn('min-w-0 flex-1 text-sm', play?.voided && 'text-muted-foreground line-through')}>
        {play && <span className="text-muted-foreground tabular-nums">{periodLabel(play.period, view.format.periodCount)}{play.clockMs !== null && ` ${deskClock(play.clockMs)}`} · </span>}
        <span className="font-medium">{description}</span>
        {play?.kind === 'points' && !play.voided && <> · <span className="whitespace-nowrap">{view.home.name} {view.home.score}–{view.away.score} {view.away.name}</span></>}
      </p>
      {play?.voided && <span className="text-sm text-muted-foreground">Undone</span>}
      {canUndo && play && !play.voided && play.kind !== 'period_end' && <Button variant="outline" className="min-h-11" onClick={() => onUndo(play)}><Undo2Icon data-icon="inline-start" />Undo</Button>}
    </div>
  </div>
}

function RosterPanel({ team, side, selected, disabled, receipt, onSelect, onPlay, onTimeout }: {
  team: LiveTeam; side: Side; selected: PlayerSelection; disabled: boolean; receipt: ReactNode
  onSelect: (value: PlayerSelection) => void; onPlay: RecordPlay; onTimeout?: (teamId: string) => void
}) {
  return <Card className={panelClass}>
    <CardHeader className="border-b py-3 [.border-b]:pb-3">
      <CardTitle><h3 className="flex items-center gap-2 text-lg leading-tight font-semibold"><span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', sideColor[side])} />{team.name}</h3></CardTitle>
      <CardDescription>{side === 'home' ? 'Home' : 'Away'} · {team.timeouts} {team.timeouts === 1 ? 'timeout' : 'timeouts'} used</CardDescription>
      {onTimeout && team.seasonTeamId && <CardAction className="self-center">
        <Button variant="outline" className="min-h-11" disabled={disabled} aria-label={`Timeout for ${team.name}`} onClick={() => onTimeout(team.seasonTeamId!)}><TimerIcon data-icon="inline-start" />Timeout</Button>
      </CardAction>}
    </CardHeader>
    {team.players.length ? <Table className="table-fixed text-base">
      <TableCaption className="sr-only">{team.name} roster</TableCaption>
      <TableHeader className="[&_th]:h-9 [&_th]:text-xs [&_th]:font-semibold [&_th]:text-muted-foreground">
        <TableRow className="hover:bg-transparent"><TableHead scope="col" className="w-8"><span className="sr-only">Selected</span></TableHead><TableHead scope="col" className="w-12">No.</TableHead><TableHead scope="col">Player</TableHead><TableHead scope="col" className="w-14 text-center">PTS</TableHead><TableHead scope="col" className="w-14 pr-4 text-center">PF</TableHead></TableRow>
      </TableHeader>
      <TableBody>{team.players.map((player: LivePlayer) => {
        const active = selected !== null && selected.teamId === team.seasonTeamId && selected.rosterId === player.rosterId
        function select() {
          if (!disabled && team.seasonTeamId) onSelect(active ? null : { teamId: team.seasonTeamId, rosterId: player.rosterId })
        }
        return <Fragment key={player.rosterId}>
          <TableRow data-state={active ? 'selected' : undefined} className={cn('relative h-12 data-[state=selected]:bg-accent', !disabled && 'cursor-pointer')}>
            <TableCell className="pl-3">{active && <CheckIcon aria-hidden="true" className="size-5 text-orange-700 dark:text-orange-400" />}</TableCell>
            <TableCell className="font-medium text-muted-foreground tabular-nums">{player.jersey ?? '–'}</TableCell>
            <TableCell className="py-0"><Button variant="ghost" disabled={disabled} onClick={select} aria-label={`Select ${player.name}`} aria-pressed={active}
              className="h-auto min-h-11 max-w-full justify-start px-0 text-left text-base font-medium whitespace-normal after:absolute after:inset-0 hover:bg-transparent focus-visible:border-transparent focus-visible:ring-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset aria-pressed:font-semibold"><span className="break-words">{player.name}</span></Button></TableCell>
            <TableCell className="text-center font-semibold tabular-nums">{player.points}</TableCell>
            <TableCell className={cn('pr-4 text-center tabular-nums', player.fouls >= 5 ? 'font-bold text-destructive' : player.fouls === 4 && 'font-semibold text-amber-700 dark:text-amber-400')}>
              {player.fouls}{player.fouls >= 5 && <span className="block text-xs">Out</span>}
            </TableCell>
          </TableRow>
          {active && !disabled && <TableRow className="bg-accent/40 hover:bg-accent/40 lg:hidden">
            <TableCell colSpan={5} className="p-3 whitespace-normal"><div role="group" aria-label={`Record play for ${player.name}`} className="grid gap-3"><PlayButtons disabled={false} onPlay={onPlay} />{receipt}</div></TableCell>
          </TableRow>}
        </Fragment>
      })}</TableBody>
    </Table> : <p className="px-4 py-8 text-center text-muted-foreground">No players on this roster.</p>}
  </Card>
}

function ActionPad({ player, team, side, disabled, readOnly, receipt, onPlay, onClear }: {
  player: LivePlayer | null; team: LiveTeam | null; side: Side; disabled: boolean; readOnly: boolean; receipt: ReactNode; onPlay: RecordPlay; onClear: () => void
}) {
  return <Card className={cn(panelClass, 'hidden self-start lg:sticky lg:top-16 lg:flex')}>
    <CardHeader className="border-b py-3 [.border-b]:pb-3"><CardTitle><h3 className="text-lg leading-tight font-semibold">Record play</h3></CardTitle></CardHeader>
    <CardContent className="gap-4 py-4">
      <div aria-live="polite" className="flex min-h-14 items-center gap-3">
        <span aria-hidden="true" className={cn('grid size-14 shrink-0 place-items-center rounded-lg text-xl font-bold tabular-nums', player ? [sideColor[side], 'text-white'] : 'bg-muted text-muted-foreground')}>
          {player ? player.jersey ?? '–' : <UserRoundIcon className="size-6" />}
        </span>
        {player && team ? <div className="min-w-0 flex-1"><p className="text-xl leading-tight font-semibold break-words">{player.name}</p><p className="mt-1 text-sm text-muted-foreground">{team.name} · {player.points} PTS · {player.fouls} PF</p></div>
          : <p className="flex-1 font-medium">{readOnly ? 'Take over scoring to record plays on this device.' : 'Select a player in either roster.'}</p>}
        {player && <Button variant="ghost" className="min-h-11" onClick={onClear}>Clear</Button>}
      </div>
      {!readOnly && <PlayButtons disabled={disabled || !player} idle={!player} onPlay={onPlay} />}
      {receipt}
    </CardContent>
  </Card>
}

export function ScoringWorkspace({ view, selected, disabled, readOnly, canUndo, freshPlayId, onSelect, onPlay, onUndo, onTimeout }: {
  view: LiveState; selected: PlayerSelection; disabled: boolean; readOnly: boolean; canUndo: boolean; freshPlayId: string | null
  onSelect: (value: PlayerSelection) => void; onPlay: RecordPlay; onUndo: (play: LivePlay) => void; onTimeout?: (teamId: string) => void
}) {
  const team = selected?.teamId === view.home.seasonTeamId ? view.home : selected?.teamId === view.away.seasonTeamId ? view.away : null
  const player = team?.players.find((item) => item.rosterId === selected?.rosterId) ?? null
  const receipt = <PlayReceipt view={view} canUndo={canUndo} freshPlayId={freshPlayId} onUndo={onUndo} />
  const roster = (side: Side) => <RosterPanel team={view[side]} side={side} selected={selected} disabled={disabled} receipt={receipt} onSelect={onSelect} onPlay={onPlay} onTimeout={onTimeout} />
  return <div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,23rem)_minmax(0,1fr)] lg:gap-5">
    {roster('home')}
    <ActionPad player={player} team={team} side={team === view.away ? 'away' : 'home'} disabled={disabled} readOnly={readOnly} receipt={receipt} onPlay={onPlay} onClear={() => onSelect(null)} />
    {roster('away')}
    {!player && <div className="md:col-span-2 lg:hidden">{receipt}</div>}
  </div>
}
