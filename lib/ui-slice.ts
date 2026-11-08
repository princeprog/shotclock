import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

const initialState = { sidebarOpen: true, organizationId: '', leagueId: '', seasonId: '' }

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setSidebarOpen(state, action: PayloadAction<boolean>) { state.sidebarOpen = action.payload },
    selectOrganization(state, action: PayloadAction<string>) { state.organizationId = action.payload; state.leagueId = ''; state.seasonId = '' },
    selectLeague(state, action: PayloadAction<string>) { state.leagueId = action.payload; state.seasonId = '' },
    selectSeason(state, action: PayloadAction<string>) { state.seasonId = action.payload },
    resetUi() { return initialState },
  },
})

export const { setSidebarOpen, selectOrganization, selectLeague, selectSeason, resetUi } = uiSlice.actions
export const uiReducer = uiSlice.reducer
