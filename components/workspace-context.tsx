'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePathname, useRouter } from 'next/navigation'
import { leagueRequest } from '@/lib/league-client'
import { allowWorkspaceChange } from '@/lib/schedule-navigation-guard'
import { organizationPickerUrl, shouldChooseOrganization } from '@/lib/organization-navigation'
import { readOrganizationSelection, resolveSelectedOrganization, subscribeOrganizationSelection } from '@/lib/organization-selection'
import { useAppDispatch, useAppSelector } from '@/lib/store-hooks'
import { selectDivision, selectLeague, selectSeason } from '@/lib/ui-slice'
import { parseWorkspaceSelection, readWorkspaceSelection, resolveWorkspaceDivision, resolveWorkspaceLeague, resolveWorkspaceSeason, saveWorkspaceSelection, subscribeWorkspaceSelection } from '@/lib/workspace-selection'

type Organization = { id: string; name: string }
type League = { id: string; name: string; location: string | null }
type Season = { id: string; name: string; status: 'draft' | 'active' | 'completed'; start_date: string | null; end_date: string | null }
type Division = { id: string; season_id: string; name: string; min_age: number | null; max_age: number | null }

function useWorkspaceValue() {
  const client = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const dispatch = useAppDispatch()
  const ui = useAppSelector((state) => state.ui)
  const storedOrganization = useSyncExternalStore(subscribeOrganizationSelection, readOrganizationSelection, () => '')
  const organizations = useQuery({ queryKey: ['league', 'organizations'], queryFn: () => leagueRequest<Organization[]>('organizations', client), retry: false })
  const organization = resolveSelectedOrganization(organizations.data ?? [], ui.organizationId, storedOrganization)
  const organizationId = organization?.id ?? ''
  useEffect(() => {
    if (!shouldChooseOrganization(organizations.status, organizations.fetchStatus, !!organization)) return
    if (!pathname.startsWith('/manage/')) return
    const { search, hash } = window.location
    router.replace(organizationPickerUrl(`${pathname}${search}${hash}`))
  }, [organization, organizations.fetchStatus, organizations.status, pathname, router])
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
  const seasonId = season?.id ?? ''
  const divisions = useQuery({ queryKey: ['league', `seasons/${seasonId}/divisions`], queryFn: () => leagueRequest<Division[]>(`seasons/${seasonId}/divisions`, client), enabled: !!seasonId, retry: false })
  const preferredDivision = (canUseUi && ui.seasonId === seasonId && ui.divisionId) || saved.divisions?.[seasonId] || ''
  const division = resolveWorkspaceDivision(divisions.data ?? [], preferredDivision)

  useEffect(() => {
    if (!organizationId || !leagueId) return
    const seasonId = season?.id ?? ''
    const autoLeague = !ui.leagueId && saved.leagueId !== leagueId
    const hasStoredSeason = seasons.data?.some((item) => item.id === saved.seasons[leagueId])
    const autoSeason = saved.leagueId === leagueId && !!seasonId && !hasStoredSeason && !(ui.leagueId === leagueId && ui.seasonId)
    const autoDivision = !!seasonId && !!division && saved.divisions?.[seasonId] !== division.id
    if (!autoLeague && !autoSeason && !autoDivision) return
    saveWorkspaceSelection(organizationId, { ...saved, leagueId, seasons: seasonId ? { ...saved.seasons, [leagueId]: seasonId } : saved.seasons, ...(autoDivision ? { divisions: { ...saved.divisions, [seasonId]: division.id } } : {}) })
  }, [organizationId, leagueId, season?.id, division, saved, seasons.data, ui.leagueId, ui.seasonId])

  function changeLeague(id: string) {
    if (id === leagueId || !leagues.data?.some((item) => item.id === id)) return
    if (!allowWorkspaceChange()) return
    dispatch(selectLeague(id))
    saveWorkspaceSelection(organizationId, { ...saved, leagueId: id })
  }
  function changeSeason(id: string) {
    if (!leagueId || !seasons.data?.some((item) => item.id === id)) return
    if (id === seasonId || !allowWorkspaceChange()) return
    if (ui.leagueId !== leagueId) dispatch(selectLeague(leagueId))
    dispatch(selectSeason(id))
    saveWorkspaceSelection(organizationId, { ...saved, leagueId, seasons: { ...saved.seasons, [leagueId]: id } })
  }
  function changeDivision(id: string) {
    if (!seasonId || !divisions.data?.some((item) => item.id === id)) return
    if (ui.leagueId !== leagueId) dispatch(selectLeague(leagueId))
    if (ui.seasonId !== seasonId) dispatch(selectSeason(seasonId))
    dispatch(selectDivision(id))
    saveWorkspaceSelection(organizationId, { ...saved, leagueId, seasons: { ...saved.seasons, [leagueId]: seasonId }, divisions: { ...saved.divisions, [seasonId]: id } })
  }
  function changeWorkspace(nextLeagueId: string, nextSeasonId: string, nextDivisionId?: string) {
    if (!leagues.data?.some((item) => item.id === nextLeagueId) || !nextSeasonId) return
    if ((nextLeagueId !== leagueId || nextSeasonId !== seasonId) && !allowWorkspaceChange()) return
    dispatch(selectLeague(nextLeagueId))
    dispatch(selectSeason(nextSeasonId))
    if (nextDivisionId) dispatch(selectDivision(nextDivisionId))
    saveWorkspaceSelection(organizationId, { ...saved, leagueId: nextLeagueId, seasons: { ...saved.seasons, [nextLeagueId]: nextSeasonId }, ...(nextDivisionId ? { divisions: { ...saved.divisions, [nextSeasonId]: nextDivisionId } } : {}) })
  }
  return { organizations, organization, leagues, league, seasons, season, divisions, division, changeLeague, changeSeason, changeDivision, changeWorkspace }
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
