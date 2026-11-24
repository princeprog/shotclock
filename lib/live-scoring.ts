// Shapes returned by the live scoring API and the device-side queue of changes waiting to be sent.
export type PlayKind = 'points' | 'rebound' | 'assist' | 'steal' | 'block' | 'turnover' | 'foul' | 'timeout'
export type LivePlayer = { rosterId: string; name: string; jersey: number | null; points: number; rebounds: number; assists: number; steals: number; blocks: number; turnovers: number; fouls: number }
export type LiveTeam = { seasonTeamId: string | null; name: string; score: number; teamFouls: number; timeouts: number; inBonus: boolean; players: LivePlayer[] }
export type LivePlay = { id: string; sequence: number; kind: PlayKind | 'period_end'; points: number | null; seasonTeamId: string | null; rosterId: string | null; player: string | null; period: number; clockMs: number | null; voided: boolean; pending?: boolean }
export type LiveClock = { remainingMs: number; running: boolean; serverTime: string }
export type ShotClock = LiveClock & { mode: 'single' | 'dual'; fullSeconds: number; shortSeconds: number; visible: boolean; epoch: number; scorerEpoch?: number; operator: { deviceId: string; name: string | null } | null; connectivity?: { scorerConnected: boolean; operatorConnected: boolean; leaseMs: number } }
export type LiveState = {
  gameId: string
  status: 'scheduled' | 'live' | 'completed'
  version: number
  stage: 'preliminary' | 'semifinal' | 'final' | 'third_place'
  scheduledAt: string | null
  leagueName: string
  seasonName: string
  divisionName: string
  venueName: string | null
  timeZone: string | null
  seasonStatus: 'draft' | 'active' | 'completed'
  format: { periodCount: number; periodMinutes: number; overtimeMinutes: number; bonusFouls: number }
  period: number
  clock: LiveClock | null
  shotClock?: ShotClock | null
  home: LiveTeam
  away: LiveTeam
  periodScores: { period: number; home: number; away: number }[]
  finalScore: { home: number; away: number } | null
  bestPlayer: (LivePlayer & { seasonTeamId: string | null; teamName: string }) | null
  plays: LivePlay[]
  scorer: { deviceId: string; name: string | null } | null
  live: boolean
}
export type PendingPlay = { id: string; kind: PlayKind; points?: number; seasonTeamId: string; rosterId?: string; period: number; clockMs: number; recordedAt: string }
export type OutboxItem = ({ type: 'play'; play: PendingPlay } | { type: 'void'; eventId: string } | { type: 'clock'; running: boolean; remainingMs: number; at: string } | { type: 'shot-clock'; commandId: string; running: boolean; remainingMs: number; visible: boolean; at: string }) & { epoch?: number }

// Matches the API's conflict message when another device has taken over the game.
export const SCORER_MOVED = 'This game is being scored on another device.'
const statKey = { points: 'points', rebound: 'rebounds', assist: 'assists', steal: 'steals', block: 'blocks', turnover: 'turnovers', foul: 'fouls' } as const

type QueueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
function browserStorage(): QueueStorage | undefined {
  if (typeof window === 'undefined') return undefined
  try { return window.localStorage } catch { return undefined }
}

// One ID per browser, so the API knows which device holds a game.
export function deviceId(storage = browserStorage(), create = () => crypto.randomUUID()) {
  try {
    const saved = storage?.getItem('shotclock:device-id')
    if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved
    const id = create()
    storage?.setItem('shotclock:device-id', id)
    return id
  } catch { return create() }
}

// Plays wait here, in order, until the API confirms them, so scoring continues while the gym's internet is down.
export function readOutbox(gameId: string, storage = browserStorage()): OutboxItem[] {
  try {
    const value: unknown = JSON.parse(storage?.getItem(`shotclock:live-outbox:${gameId}`) ?? '[]')
    return Array.isArray(value) ? value as OutboxItem[] : []
  } catch { return [] }
}

export function saveOutbox(gameId: string, items: OutboxItem[], storage = browserStorage()) {
  try {
    if (items.length) storage?.setItem(`shotclock:live-outbox:${gameId}`, JSON.stringify(items))
    else storage?.removeItem(`shotclock:live-outbox:${gameId}`)
  } catch { /* The queue stays in memory for this session. */ }
}

// The next request to send: consecutive plays go together (at most 100); an undo or clock change goes alone.
export function nextBatch(outbox: OutboxItem[]) {
  const first = outbox[0]
  if (!first) return null
  if (first.type !== 'play') return { items: [first] }
  const end = outbox.findIndex((item) => item.type !== 'play' || item.epoch !== first.epoch)
  return { items: outbox.slice(0, Math.min(end === -1 ? outbox.length : end, 100)) }
}

