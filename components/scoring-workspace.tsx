'use client'

import { useState } from 'react'
import { CheckIcon } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { describePlay, formatClock, periodLabel, type LivePlay, type LiveState, type LiveTeam, type PlayKind } from '@/lib/live-scoring'

export type PlayerSelection = { teamId: string; rosterId: string } | null
type Side = 'home' | 'away'

export function deskClock(ms: number) {
  const time = formatClock(ms)
  return time.includes(':') ? time.padStart(5, '0') : time
}

export function TeamScore({ team, away = false }: { team: LiveTeam; away?: boolean }) {
  return <div className={cn('flex min-w-0 flex-col items-center gap-1 sm:flex-row sm:justify-between sm:gap-3', away && 'sm:flex-row-reverse')}>
    <span className="text-sm font-medium text-muted-foreground xl:text-xl">{away ? 'Away' : 'Home'}</span>
    <strong className="max-w-full truncate text-lg font-bold sm:text-xl xl:text-3xl" title={team.name}>{team.name}</strong>
    <strong aria-live="polite" className="text-4xl leading-none font-bold tabular-nums sm:text-5xl xl:text-[clamp(3rem,4.4vw,4.25rem)]">{team.score}</strong>
    {team.inBonus && <span className="rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-900">Bonus</span>}
  </div>
}

const scores = [1, 2, 3] as const
const statistics = [
  ['rebound', 'Rebound'], ['assist', 'Assist'], ['steal', 'Steal'],
  ['block', 'Block'], ['turnover', 'Turnover'], ['foul', 'Foul'],
] as const
const cardClass = 'min-w-0 gap-1 rounded-[10px] border py-3 shadow-none ring-0 [--card-spacing:1rem] xl:py-3.5 xl:[--card-spacing:1.375rem]'
const titleClass = 'text-xl leading-tight font-bold xl:text-[1.75rem]'

function RosterTable({ team, selected, disabled, onSelect }: { team: LiveTeam; selected: PlayerSelection; disabled: boolean; onSelect: (value: PlayerSelection) => void }) {
  return <Table className="table-fixed text-base xl:text-[1.375rem]">
    <TableCaption className="sr-only">{team.name} roster</TableCaption>
    <TableHeader className="[&_th]:text-muted-foreground [&_th]:font-semibold [&_th]:text-sm xl:[&_th]:h-14 xl:[&_th]:text-lg">
      <TableRow><TableHead scope="col" className="w-6 sm:w-8 xl:w-12"><span className="sr-only">Selected</span></TableHead><TableHead scope="col" className="w-12 xl:w-20">No.</TableHead><TableHead scope="col">Player</TableHead><TableHead scope="col" className="w-12 text-center xl:w-24">PTS</TableHead><TableHead scope="col" className="w-10 text-center xl:w-20">PF</TableHead></TableRow>
    </TableHeader>
    <TableBody>{team.players.map((player) => {
      const active = selected !== null && selected.teamId === team.seasonTeamId && selected.rosterId === player.rosterId
      function select() {
        if (!disabled && team.seasonTeamId) onSelect(active ? null : { teamId: team.seasonTeamId, rosterId: player.rosterId })
      }
      return <TableRow key={player.rosterId} data-state={active ? 'selected' : undefined}
        className={cn('relative h-11 xl:h-[3.05rem] data-[state=selected]:bg-accent', !disabled && 'cursor-pointer')}>
        <TableCell className="px-1 text-center">{active && <CheckIcon aria-hidden="true" className="mx-auto size-5 text-primary" />}</TableCell>
        <TableCell className="tabular-nums">{player.jersey ?? '–'}</TableCell>
        <TableCell className="py-0"><Button variant="ghost" disabled={disabled} onClick={select} aria-label={`Select ${player.name}`} aria-pressed={active}
          className="h-auto min-h-10 max-w-full justify-start px-0 text-left text-base font-normal whitespace-normal after:absolute after:inset-0 hover:bg-transparent aria-pressed:font-semibold xl:text-[1.375rem]"><span className="break-words">{player.name}</span></Button></TableCell>
        <TableCell className="text-center tabular-nums">{player.points}</TableCell>
        <TableCell className={cn('text-center tabular-nums', player.fouls >= 5 ? 'font-bold text-destructive' : player.fouls === 4 && 'font-semibold text-amber-700 dark:text-amber-400')}>
          {player.fouls}{player.fouls >= 5 && <span className="block text-xs">Out</span>}
        </TableCell>
      </TableRow>
    })}</TableBody>
  </Table>
}

