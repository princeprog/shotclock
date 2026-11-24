'use client'

import { Fragment, useState } from 'react'
import { CheckIcon, HistoryIcon, Undo2Icon, UserRoundIcon } from 'lucide-react'
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
  return <div className={cn('flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4', away && 'items-end text-right sm:flex-row-reverse')}>
    <div className="min-w-0">
      <span className={cn('flex items-center gap-1.5 text-xs font-semibold text-muted-foreground', away && 'flex-row-reverse')}>
        <span aria-hidden="true" className={cn('size-2 rounded-full', away ? 'bg-slate-400' : 'bg-primary')} />{away ? 'Away' : 'Home'}
      </span>
      <p className="mt-1 break-words text-xl leading-tight font-semibold tracking-tight sm:text-2xl">{team.name}</p>
      <p className="mt-1 text-xs text-muted-foreground">{team.teamFouls} <span className="sr-only sm:not-sr-only">team </span>{team.teamFouls === 1 ? 'foul' : 'fouls'}
        {team.inBonus && <strong className="ml-1.5 text-amber-700 dark:text-amber-400">Bonus</strong>}
      </p>
    </div>
    <strong aria-live="polite" className="shrink-0 text-4xl leading-none font-bold tracking-tight tabular-nums sm:text-5xl lg:text-6xl">{team.score}</strong>
  </div>
}

const scores = [1, 2, 3] as const
const statistics = [
  ['rebound', 'Rebound'], ['assist', 'Assist'], ['steal', 'Steal'],
  ['block', 'Block'], ['turnover', 'Turnover'], ['foul', 'Foul'],
] as const
const cardClass = 'min-w-0 gap-0 rounded-xl border py-0 shadow-xs ring-0 [--card-spacing:1rem] lg:[--card-spacing:1.375rem]'
const titleClass = 'text-lg leading-tight font-semibold tracking-tight lg:text-xl'
type RecordPlay = (kind: PlayKind, points?: number) => void

function PlayButtons({ disabled, onPlay }: { disabled: boolean; onPlay: RecordPlay }) {
  return <div className="grid grid-cols-3 gap-2">
    {scores.map((points) => <Button key={points} disabled={disabled} onClick={() => onPlay('points', points)} className="mb-1 h-12 text-2xl font-semibold lg:h-14">+{points}</Button>)}
    {statistics.map(([kind, name]) => <Button key={kind} variant="outline" disabled={disabled} onClick={() => onPlay(kind)} className="h-11 px-1">{name}</Button>)}
  </div>
}

function RosterTable({ team, selected, disabled, onSelect, onPlay }: {
  team: LiveTeam; selected: PlayerSelection; disabled: boolean; onSelect: (value: PlayerSelection) => void; onPlay: RecordPlay
}) {
  return <Table className="table-fixed text-sm lg:text-base">
    <TableCaption className="sr-only">{team.name} roster</TableCaption>
    <TableHeader className="bg-muted/45 [&_th]:h-9 [&_th]:text-xs [&_th]:font-semibold [&_th]:text-muted-foreground">
      <TableRow><TableHead scope="col" className="w-6 sm:w-8"><span className="sr-only">Selected</span></TableHead><TableHead scope="col" className="w-11 sm:w-14">No.</TableHead><TableHead scope="col">Player</TableHead><TableHead scope="col" className="w-12 text-center lg:w-16">PTS</TableHead><TableHead scope="col" className="w-10 text-center lg:w-16">PF</TableHead></TableRow>
    </TableHeader>
    <TableBody>{team.players.map((player) => {
      const active = selected !== null && selected.teamId === team.seasonTeamId && selected.rosterId === player.rosterId
      function select() {
        if (!disabled && team.seasonTeamId) onSelect(active ? null : { teamId: team.seasonTeamId, rosterId: player.rosterId })
      }
      return <Fragment key={player.rosterId}><TableRow data-state={active ? 'selected' : undefined}
        className={cn('relative h-12 data-[state=selected]:bg-accent', !disabled && 'cursor-pointer')}>
        <TableCell className="px-1 text-center">{active && <CheckIcon aria-hidden="true" className="mx-auto size-5 text-primary" />}</TableCell>
        <TableCell className="font-medium text-muted-foreground tabular-nums">{player.jersey ?? '–'}</TableCell>
        <TableCell className="py-0"><Button variant="ghost" disabled={disabled} onClick={select} aria-label={`Select ${player.name}`} aria-pressed={active}
          className="h-auto min-h-10 max-w-full justify-start px-0 text-left text-sm font-medium whitespace-normal after:absolute after:inset-0 hover:bg-transparent aria-pressed:font-semibold lg:text-base"><span className="break-words">{player.name}</span></Button></TableCell>
        <TableCell className="text-center tabular-nums">{player.points}</TableCell>
        <TableCell className={cn('text-center tabular-nums', player.fouls >= 5 ? 'font-bold text-destructive' : player.fouls === 4 && 'font-semibold text-amber-700 dark:text-amber-400')}>
          {player.fouls}{player.fouls >= 5 && <span className="block text-xs">Out</span>}
        </TableCell>
      </TableRow>
      {active && !disabled && <TableRow className="bg-accent/30 hover:bg-accent/30 md:hidden">
        <TableCell colSpan={5} className="p-3"><div role="group" aria-label={`Record play for ${player.name}`}><PlayButtons disabled={false} onPlay={onPlay} /></div></TableCell>
      </TableRow>}</Fragment>
    })}</TableBody>
  </Table>
}

