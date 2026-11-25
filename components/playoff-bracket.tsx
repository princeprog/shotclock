'use client'

import { useState, type ReactNode } from 'react'
import { MapPinIcon, TrophyIcon } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export type BracketSide = { name: string; seed?: number | null; score?: number | null; waiting?: boolean }
export type BracketGame = {
  key: string
  stage: 'quarterfinal' | 'semifinal' | 'final' | 'third_place'
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
      <span className="shrink-0 font-medium whitespace-nowrap">{label}</span>
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

const roundTitles = { quarterfinal: 'Quarterfinals', semifinal: 'Semifinals', final: 'Championship' }
const gameTitles = { quarterfinal: 'Quarterfinal', semifinal: 'Semifinal', final: 'Championship' }

// Rounds read left to right: quarterfinals in an eight-team bracket, then semifinals, the championship and the champion.
// Every row of the grid holds one first-round game, so a later game spans the rows of the two games that feed it and sits
// centred between them, and each connector joins that pair to it. The third-place game sits under the championship.
// Narrow screens scroll the bracket sideways to keep its shape.
export function PlayoffBracket({ games, label }: { games: BracketGame[]; label: string }) {
  const championship = games.find((game) => game.stage === 'final')
  const thirdPlace = games.find((game) => game.stage === 'third_place')
  const champion = championship ? winnerOf(championship) : null
  const rounds = (['quarterfinal', 'semifinal', 'final'] as const).map((stage) => ({ stage, games: games.filter((game) => game.stage === stage) })).filter((round) => round.games.length)
  const firstRound = rounds[0]?.games.length ?? 1
  // Linked when each round has half the games of the one before, ending in the championship.
  const linked = !!championship && rounds.every((round, index) => round.games.length * 2 ** index === firstRound)
  const rows = linked ? firstRound : Math.max(1, ...rounds.map((round) => round.games.length))
  const span = (roundIndex: number) => linked ? 2 ** roundIndex : 1
  const columns = [...rounds.flatMap((_, index) => [index ? '2.5rem' : '', 'minmax(13rem,1fr)']).filter(Boolean), ...(championship ? ['2.5rem', 'minmax(9rem,0.7fr)'] : [])]
  const gameRows = `2 / span ${rows}`
  return <div className="overflow-x-auto">
    <div role="group" aria-label={label} className="grid" style={{ gridTemplateColumns: columns.join(' '), gridTemplateRows: `auto repeat(${rows}, minmax(0, 1fr))`, minWidth: `${rounds.length * 15.5 + (championship ? 11.5 : 0)}rem` }}>
      {rounds.map((round, roundIndex) => <p key={round.stage} className={cn(roundLabel, 'pb-1')} style={{ gridColumn: roundIndex * 2 + 1, gridRow: 1 }}>{roundTitles[round.stage]}</p>)}
      {championship && <p className={cn(roundLabel, 'pb-1')} style={{ gridColumn: rounds.length * 2 + 1, gridRow: 1 }}>Champion</p>}
      {rounds.map((round, roundIndex) => round.games.map((game, index) => <div key={game.key} className="self-center py-2" style={{ gridColumn: roundIndex * 2 + 1, gridRow: `${2 + index * span(roundIndex)} / span ${span(roundIndex)}` }}>
        <MatchCard game={game} label={round.stage === 'final' ? gameTitles.final : `${gameTitles[round.stage]} ${index + 1}`} />
      </div>))}
      {linked && rounds.slice(1).map((round, index) => round.games.map((game, position) => <div key={game.key} aria-hidden="true" className="relative" style={{ gridColumn: index * 2 + 2, gridRow: `${2 + position * span(index + 1)} / span ${span(index + 1)}` }}>
        <div className={cn('absolute inset-y-1/4 right-1/2 left-0 rounded-r-md border-y border-r', connector)} />
        <div className={cn('absolute top-1/2 right-0 left-1/2 border-t', connector)} />
      </div>))}
      {championship && <>
        <div aria-hidden="true" className="relative" style={{ gridColumn: rounds.length * 2, gridRow: gameRows }}><div className={cn('absolute inset-x-0 top-1/2 border-t', connector)} /></div>
        <div className="self-center" style={{ gridColumn: rounds.length * 2 + 1, gridRow: gameRows }}><ChampionCard name={champion ? championship[champion].name : null} /></div>
      </>}
      {thirdPlace && <div className="mt-4 flex flex-col gap-2" style={{ gridColumn: Math.max(1, rounds.length * 2 - 1), gridRow: rows + 2 }}>
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
