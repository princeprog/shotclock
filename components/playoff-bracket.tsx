'use client'

import { useState, type ReactNode } from 'react'
import { MapPinIcon, TrophyIcon } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export type BracketSide = { name: string; seed?: number | null; score?: number | null; waiting?: boolean }
export type BracketGame = {
  key: string
  stage: 'semifinal' | 'final' | 'third_place'
  home: BracketSide
  away: BracketSide
  when?: string
  venue?: string | null
  final?: boolean
  actions?: ReactNode
}
export type BracketDivision = { id: string; name: string; games: BracketGame[] }

const winnerOf = (game: BracketGame) => !game.final || game.home.score == null || game.away.score == null ? null : game.home.score > game.away.score ? 'home' : 'away'
const connector = 'border-muted-foreground/40'
const roundLabel = 'text-xs font-medium uppercase tracking-wide text-muted-foreground'

function Side({ side, result }: { side: BracketSide; result: 'won' | 'lost' | null }) {
  return <div className={cn('flex min-h-10 items-center gap-2.5 px-3 text-sm', result === 'won' && 'bg-primary/5 shadow-[inset_2px_0_0_var(--color-primary)]')}>
    <span className={cn('flex size-5 shrink-0 items-center justify-center rounded text-[11px] font-medium tabular-nums', side.seed ? 'bg-muted text-muted-foreground' : 'invisible')}>{side.seed}</span>
    <span title={side.name} className={cn('min-w-0 flex-1 truncate', side.waiting && 'text-muted-foreground', result === 'won' && 'font-semibold', result === 'lost' && 'text-muted-foreground')}>{side.name}</span>
    {side.score != null && <span className={cn('shrink-0 text-sm tabular-nums', result === 'won' ? 'font-semibold' : 'text-muted-foreground')}>{side.score}</span>}
  </div>
}

function MatchCard({ game, label }: { game: BracketGame; label: string }) {
  const winner = winnerOf(game)
  return <article aria-label={`${label}: ${game.home.name} vs ${game.away.name}`} className="overflow-hidden rounded-lg border bg-background shadow-xs">
    <header className="flex min-h-8 items-center justify-between gap-2 border-b pr-1 pl-3 text-xs">
      <span className="font-medium">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        {game.final && <span className="rounded-full bg-foreground/10 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-foreground/80">Final</span>}
        <span className="truncate tabular-nums">{game.when}</span>{game.actions}
      </span>
    </header>
    <div className="divide-y">
      <Side side={game.home} result={winner === null ? null : winner === 'home' ? 'won' : 'lost'} />
      <Side side={game.away} result={winner === null ? null : winner === 'away' ? 'won' : 'lost'} />
    </div>
    {game.venue && <p className="flex items-center gap-1.5 border-t px-3 py-1.5 text-xs text-muted-foreground"><MapPinIcon aria-hidden="true" className="size-3 shrink-0" /><span className="truncate">{game.venue}</span></p>}
  </article>
}