export function ScoringWorkspace({ view, selected, disabled, onSelect, onPlay }: {
  view: LiveState; selected: PlayerSelection; disabled: boolean; onSelect: (value: PlayerSelection) => void; onPlay: RecordPlay
}) {
  const [side, setSide] = useState<Side>('home')
  const team = view[side]
  const player = selected?.teamId === team.seasonTeamId ? team.players.find((item) => item.rosterId === selected?.rosterId) : undefined
  return <div className="grid items-stretch gap-4 md:grid-cols-[1.12fr_1fr] lg:gap-5">
    <Card className={cardClass}>
      <CardHeader className="pt-4 lg:pt-5"><CardTitle><h2 className={titleClass}>Roster</h2></CardTitle></CardHeader>
      <CardContent className="pb-3">
        <Tabs value={side} onValueChange={(value) => { if (value === 'home' || value === 'away') { setSide(value); onSelect(null) } }}>
          <TabsList variant="line" aria-label="Roster team" className="mt-2 h-auto w-full justify-start border-b px-0 pb-1 group-data-horizontal/tabs:h-12">
            {(['home', 'away'] as const).map((value) => <TabsTrigger key={value} value={value} className="max-w-1/2 flex-none px-3 text-base font-semibold data-active:text-primary after:rounded-full after:bg-primary group-data-horizontal/tabs:after:h-[3px]"><span className="truncate">{view[value].name}</span></TabsTrigger>)}
          </TabsList>
          {(['home', 'away'] as const).map((value) => <TabsContent key={value} value={value} className="md:max-h-72 md:overflow-y-auto md:overscroll-contain">
            {view[value].players.length ? <RosterTable team={view[value]} selected={selected} disabled={disabled} onSelect={onSelect} onPlay={onPlay} /> : <p className="py-6 text-muted-foreground">No players on this roster.</p>}
          </TabsContent>)}
        </Tabs>
      </CardContent>
    </Card>
    <Card className={cn(cardClass, 'hidden md:flex')}>
      <CardHeader className="pt-4 lg:pt-5"><CardTitle><h2 className={titleClass}>Record play</h2></CardTitle></CardHeader>
      <CardContent className="flex-1 justify-between gap-4 py-4 lg:pb-5">
        <div aria-live="polite" className="flex min-h-14 items-center gap-3">
          <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-lg bg-accent text-lg font-bold text-primary">{player?.jersey != null ? `#${player.jersey}` : <UserRoundIcon className="size-5" />}</span>
          {player ? <div><p className="text-lg leading-tight font-semibold">{player.name}</p><p className="mt-1 text-sm text-muted-foreground">{team.name}</p></div> : <p className="text-sm text-muted-foreground">Select a player from the roster.</p>}
        </div>
        <PlayButtons disabled={disabled || !player} onPlay={onPlay} />
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
  return <Card className="flex-row flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-3 shadow-xs ring-0 sm:flex-nowrap lg:px-5">
    <h2 className="flex shrink-0 items-center gap-2 text-base font-semibold"><HistoryIcon aria-hidden="true" className="size-4 text-muted-foreground" />Latest play</h2>
    <p aria-live="polite" className="order-last w-full min-w-0 flex-1 basis-full text-muted-foreground sm:order-none sm:basis-auto sm:border-l sm:pl-5 lg:text-base">
      {play && <span className="tabular-nums">{periodLabel(play.period, view.format.periodCount)} {play.clockMs !== null && deskClock(play.clockMs)} · </span>}{description}
    </p>
    {canUndo && <Button variant="outline" disabled={!play || play.voided || play.kind === 'period_end'} onClick={() => onUndo(play)} className="ml-auto min-h-11 px-4"><Undo2Icon data-icon="inline-start" />Undo</Button>}
  </Card>
}