function addPlay(team: LiveTeam, play: PendingPlay, period: number, sign: 1 | -1): LiveTeam {
  const points = play.kind === 'points' ? (play.points ?? 0) * sign : 0
  return {
    ...team,
    score: team.score + points,
    teamFouls: team.teamFouls + (play.kind === 'foul' && play.period === period ? sign : 0),
    timeouts: team.timeouts + (play.kind === 'timeout' ? sign : 0),
    players: team.players.map((player) => {
      if (player.rosterId !== play.rosterId || play.kind === 'timeout') return player
      const key = statKey[play.kind]
      return { ...player, [key]: player[key] + (play.kind === 'points' ? points : sign) }
    }),
  }
}

// Shows queued plays, undos and clock changes on top of the last state the API sent.
export function withPending(state: LiveState, outbox: OutboxItem[]): LiveState {
  let home = state.home
  let away = state.away
  let plays = state.plays
  let clock = state.clock
  let shotClock = state.shotClock
  const playerName = (rosterId?: string) => [...state.home.players, ...state.away.players].find((player) => player.rosterId === rosterId)?.name ?? null
  for (const item of outbox) {
    if (item.type === 'clock') {
      clock = { remainingMs: item.remainingMs, running: item.running, serverTime: item.at }
      if (!item.running && shotClock?.running) shotClock = { ...shotClock, remainingMs: clockRemaining(shotClock, Date.parse(shotClock.serverTime), Date.parse(item.at)), running: false, serverTime: item.at }
      continue
    }
    if (item.type === 'shot-clock') {
      if (shotClock) shotClock = { ...shotClock, remainingMs: item.remainingMs, running: item.running, visible: item.visible, serverTime: item.at }
      continue
    }
    if (item.type === 'play') {
      if (item.play.seasonTeamId === home.seasonTeamId) home = addPlay(home, item.play, state.period, 1)
      else away = addPlay(away, item.play, state.period, 1)
      plays = [{ id: item.play.id, sequence: 0, kind: item.play.kind, points: item.play.points ?? null, seasonTeamId: item.play.seasonTeamId, rosterId: item.play.rosterId ?? null, player: playerName(item.play.rosterId), period: item.play.period, clockMs: item.play.clockMs, voided: false, pending: true }, ...plays]
      continue
    }
    const target = plays.find((play) => play.id === item.eventId)
    if (!target || target.voided || target.kind === 'period_end' || !target.seasonTeamId) continue
    const reversed: PendingPlay = { id: target.id, kind: target.kind, points: target.points ?? undefined, seasonTeamId: target.seasonTeamId, rosterId: target.rosterId ?? undefined, period: target.period, clockMs: target.clockMs ?? 0, recordedAt: '' }
    if (target.seasonTeamId === home.seasonTeamId) home = addPlay(home, reversed, state.period, -1)
    else away = addPlay(away, reversed, state.period, -1)
    plays = plays.map((play) => play.id === item.eventId ? { ...play, voided: true } : play)
  }
  const bonus = state.format.bonusFouls
  return { ...state, clock, shotClock, plays, home: { ...home, inBonus: away.teamFouls >= bonus }, away: { ...away, inBonus: home.teamFouls >= bonus } }
}

// Time left on the clock now. A running clock counts down from the moment its reading was taken.
export function clockRemaining(clock: LiveClock | null, readAt: number, now: number) {
  if (!clock) return 0
  return clock.running ? Math.max(0, clock.remainingMs - (now - readAt)) : clock.remainingMs
}

// Map server timestamps to the local clock at the time the snapshot arrived.
export function clockServerOffset(clock: LiveClock | null, receivedAt: number) {
  return clock ? Date.parse(clock.serverTime) - receivedAt : 0
}

export function clockServerTimestamp(offset: number) {
  return new Date(Date.now() + offset).toISOString()
}

// Minutes and seconds, with tenths in the last minute like a game clock.
export function formatClock(ms: number) {
  if (ms < 60_000) return `${Math.floor(ms / 1000)}.${Math.floor((ms % 1000) / 100)}`
  const seconds = Math.ceil(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function periodLabel(period: number, periodCount: number) {
  if (period > periodCount) return `OT${period - periodCount > 1 ? period - periodCount : ''}`
  return `${periodCount === 4 ? 'Q' : periodCount === 2 ? 'H' : 'P'}${period}`
}

const playCopy: Record<PlayKind | 'period_end', string> = { points: 'points', rebound: 'Rebound', assist: 'Assist', steal: 'Steal', block: 'Block', turnover: 'Turnover', foul: 'Foul', timeout: 'Timeout', period_end: 'End of period' }
export function describePlay(play: Pick<LivePlay, 'kind' | 'points' | 'player'>) {
  const action = play.kind === 'points' ? `+${play.points}` : playCopy[play.kind]
  return play.player ? `${action} · ${play.player}` : action
}

