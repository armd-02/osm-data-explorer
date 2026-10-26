import React, { useState, useEffect, useRef } from 'react'
import { AppContext } from './context/AppContext'
import Layout from './components/Layout'
import SearchPanel from './components/SearchPanel'
import MapView from './components/MapView'
import ResultsPanel from './components/ResultsPanel'
import StatisticsPanel from './components/StatisticsPanel'
import ExportBar from './components/ExportBar'
import ShareButton from './components/ShareButton'
import EditPanel from './components/EditPanel'
import BatchMatch from './components/BatchMatch'
import AboutPanel from './components/AboutPanel'
import StatusBanner from './components/StatusBanner'
import { decodeURLToState } from './utils/urlState'

// メインタブ定義
const MAIN_TABS = [
  { id: 'search', label: '施設検索' },
  { id: 'batch', label: '一括照合' },
  { id: 'stats', label: '集計・出力' },
  { id: 'about', label: 'について' },
]

function App() {
  const [mainTab, setMainTab] = useState('search')
  const [showMap, setShowMap] = useState(true)
  const [searchCollapsed, setSearchCollapsed] = useState(false)
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
      searchMode: 'simple',
      simpleSearch: { category: '', keyword: '', location: '' },
      advancedSearch: { tags: [], keyword: '', useAnd: true },
      bbox: null,
      status: 'idle',
      results: [],
      error: null,
      errorType: null,
      errorSuggestion: null,
      fetchMeta: null,
      activeResultId: null
    }
  )

  // URLから状態を復元
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    const urlState = decodeURLToState(window.location.search)
    if (urlState) {
      if (urlState.searchMode) dispatch({ type: 'SET_SEARCH_MODE', payload: urlState.searchMode })
      if (urlState.simpleSearch) dispatch({ type: 'SET_SIMPLE_SEARCH', payload: urlState.simpleSearch })
      if (urlState.advancedSearch) dispatch({ type: 'SET_ADVANCED_SEARCH', payload: urlState.advancedSearch })
      if (urlState.bbox) dispatch({ type: 'SET_BBOX', payload: urlState.bbox })
    }
  }, [dispatch])

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <Layout>
        <div className="flex flex-col h-full min-h-screen">
          {/* ===== Top Tab Bar ===== */}
          <nav className="flex items-center gap-1 px-3 py-2 bg-white border-b border-slate-200 shrink-0">
            <span className="text-sm font-semibold text-slate-800 mr-3">OSMデータ検索</span>
            {MAIN_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setMainTab(tab.id)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  mainTab === tab.id
                    ? 'bg-primary-600 text-white font-medium'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* ===== Main Content ===== */}
          <div className="flex-1 flex flex-col min-h-0">
            {mainTab === 'search' && (
              <SearchTabContent
                searchCollapsed={searchCollapsed}
                setSearchCollapsed={setSearchCollapsed}
                showMap={showMap}
                setShowMap={setShowMap}
              />
            )}
            {mainTab === 'batch' && <BatchMatch />}
            {mainTab === 'stats' && (
              <div className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 overflow-y-auto p-4">
                  <StatisticsPanel />
                </div>
                <ExportBar />
              </div>
            )}
            {mainTab === 'about' && (
              <div className="flex-1 overflow-y-auto p-4">
                <AboutPanel />
              </div>
            )}
          </div>
        </div>
      </Layout>
    </AppContext.Provider>
  )
}

/**
 * 施設検索タブの内容
 * (#30) 上部: 検索条件（折りたたみ可）
 *        下部: 施設一覧（65-75%）+ 地図/詳細（25-35%）
 */
function SearchTabContent({ searchCollapsed, setSearchCollapsed, showMap, setShowMap }) {
  const { state } = React.useContext(AppContext)

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Status Banner */}
      <StatusBanner />
      {/* Edit Panel (0件時の導線) */}
      <EditPanel />

      {/* 検索条件（折りたたみ可） */}
      <div className={`shrink-0 border-b border-slate-200 bg-white transition-all ${searchCollapsed ? 'py-1' : 'py-3'}`}>
        <div className="flex items-center gap-2 px-3">
          <button
            onClick={() => setSearchCollapsed(!searchCollapsed)}
            className="text-xs text-slate-500 hover:text-slate-700 px-1"
            title={searchCollapsed ? '検索条件を展開' : '検索条件を折りたたむ'}
          >
            {searchCollapsed ? '▼' : '▲'}
          </button>
          <span className="text-xs font-medium text-slate-500">検索条件</span>
          {state.bbox && (
            <span className="text-[10px] text-slate-400 ml-auto">
              範囲: {state.bbox.south.toFixed(4)}°N, {state.bbox.west.toFixed(4)}°E 〜 {state.bbox.north.toFixed(4)}°N, {state.bbox.east.toFixed(4)}°E
            </span>
          )}
          <ShareButton />
        </div>
        {!searchCollapsed && (
          <div className="px-3 mt-2">
            <SearchPanel />
          </div>
        )}
      </div>

      {/* 施設一覧 + 地図/詳細 のスプリットレイアウト */}
      <div className="flex flex-1 min-h-0">
        {/* 施設一覧（左: 65-75%） */}
        <div className={`${showMap ? 'w-[68%]' : 'w-full'} border-r border-slate-200 flex flex-col min-h-0 transition-all`}>
          <ResultsPanel />
        </div>

        {/* 地図/詳細（右: 25-35%） */}
        {showMap && (
          <div className="w-[32%] flex flex-col min-h-0 relative">
            <div className="flex items-center justify-between px-2 py-1 bg-slate-50 border-b border-slate-100 shrink-0">
              <span className="text-[10px] text-slate-400">地図表示</span>
              <button
                onClick={() => setShowMap(false)}
                className="text-[10px] text-slate-500 hover:text-slate-700"
                title="地図を非表示にして一覧を拡大"
              >
                地図を隠す
              </button>
            </div>
            <div className="flex-1 relative min-h-0">
              <MapView />
            </div>
          </div>
        )}
      </div>

      {/* 地図非表示時の復元ボタン */}
      {!showMap && (
        <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-3 py-1">
          <button
            onClick={() => setShowMap(true)}
            className="text-[10px] text-slate-500 hover:text-primary-600"
          >
            + 地図を表示
          </button>
        </div>
      )}

      {/* エクスポートバー（検索結果から直接出力） */}
      <ExportBar />
    </div>
  )
}

export default App
