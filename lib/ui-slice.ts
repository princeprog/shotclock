import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

const initialState = { sidebarOpen: true, organizationId: '', leagueId: '', seasonId: '', divisionId: '' }

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setSidebarOpen(state, action: PayloadAction<boolean>) { state.sidebarOpen = action.payload },
    selectOrganization(state, action: PayloadAction<string>) { state.organizationId = action.payload; state.leagueId = ''; state.seasonId = ''; state.divisionId = '' },
    selectLeague(state, action: PayloadAction<string>) { state.leagueId = action.payload; state.seasonId = ''; state.divisionId = '' },
    selectSeason(state, action: PayloadAction<string>) { state.seasonId = action.payload; state.divisionId = '' },
    selectDivision(state, action: PayloadAction<string>) { state.divisionId = action.payload },
    resetUi() { return initialState },
  },
})

export const { setSidebarOpen, selectOrganization, selectLeague, selectSeason, selectDivision, resetUi } = uiSlice.actions
export const uiReducer = uiSlice.reducer
