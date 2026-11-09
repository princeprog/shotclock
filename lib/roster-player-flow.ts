export type PlayerDetails = { firstName: string; lastName: string; dateOfBirth: string; position?: string }
export type SavedPlayerDetails = { firstName: string; lastName: string; dateOfBirth: string | null; position: string | null }
export type PlayerUpdate = { firstName?: string; lastName?: string; dateOfBirth?: string; position?: string | null }

export function playerCorrections(saved: SavedPlayerDetails, corrected: SavedPlayerDetails): PlayerUpdate | undefined {
  const update: PlayerUpdate = {}
  if (corrected.firstName !== saved.firstName) update.firstName = corrected.firstName
  if (corrected.lastName !== saved.lastName) update.lastName = corrected.lastName
  if (corrected.dateOfBirth && corrected.dateOfBirth !== saved.dateOfBirth) update.dateOfBirth = corrected.dateOfBirth
  if (corrected.position !== saved.position) update.position = corrected.position
  return Object.keys(update).length ? update : undefined
}

export async function savePlayerAndJersey(changes: { jerseyChanged: boolean; playerChanged: boolean }, actions: { saveJersey: () => Promise<unknown>; savePlayer: () => Promise<unknown> }) {
  if (changes.jerseyChanged) await actions.saveJersey()
  if (!changes.playerChanged) return
  try { await actions.savePlayer() }
  catch (error) {
    if (!changes.jerseyChanged) throw error
    const message = error instanceof Error ? error.message : 'Please try again.'
    throw new Error(`Jersey number was saved, but player details could not be saved. ${message}`)
  }
}

export const correctionTeamsQueryKey = (seasonId: string) => ['league', `seasons/${seasonId}/teams?correction=all`] as const

export async function loadSeasonRegistrations<T>(loadDivisions: () => Promise<{ id: string }[]>, loadTeams: (divisionId: string) => Promise<T[]>): Promise<T[]> {
  const divisions = await loadDivisions()
  return (await Promise.all(divisions.map((division) => loadTeams(division.id)))).flat()
}

type ForkedPlayer = { id: string; requires_fork: boolean }

export async function updateOwnedPlayer<T extends ForkedPlayer>(playerId: string, requiresFork: boolean, changes: PlayerUpdate, actions: {
  fork: (id: string) => Promise<T>
  onForked: (player: T) => void
  update: (id: string, changes: PlayerUpdate) => Promise<unknown>
}) {
  if (requiresFork) {
    const player = await actions.fork(playerId)
    playerId = player.id
    actions.onForked(player)
  }
  await actions.update(playerId, changes)
  return playerId
}

type AddPlayer = { jerseyNumber: number | null } & ({ playerId: string; requiresFork?: boolean; player?: never; playerUpdate?: PlayerUpdate } | { playerId?: never; requiresFork?: never; player: PlayerDetails; playerUpdate?: never })

export async function addRosterPlayer<T extends ForkedPlayer>(input: AddPlayer, actions: {
  create: (player: PlayerDetails) => Promise<{ id: string }>
  fork?: (id: string) => Promise<T>
  onForked?: (player: T) => void
  update: (id: string, player: PlayerUpdate) => Promise<unknown>
  register: (body: { playerId: string; jerseyNumber: number | null }) => Promise<unknown>
  onCreated: (id: string) => void
  onUpdated: (player: PlayerUpdate) => void
}) {
  let playerId: string
  if (input.playerId !== undefined) {
    playerId = input.playerId
    if (input.playerUpdate) {
      if (input.requiresFork && (!actions.fork || !actions.onForked)) throw new Error('Player fork is unavailable.')
      playerId = await updateOwnedPlayer(playerId, !!input.requiresFork, input.playerUpdate, {
        fork: actions.fork ?? (() => { throw new Error('Player fork is unavailable.') }),
        onForked: actions.onForked ?? (() => { throw new Error('Player fork could not be retained.') }),
        update: actions.update,
      })
      actions.onUpdated(input.playerUpdate)
    }
  } else {
    const player = await actions.create(input.player)
    playerId = player.id
    actions.onCreated(playerId)
  }
  await actions.register({ playerId, jerseyNumber: input.jerseyNumber })
}