function ChampionCard({ name }: { name: string | null }) {
  return <div className={cn('flex flex-col items-center gap-2 rounded-lg px-3 py-4 text-center', name ? 'border bg-background shadow-xs' : 'border border-dashed')}>
    <span className={cn('flex size-9 items-center justify-center rounded-full', name ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300' : 'bg-muted text-muted-foreground')}><TrophyIcon aria-hidden="true" className="size-4.5" /></span>
    <span title={name ?? undefined} className={cn('max-w-full truncate text-sm', name ? 'font-semibold' : 'text-muted-foreground')}>{name ?? 'To be decided'}</span>
  </div>
}

// Rounds read left to right: semifinals (1 vs 4, 2 vs 3) feed the championship and the champion.
// The third-place game sits under the championship. Narrow screens scroll the bracket sideways to keep its shape.
export function PlayoffBracket({ games, label }: { games: BracketGame[]; label: string }) {
  const semifinals = games.filter((game) => game.stage === 'semifinal')
  const championship = games.find((game) => game.stage === 'final')
  const thirdPlace = games.find((game) => game.stage === 'third_place')
  const champion = championship ? winnerOf(championship) : null
  const linked = semifinals.length === 2 && !!championship
  return <div className="overflow-x-auto">
    <div role="group" aria-label={label} className="grid min-w-[46rem] grid-cols-[minmax(13rem,1fr)_2.5rem_minmax(13rem,1fr)_2.5rem_minmax(9rem,0.7fr)] gap-y-6">
      <p className={cn(roundLabel, 'col-start-1 row-start-1 -mb-3')}>Semifinals</p>
      {championship && <p className={cn(roundLabel, 'col-start-3 row-start-1 -mb-3')}>Championship</p>}
      {championship && <p className={cn(roundLabel, 'col-start-5 row-start-1 -mb-3')}>Champion</p>}
      {semifinals.map((game, index) => <div key={game.key} className={cn('col-start-1', index === 0 ? 'row-start-2' : 'row-start-3')}>
        <MatchCard game={game} label={`Semifinal ${index + 1}`} />
      </div>)}
      {linked && <>
        <div aria-hidden="true" className="relative col-start-2 row-start-2"><div className={cn('absolute top-1/2 right-1/2 -bottom-3 left-0 rounded-tr-md border-t border-r', connector)} /></div>
        <div aria-hidden="true" className="relative col-start-2 row-start-3"><div className={cn('absolute -top-3 right-1/2 bottom-1/2 left-0 rounded-br-md border-r border-b', connector)} /></div>
        <div aria-hidden="true" className="relative col-start-2 row-span-2 row-start-2"><div className={cn('absolute top-1/2 right-0 left-1/2 border-t', connector)} /></div>
      </>}
      {championship && <>
        <div className="col-start-3 row-span-2 row-start-2 self-center"><MatchCard game={championship} label="Championship" /></div>
        <div aria-hidden="true" className="relative col-start-4 row-span-2 row-start-2"><div className={cn('absolute top-1/2 inset-x-0 border-t', connector)} /></div>
        <div className="col-start-5 row-span-2 row-start-2 self-center"><ChampionCard name={champion ? championship[champion].name : null} /></div>
      </>}
      {thirdPlace && <div className="col-start-3 row-start-4 flex flex-col gap-2">
        <p className={roundLabel}>Third place</p>
        <MatchCard game={thirdPlace} label="Third place" />
      </div>}
    </div>
  </div>
}

// One division's bracket at a time, with a switcher when the season has more than one bracket.
export function PlayoffBracketBoard({ divisions, initialDivisionId }: { divisions: BracketDivision[]; initialDivisionId?: string }) {
  const [selectedId, setSelectedId] = useState(initialDivisionId)
  const division = divisions.find((item) => item.id === selectedId) ?? divisions[0]
  if (!division) return null
  const championship = division.games.find((game) => game.stage === 'final')
  const champion = championship ? winnerOf(championship) : null
  const played = division.games.filter((game) => game.final).length
  const summary = champion ? `Champion: ${championship![champion].name}`
    : played ? `${played} of ${division.games.length} games played` : `${division.games.length} playoff games`
  return <section aria-labelledby="playoff-bracket-heading" className="overflow-hidden rounded-xl border bg-card">
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b px-5 py-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 id="playoff-bracket-heading" className="truncate text-base font-semibold">{division.name}</h3>
        <p className="text-sm text-muted-foreground">{summary}</p>
      </div>
      {divisions.length > 1 && <Tabs value={division.id} onValueChange={(value) => setSelectedId(String(value))} className="max-w-full">
        <TabsList aria-label="Division" className="max-w-full justify-start overflow-x-auto overflow-y-hidden">
          {divisions.map((item) => <TabsTrigger key={item.id} value={item.id} className="flex-none px-3">{item.name}</TabsTrigger>)}
        </TabsList>
      </Tabs>}
    </header>
    <div className="bg-muted/30 p-5">
      <PlayoffBracket key={division.id} games={division.games} label={division.name + ' playoff bracket'} />
    </div>
  </section>
}

