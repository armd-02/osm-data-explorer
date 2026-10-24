import React, { useState } from 'react'
import { AppContext } from './context/AppContext'
import Layout from './components/Layout'
import SearchPanel from './components/SearchPanel'
import MapView from './components/MapView'
import ResultsPanel from './components/ResultsPanel'
import StatisticsPanel from './components/StatisticsPanel'
import ExportBar from './components/ExportBar'
import StatusBanner from './components/StatusBanner'

function App() {
  const [rightTab, setRightTab] = useState('results') // 'results' | 'stats'
  const [state, dispatch] = React.useReducer(
    (state, action) => {
      switch (action.type) {
        case 'SET_SEARCH_MODE':
          return { ...state, searchMode: action.payload }
        case 'SET_SIMPLE_SEARCH':
          return { ...state, simpleSearch: { ...state.simpleSearch, ...action.payload } }
        case 'SET_ADVANCED_SEARCH':
          return { ...state, advancedSearch: { ...state.advancedSearch, ...action.payload } }
        case 'SET_BBOX':
          return { ...state, bbox: action.payload }
        case 'SET_STATUS':
          return { ...state, status: action.payload }
        case 'SET_RESULTS':
          return { ...state, results: action.payload }
        case 'SET_FETCH_META':
          return { ...state, fetchMeta: action.payload }
        case 'SET_ERROR':
          return { ...state, error: action.payload, errorType: action.errorType || null, errorSuggestion: action.errorSuggestion || null }
        case 'CLEAR_RESULTS':
          return { ...state, results: [], error: null, errorType: null, errorSuggestion: null, status: 'idle', fetchMeta: null }
        case 'SET_ACTIVE_RESULT':
          return { ...state, activeResultId: action.payload }
        default:
          return state
      }
    },
    {
      searchMode: 'simple', // 'simple' | 'advanced'
      simpleSearch: {
        category: '',
        keyword: '',
        location: ''
      },
      advancedSearch: {
        tags: [],
        keyword: '',
        useAnd: true
      },
      bbox: null, // { south, west, north, east }
      status: 'idle', // 'idle' | 'loading' | 'success' | 'error'
      results: [],
      error: null,
      errorType: null,
      errorSuggestion: null,
      fetchMeta: null, // { fetchedAt, endpoint, elementCount, cached }
      activeResultId: null
    }
  )

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <Layout>
        <div className="flex flex-col lg:flex-row h-full">
          {/* Search Panel - left side */}
          <div className="w-full lg:w-80 xl:w-96 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 overflow-y-auto">
            <SearchPanel />
          </div>

          {/* Map + Results - right side */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Status Banner */}
            <StatusBanner />

            {/* Map */}
            <div className="flex-1 relative min-h-[300px] lg:min-h-[400px]">
              <MapView />
            </div>

            {/* Results / Stats Panel - bottom */}
            <div className="h-48 lg:h-56 shrink-0 border-t border-slate-200 flex flex-col">
              {/* Tab bar */}
              <div className="flex items-center gap-1 px-3 py-1 bg-white border-b border-slate-100 shrink-0">
                <button
                  onClick={() => setRightTab('results')}
                  className={`px-3 py-1 text-xs rounded-t transition-colors ${
                    rightTab === 'results' ? 'text-primary-700 font-medium border-b-2 border-primary-500' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  検索結果
                </button>
                <button
                  onClick={() => setRightTab('stats')}
                  className={`px-3 py-1 text-xs rounded-t transition-colors ${
                    rightTab === 'stats' ? 'text-primary-700 font-medium border-b-2 border-primary-500' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  集計
                </button>
              </div>
              {/* Content */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {rightTab === 'results' ? <ResultsPanel /> : <StatisticsPanel />}
              </div>
              {/* Export bar */}
              <ExportBar />
            </div>
          </div>
        </div>
      </Layout>
    </AppContext.Provider>
  )
}

export default App
