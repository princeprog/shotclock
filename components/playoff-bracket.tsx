import type { ReactNode } from 'react'
import { TrophyIcon } from 'lucide-react'
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

const winnerOf = (game: BracketGame) => !game.final || game.home.score == null || game.away.score == null ? null : game.home.score > game.away.score ? 'home' : 'away'

function Side({ side, result }: { side: BracketSide; result: 'won' | 'lost' | null }) {
  return <div className="flex min-h-9 items-center gap-2.5 px-3 py-1.5 text-sm">
    <span className="w-4 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{side.seed ?? ''}</span>
    <span className={cn('min-w-0 flex-1 truncate', side.waiting && 'italic text-muted-foreground', result === 'won' && 'font-semibold', result === 'lost' && 'text-muted-foreground')}>{side.name}</span>
    {side.score != null && <span className={cn('shrink-0 tabular-nums', result === 'won' ? 'font-semibold' : 'text-muted-foreground')}>{side.score}</span>}
  </div>
}

function MatchCard({ game, label }: { game: BracketGame; label: string }) {
  const winner = winnerOf(game)
  return <article aria-label={`${label}: ${game.home.name} vs ${game.away.name}`} className="overflow-hidden rounded-lg border bg-card shadow-xs">
    <header className="flex min-h-8 items-center justify-between gap-2 border-b bg-muted/40 pr-1 pl-3 text-xs">
      <span className="font-medium text-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-1 text-muted-foreground"><span className="truncate">{game.final ? 'Final' : game.when}</span>{game.actions}</span>
    </header>
    <div className="divide-y">
      <Side side={game.home} result={winner === null ? null : winner === 'home' ? 'won' : 'lost'} />
      <Side side={game.away} result={winner === null ? null : winner === 'away' ? 'won' : 'lost'} />
    </div>
    {game.venue && <p className="truncate border-t px-3 py-1.5 text-xs text-muted-foreground">{game.final && game.when ? game.when + ' · ' : ''}{game.venue}</p>}
  </article>
}

// Semifinals on the left feed the championship on the right; the third-place game sits under the championship.
// Semifinal 1 is seeds 1 and 4, semifinal 2 is seeds 2 and 3.
export function PlayoffBracket({ games, label }: { games: BracketGame[]; label: string }) {
  const semifinals = games.filter((game) => game.stage === 'semifinal')
  const championship = games.find((game) => game.stage === 'final')
  const thirdPlace = games.find((game) => game.stage === 'third_place')
  const champion = championship && winnerOf(championship)
  return <div role="group" aria-label={label} className="grid w-full grid-cols-1 gap-y-4 md:max-w-3xl md:grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)] md:gap-y-6">
    {semifinals.map((game, index) => <div key={game.key} className={index === 0 ? 'md:col-start-1 md:row-start-1' : 'md:col-start-1 md:row-start-2'}>
      <MatchCard game={game} label={`Semifinal ${index + 1}`} />
    </div>)}
    {semifinals.length === 2 && championship && <>
      <div aria-hidden="true" className="relative hidden md:col-start-2 md:row-start-1 md:block"><div className="absolute top-1/2 right-1/2 -bottom-3 left-0 rounded-tr-md border-t border-r border-muted-foreground/60" /></div>
      <div aria-hidden="true" className="relative hidden md:col-start-2 md:row-start-2 md:block"><div className="absolute -top-3 right-1/2 bottom-1/2 left-0 rounded-br-md border-r border-b border-muted-foreground/60" /></div>
      <div aria-hidden="true" className="relative hidden md:col-start-2 md:row-span-2 md:row-start-1 md:block"><div className="absolute top-1/2 right-0 left-1/2 border-t border-muted-foreground/60" /></div>
    </>}
    {championship && <div className="flex flex-col gap-2 md:col-start-3 md:row-span-2 md:row-start-1 md:self-center">
      {champion && <p className="flex items-center gap-1.5 text-sm font-medium"><TrophyIcon aria-hidden="true" className="size-4 text-amber-500" />Champion · {championship[champion].name}</p>}
      <MatchCard game={championship} label="Championship" />
    </div>}
    {thirdPlace && <div className="md:col-start-3 md:row-start-3"><MatchCard game={thirdPlace} label="Third place" /></div>}
  </div>
}

