'use client'

import { useId, useState } from 'react'
import { cn } from 'cn'
import { sideColor, type Side } from '@/components/scoring-workspace'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { periodLabel, type LivePlayer, type LiveState, type LiveTeam } from '@/lib/live-scoring'

const columns = [
  { key: 'points', label: 'PTS', title: 'Points' },
  { key: 'rebounds', label: 'REB', title: 'Rebounds' },
  { key: 'assists', label: 'AST', title: 'Assists' },
  { key: 'steals', label: 'STL', title: 'Steals' },
  { key: 'blocks', label: 'BLK', title: 'Blocks' },
  { key: 'turnovers', label: 'TO', title: 'Turnovers' },
  { key: 'fouls', label: 'PF', title: 'Personal fouls' },
] as const satisfies readonly { key: keyof LivePlayer; label: string; title: string }[]
type StatKey = (typeof columns)[number]['key']
// Team highs are marked in these stats only; turnovers and fouls are not achievements.
const leaderStats = new Set<StatKey>(['points', 'rebounds', 'assists', 'steals', 'blocks'])
const sides = ['home', 'away'] as const

export function LiveBoxScore({ view, clock, open, onOpenChange }: { view: LiveState; clock: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [side, setSide] = useState<Side>('home')
  const waiting = view.plays.filter((play) => play.pending).length
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
      <DialogHeader className="gap-1 border-b px-5 pt-5 pr-14 pb-4 sm:px-6">
        <DialogTitle className="text-lg leading-tight font-semibold">Box score</DialogTitle>
        <DialogDescription className="tabular-nums">
          Live · {periodLabel(view.period, view.format.periodCount)} {clock}
          {waiting > 0 && ` · includes ${waiting} ${waiting === 1 ? 'play' : 'plays'} waiting to sync`}
        </DialogDescription>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 pt-4 pb-5 sm:px-6">
        <LineScore view={view} />
        <Tabs value={side} onValueChange={(value) => { if (value === 'home' || value === 'away') setSide(value) }} className="min-h-0 flex-1 gap-3">
          <TabsList aria-label="Team" className="w-full shrink-0 group-data-horizontal/tabs:h-11 sm:w-fit">
            {sides.map((choice) => <TabsTrigger key={choice} value={choice} className="min-w-0 gap-2 px-4 sm:flex-none">
              <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', sideColor[choice])} />
              <span className="truncate">{view[choice].name}</span>
              <span className="font-semibold tabular-nums">{view[choice].score}</span>
            </TabsTrigger>)}
          </TabsList>
          {sides.map((choice) => <TabsContent key={choice} value={choice} className="flex min-h-0 flex-col">
            <PlayerTable team={view[choice]} />
          </TabsContent>)}
        </Tabs>
        <p className="shrink-0 text-xs text-muted-foreground">Bold marks each team’s high in points, rebounds, assists, steals and blocks. Fouls turn amber at four and red at five.</p>
      </div>
    </DialogContent>
  </Dialog>
}

// The score by period, with the current period's heading set in bold.
function LineScore({ view }: { view: LiveState }) {
  return <div className="shrink-0 overflow-x-auto rounded-lg border">
    <Table className="text-sm">
      <TableCaption className="sr-only">Score by period</TableCaption>
      <TableHeader className="bg-muted/50"><TableRow className="hover:bg-transparent">
        <TableHead scope="col" className="h-9 min-w-24 pl-4 text-xs font-semibold text-muted-foreground">Team</TableHead>
        {view.periodScores.map((line) => <TableHead key={line.period} scope="col" className={cn('h-9 w-9 text-center text-xs tabular-nums sm:w-12', line.period === view.period ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground')}>{periodLabel(line.period, view.format.periodCount)}</TableHead>)}
        <TableHead scope="col" className="h-9 w-12 pr-4 text-center text-xs font-semibold text-foreground sm:w-14"><abbr title="Total" className="no-underline">T</abbr></TableHead>
      </TableRow></TableHeader>
      <TableBody>{sides.map((side) => <TableRow key={side} className="hover:bg-transparent">
        <TableHead scope="row" className="h-10 max-w-0 min-w-24 pl-4 font-medium text-foreground">
          <span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', sideColor[side])} /><span className="truncate">{view[side].name}</span></span>
        </TableHead>
        {view.periodScores.map((line) => <TableCell key={line.period} className={cn('text-center tabular-nums', line.period > view.period && 'text-muted-foreground')}>{line.period > view.period ? '–' : line[side]}</TableCell>)}
        <TableCell className="pr-4 text-center text-base font-bold tabular-nums">{view[side].score}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </div>
}

// One team's players. The table scrolls inside its own region, keeping the column heads, player names and totals in view.
function PlayerTable({ team }: { team: LiveTeam }) {
  const captionId = useId()
  const highs = Object.fromEntries(columns.map(({ key }) => [key, Math.max(0, ...team.players.map((player) => player[key]))])) as Record<StatKey, number>
  const totals = Object.fromEntries(columns.map(({ key }) => [key, team.players.reduce((sum, player) => sum + player[key], 0)])) as Record<StatKey, number>
  if (!team.players.length) return <p className="rounded-lg border px-4 py-8 text-center text-muted-foreground">No players on this roster.</p>
  const statClass = (key: StatKey, value: number) => {
    if (key === 'fouls' && value >= 5) return 'font-semibold text-destructive'
    if (key === 'fouls' && value === 4) return 'font-semibold text-amber-700 dark:text-amber-400'
    if (leaderStats.has(key) && value > 0 && value === highs[key]) return 'font-semibold text-foreground'
    return value === 0 ? 'text-muted-foreground' : undefined
  }
  return <div role="region" tabIndex={0} aria-labelledby={captionId}
    className="min-h-0 overflow-auto overscroll-contain rounded-lg border outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_[data-slot=table-container]]:overflow-visible">
    <Table className="min-w-[36rem] text-sm">
      <TableCaption id={captionId} className="sr-only">{team.name} players</TableCaption>
      <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted"><TableRow className="hover:bg-transparent">
        <TableHead scope="col" className="left-0 z-20! h-9 pl-4 text-xs font-semibold text-muted-foreground">Player</TableHead>
        {columns.map(({ key, label, title }) => <TableHead key={key} scope="col" className={cn('h-9 w-14 text-right text-xs font-semibold last:pr-4', key === 'points' ? 'text-foreground' : 'text-muted-foreground')}><abbr title={title} className="no-underline">{label}</abbr></TableHead>)}
      </TableRow></TableHeader>
      <TableBody>{team.players.map((player) => {
        const recorded = columns.some(({ key }) => player[key] > 0)
        return <TableRow key={player.rosterId} className="h-11 hover:bg-transparent">
          <TableHead scope="row" className="sticky left-0 z-[5] bg-popover pl-4 font-normal">
            <span className="flex items-center gap-3">
              <span className="w-6 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{player.jersey ?? '–'}</span>
              <span className={recorded ? 'font-medium text-foreground' : 'text-muted-foreground'}>{player.name}</span>
            </span>
          </TableHead>
          {columns.map(({ key }) => <TableCell key={key} className={cn('text-right tabular-nums last:pr-4', statClass(key, player[key]))}>
            {player[key]}{key === 'fouls' && player[key] >= 5 && <span className="ml-1 text-xs">Out</span>}
          </TableCell>)}
        </TableRow>
      })}</TableBody>
      <TableFooter className="border-t-0 [&_td]:sticky [&_td]:bottom-0 [&_td]:z-10 [&_td]:border-t [&_td]:bg-muted"><TableRow className="hover:bg-transparent">
        <TableCell className="left-0 z-20! pl-4 font-semibold"><span className="flex items-center gap-3"><span className="w-6 shrink-0" />Team totals</span></TableCell>
        {columns.map(({ key }) => <TableCell key={key} className="text-right font-semibold tabular-nums last:pr-4">{totals[key]}</TableCell>)}
      </TableRow></TableFooter>
    </Table>
  </div>
}