export function ScoringWorkspace({ view, selected, disabled, onSelect, onPlay }: {
  view: LiveState; selected: PlayerSelection; disabled: boolean; onSelect: (value: PlayerSelection) => void; onPlay: (kind: PlayKind, points?: number) => void
}) {
  const [side, setSide] = useState<Side>('home')
  const team = view[side]
  const player = selected?.teamId === team.seasonTeamId ? team.players.find((item) => item.rosterId === selected?.rosterId) : undefined
  return <div className="grid items-stretch gap-4 md:grid-cols-[1.12fr_1fr] xl:gap-7">
    <Card className={cardClass}>
      <CardHeader><CardTitle><h2 className={titleClass}>Roster</h2></CardTitle></CardHeader>
      <CardContent>
        <Tabs value={side} onValueChange={(value) => { if (value === 'home' || value === 'away') { setSide(value); onSelect(null) } }}>
          <TabsList variant="line" aria-label="Roster team" className="h-auto w-full justify-start border-b px-0 pb-1 group-data-horizontal/tabs:h-11 xl:group-data-horizontal/tabs:h-[3.375rem]">
            {(['home', 'away'] as const).map((value) => <TabsTrigger key={value} value={value} className="max-w-1/2 flex-none px-3 text-base font-semibold data-active:text-primary after:rounded-full after:bg-primary group-data-horizontal/tabs:after:h-[3px] xl:px-5 xl:text-xl"><span className="truncate">{view[value].name}</span></TabsTrigger>)}
          </TabsList>
          {(['home', 'away'] as const).map((value) => <TabsContent key={value} value={value} className="max-h-72 overflow-y-auto overscroll-contain">
            {view[value].players.length ? <RosterTable team={view[value]} selected={selected} disabled={disabled} onSelect={onSelect} /> : <p className="py-6 text-muted-foreground">No players on this roster.</p>}
          </TabsContent>)}
        </Tabs>
      </CardContent>
    </Card>
    <Card className={cardClass}>
      <CardHeader><CardTitle><h2 className={titleClass}>Record play</h2></CardTitle></CardHeader>
      <CardContent className="flex-1 justify-between gap-4 pt-2 pb-1 xl:pb-3">
        <div aria-live="polite">{player ? <><p className="text-lg font-bold xl:text-[1.7rem]">{player.jersey !== null && `#${player.jersey} `}{player.name}</p><p className="text-muted-foreground xl:text-xl">{team.name}</p></> : <p className="text-base text-muted-foreground">Select a player from the roster.</p>}</div>
        <div className="grid grid-cols-3 gap-2 xl:gap-3">
          {scores.map((points) => <Button key={points} disabled={disabled || !player} onClick={() => onPlay('points', points)} className="mb-1 h-12 text-2xl font-bold xl:h-[4.25rem] xl:text-3xl">+{points}</Button>)}
          {statistics.map(([kind, name]) => <Button key={kind} variant="outline" disabled={disabled || !player} onClick={() => onPlay(kind)} className="h-11 px-1 text-sm sm:text-base xl:h-14 xl:text-xl">{name}</Button>)}
        </div>
      </CardContent>
    </Card>
  </div>
}

export function LatestPlay({ view, canUndo, onUndo }: { view: LiveState; canUndo: boolean; onUndo: (play: LivePlay) => void }) {
  const play = view.plays[0]
  const team = play?.seasonTeamId === view.home.seasonTeamId ? view.home : view.away
  let description = 'No plays recorded yet.'
  if (play) {
    if (play.kind === 'timeout') description = `${team.name} timeout`
    else if (play.kind === 'points') description = `${play.player ?? team.name} scored ${play.points} ${play.points === 1 ? 'point' : 'points'}`
    else description = describePlay(play)
    if (play.voided) description += ' (undone)'
  }
  return <Card className="flex-row flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border px-4 py-3 shadow-none ring-0 sm:flex-nowrap xl:gap-x-8 xl:px-5 xl:py-3">
    <h2 className="shrink-0 text-base font-bold xl:text-2xl">Latest play</h2>
    <p aria-live="polite" className="order-last w-full min-w-0 flex-1 basis-full text-muted-foreground sm:order-none sm:basis-auto sm:border-l sm:pl-5 xl:pl-8 xl:text-xl">
      {play && <span className="tabular-nums">{periodLabel(play.period, view.format.periodCount)} {play.clockMs !== null && deskClock(play.clockMs)} · </span>}{description}
    </p>
    {canUndo && <Button variant="outline" disabled={!play || play.voided || play.kind === 'period_end'} onClick={() => onUndo(play)} className="ml-auto h-10 px-5 xl:h-12 xl:text-xl">Undo</Button>}
  </Card>
}
