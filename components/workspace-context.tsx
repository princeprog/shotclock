'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { leagueRequest } from '@/lib/league-client'
import { readOrganizationSelection, resolveSelectedOrganization, subscribeOrganizationSelection } from '@/lib/organization-selection'
import { useAppDispatch, useAppSelector } from '@/lib/store-hooks'
import { selectLeague, selectSeason } from '@/lib/ui-slice'
import { parseWorkspaceSelection, readWorkspaceSelection, resolveWorkspaceLeague, resolveWorkspaceSeason, saveWorkspaceSelection, subscribeWorkspaceSelection } from '@/lib/workspace-selection'

type Organization = { id: string; name: string }
type League = { id: string; name: string; location: string | null }
type Season = { id: string; name: string; status: 'draft' | 'active' | 'completed'; start_date: string | null; end_date: string | null }

function useWorkspaceValue() {
  const client = useQueryClient()
  const dispatch = useAppDispatch()
  const ui = useAppSelector((state) => state.ui)
  const storedOrganization = useSyncExternalStore(subscribeOrganizationSelection, readOrganizationSelection, () => '')
  const organizations = useQuery({ queryKey: ['league', 'organizations'], queryFn: () => leagueRequest<Organization[]>('organizations', client), retry: false })
  const organization = resolveSelectedOrganization(organizations.data ?? [], ui.organizationId, storedOrganization)
  const organizationId = organization?.id ?? ''
  const getSnapshot = useCallback(() => readWorkspaceSelection(organizationId), [organizationId])
  const raw = useSyncExternalStore(subscribeWorkspaceSelection, getSnapshot, () => '')
  const saved = useMemo(() => parseWorkspaceSelection(raw), [raw])
  const leagues = useQuery({ queryKey: ['league', `organizations/${organizationId}/leagues`], queryFn: () => leagueRequest<League[]>(`organizations/${organizationId}/leagues`, client), enabled: !!organizationId, retry: false })
  const canUseUi = !ui.organizationId || ui.organizationId === organizationId
  const preferredLeague = (canUseUi && ui.leagueId) || saved.leagueId
  const league = resolveWorkspaceLeague(leagues.data ?? [], preferredLeague)
  const leagueId = league?.id ?? ''
  const seasons = useQuery({ queryKey: ['league', `leagues/${leagueId}/seasons`], queryFn: () => leagueRequest<Season[]>(`leagues/${leagueId}/seasons`, client), enabled: !!leagueId, retry: false })
  const preferredSeason = (canUseUi && ui.leagueId === leagueId && ui.seasonId) || saved.seasons[leagueId] || ''
  const season = resolveWorkspaceSeason(seasons.data ?? [], preferredSeason)

  useEffect(() => {
    if (!organizationId || !leagueId) return
    const seasonId = season?.id ?? ''
    const autoLeague = !ui.leagueId && saved.leagueId !== leagueId
    const hasStoredSeason = seasons.data?.some((item) => item.id === saved.seasons[leagueId])
    const autoSeason = saved.leagueId === leagueId && !!seasonId && !hasStoredSeason && !(ui.leagueId === leagueId && ui.seasonId)
    if (!autoLeague && !autoSeason) return
    saveWorkspaceSelection(organizationId, { leagueId, seasons: seasonId ? { ...saved.seasons, [leagueId]: seasonId } : saved.seasons })
  }, [organizationId, leagueId, season?.id, saved, seasons.data, ui.leagueId, ui.seasonId])

  function changeLeague(id: string) {
    if (id === leagueId || !leagues.data?.some((item) => item.id === id)) return
    dispatch(selectLeague(id))
    saveWorkspaceSelection(organizationId, { ...saved, leagueId: id })
  }
  function changeSeason(id: string) {
    if (!leagueId || !seasons.data?.some((item) => item.id === id)) return
    if (ui.leagueId !== leagueId) dispatch(selectLeague(leagueId))
    dispatch(selectSeason(id))
    saveWorkspaceSelection(organizationId, { leagueId, seasons: { ...saved.seasons, [leagueId]: id } })
  }
  function changeWorkspace(nextLeagueId: string, nextSeasonId: string) {
    if (!leagues.data?.some((item) => item.id === nextLeagueId) || !nextSeasonId) return
    dispatch(selectLeague(nextLeagueId))
    dispatch(selectSeason(nextSeasonId))
    saveWorkspaceSelection(organizationId, { leagueId: nextLeagueId, seasons: { ...saved.seasons, [nextLeagueId]: nextSeasonId } })
  }
  return { organizations, organization, leagues, league, seasons, season, changeLeague, changeSeason, changeWorkspace }
}

const WorkspaceContext = createContext<ReturnType<typeof useWorkspaceValue> | null>(null)
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const value = useWorkspaceValue()
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}
export function useWorkspace() {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('WorkspaceProvider is missing')
  return value
}
