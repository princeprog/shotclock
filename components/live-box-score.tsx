'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { LivePlayer, LiveState } from '@/lib/live-scoring'

const columns = [
  { key: 'points', label: 'PTS', title: 'Points' },
  { key: 'rebounds', label: 'REB', title: 'Rebounds' },
  { key: 'assists', label: 'AST', title: 'Assists' },
  { key: 'steals', label: 'STL', title: 'Steals' },
  { key: 'blocks', label: 'BLK', title: 'Blocks' },
  { key: 'turnovers', label: 'TO', title: 'Turnovers' },
  { key: 'fouls', label: 'PF', title: 'Personal fouls' },
] as const satisfies readonly { key: keyof LivePlayer; label: string; title: string }[]

export function LiveBoxScore({ view, open, onOpenChange }: { view: LiveState; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [side, setSide] = useState<'home' | 'away'>('home')
  const team = view[side]
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader><DialogTitle>Live box score</DialogTitle><DialogDescription>Player and team totals for the current game.</DialogDescription></DialogHeader>
      <div className="flex flex-wrap gap-2" aria-label="Select team">
        {(['home', 'away'] as const).map((choice) => <Button key={choice} size="sm" variant={side === choice ? 'default' : 'outline'} aria-pressed={side === choice} onClick={() => setSide(choice)}>{view[choice].name}</Button>)}
      </div>
      <Table className="min-w-[36rem]">
        <TableHeader><TableRow><TableHead>Player</TableHead>{columns.map(({ key, label, title }) => <TableHead key={key} className="text-right"><abbr title={title} className="no-underline">{label}</abbr></TableHead>)}</TableRow></TableHeader>
        <TableBody>{team.players.map((player) => <TableRow key={player.rosterId}>
          <TableCell>#{player.jersey ?? '–'} {player.name}</TableCell>
          {columns.map(({ key }) => <TableCell key={key} className="text-right tabular-nums">{player[key]}</TableCell>)}
        </TableRow>)}</TableBody>
        <TableFooter><TableRow><TableCell>Totals</TableCell>{columns.map(({ key }) => <TableCell key={key} className="text-right tabular-nums">{team.players.reduce((sum, player) => sum + player[key], 0)}</TableCell>)}</TableRow></TableFooter>
      </Table>
      {!team.players.length && <p className="text-sm text-muted-foreground">No players on this roster.</p>}
    </DialogContent>
  </Dialog>
}
