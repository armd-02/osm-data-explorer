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
import { getMapInstance } from './hooks/useMapRef'
import { useSearch } from './hooks/useSearch'
import { buildSearchCriteria } from './utils/searchCriteria'
import SearchActionButton from './components/SearchActionButton'
import { BatchMatchProvider } from './context/BatchMatchContext.jsx'

// メインタブ定義
const MAIN_TABS = [
  { id: 'search', label: '施設検索' },
  { id: 'batch', label: '店名→座標CSV' },
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
        case 'SET_SEARCH_SOURCE': {
          // (#49 改訂) モード切替時のカテゴリ・キーワード引き継ぎ（last-wins）
          // 切り元の値を切り先に**常に**引き継ぐ。両モードのカテゴリは共有の
          // 単一値として振る舞い、「カテゴリを変えたのにモード切替で古い値に
          // 戻る（カテゴリが変わってない）」問題を解消する。
          const src = action.payload
          const ms = state.municipalitySearch || { category: '', keyword: '', cuisine: '' }
          const ss = state.simpleSearch || { category: '', keyword: '', location: '', cuisine: '' }
          if (src === 'municipality') {
            return {
              ...state,
              searchSource: src,
              municipalitySearch: {
                ...ms,
                category: ss.category,
                keyword: ss.keyword,
                cuisine: ss.cuisine
              }
            }
          }
          if (src === 'map') {
            return {
              ...state,
              searchSource: src,
              simpleSearch: {
                ...ss,
                category: ms.category,
                keyword: ms.keyword,
                cuisine: ms.cuisine
              }
            }
          }
          return { ...state, searchSource: src }
        }
        case 'SET_MUNICIPALITY':
          return { ...state, selectedMunicipality: action.payload }
        case 'SET_MUNICIPALITY_SEARCH':
          return { ...state, municipalitySearch: { ...state.municipalitySearch, ...action.payload } }
        default:
          return state
      }
    },
    {
      searchMode: 'simple',
      simpleSearch: { category: '', keyword: '', location: '', cuisine: '' },
      advancedSearch: { tags: [], keyword: '', useAnd: true },
      bbox: null,
      status: 'idle',
      results: [],
      error: null,
      errorType: null,
      errorSuggestion: null,
      fetchMeta: null,
      activeResultId: null,
      searchSource: 'map',
      selectedMunicipality: null,
      municipalitySearch: { category: '', keyword: '', cuisine: '' }
    }
  )

  // URLから状態を復元
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    const urlState = decodeURLToState(window.location.search)
    if (urlState) {
      // (#49) SET_SEARCH_SOURCE を先頭でdispatch: last-wins引き継ぎにより
      // モード切替時にカテゴリが上書きされるため、モード固有stateの復元より先に
      // 実行しないと、URLのカテゴリが初期値で消去される。
      if (urlState.searchSource) dispatch({ type: 'SET_SEARCH_SOURCE', payload: urlState.searchSource })
      if (urlState.searchMode) dispatch({ type: 'SET_SEARCH_MODE', payload: urlState.searchMode })
      if (urlState.simpleSearch) dispatch({ type: 'SET_SIMPLE_SEARCH', payload: urlState.simpleSearch })
      if (urlState.advancedSearch) dispatch({ type: 'SET_ADVANCED_SEARCH', payload: urlState.advancedSearch })
      if (urlState.bbox) dispatch({ type: 'SET_BBOX', payload: urlState.bbox })
      if (urlState.selectedMunicipality) dispatch({ type: 'SET_MUNICIPALITY', payload: urlState.selectedMunicipality })
      if (urlState.municipalitySearch) dispatch({ type: 'SET_MUNICIPALITY_SEARCH', payload: urlState.municipalitySearch })
    }
  }, [dispatch])

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <BatchMatchProvider>
      <Layout>
        <div className="app-shell flex flex-col h-full min-h-0">
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
          <div className="app-main flex-1 flex flex-col min-h-0">
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
      </BatchMatchProvider>
    </AppContext.Provider>
  )
}

/**
 * 施設検索タブの内容
 * (#30) 上部: 検索条件（折りたたみ可）
 *        下部: 施設一覧（65-75%）+ 地図/詳細（25-35%）
 */
function SearchTabContent({ searchCollapsed, setSearchCollapsed, showMap, setShowMap }) {
  const { state, dispatch } = React.useContext(AppContext)
  const { search, cancel } = useSearch()
  const [splitPct, setSplitPct] = React.useState(68) // (#41) 左右分割比率
  const [topPct, setTopPct] = React.useState(35) // (#45) 上下分割比率（検索条件の割合）
  const splitRef = React.useRef(null) // スプリットコンテナref
  const workspaceRef = React.useRef(null) // ワークスペース全体ref
  const draggingRef = React.useRef(false)
  const draggingVRef = React.useRef(false) // (#45) 縦リサイズ用

  // (#47) 検索実行 — フォームのスクロール領域の外にあるボタンから呼ばれる。
  // クリック時点の state と地図表示範囲で条件スナップショットを生成し、
  // dispatch の直後に旧stateを読む競合を排除する。
  const makeCriteria = () => {
    const map = getMapInstance()
    const mapBounds = map ? map.getBounds() : null
    return buildSearchCriteria(state, { mapBounds })
  }

  const handleSearchClick = () => {
    const criteria = makeCriteria()
    if (!criteria.ok) return // ボタン側でdisableされているが念のため
    search(criteria)
  }

  // 現在の検索条件スナップショット（ボタンのdisable判定・理由表示用）
  const criteria = makeCriteria()

  // (#41-3) Pointer Eventsでリサイズ（マウス/タッチ/ペン対応）
  // pointercancel・アンマウント時のイベント解除に対応
  const cleanupRef = React.useRef(null) // 現在のcleanup関数

  const handleResizeStart = React.useCallback((e) => {
    e.preventDefault()
    draggingRef.current = true
    const container = splitRef.current
    if (!container) return

    // 既存のcleanupがあれば先に実行
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null }

    const onMove = (ev) => {
      if (!draggingRef.current) return
      const rect = container.getBoundingClientRect()
      let pct = ((ev.clientX - rect.left) / rect.width) * 100
      // 最小幅制限: 一覧≥25%, 地図≥20%
      pct = Math.max(25, Math.min(80, pct))
      setSplitPct(pct)
    }

    const cleanup = () => {
      draggingRef.current = false
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      if (cleanupRef.current === cleanup) cleanupRef.current = null
    }

    const onUp = () => {
      cleanup()
      // Leafletサイズ再調整（最終）
      const map = getMapInstance()
      if (map) map.invalidateSize()
    }

    cleanupRef.current = cleanup
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }, [])

  // (#45) 縦リサイズハンドル
  const vCleanupRef = React.useRef(null)

  const handleVResizeStart = React.useCallback((e) => {
    e.preventDefault()
    draggingVRef.current = true
    const workspace = workspaceRef.current
    if (!workspace) return

    if (vCleanupRef.current) { vCleanupRef.current(); vCleanupRef.current = null }

    const onMove = (ev) => {
      if (!draggingVRef.current) return
      const rect = workspace.getBoundingClientRect()
      let pct = ((ev.clientY - rect.top) / rect.height) * 100
      // 最小高さ制限: 上部≥15%, 下部≥40%
      pct = Math.max(15, Math.min(60, pct))
      setTopPct(pct)
    }

    const onUp = () => {
      draggingVRef.current = false
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      if (vCleanupRef.current === cleanup) vCleanupRef.current = null
      const map = getMapInstance()
      if (map) map.invalidateSize()
    }

    const cleanup = () => {
      draggingVRef.current = false
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      if (vCleanupRef.current === cleanup) vCleanupRef.current = null
    }

    vCleanupRef.current = cleanup
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }, [])

  // (#41-3/#45) アンマウント時のイベント解除
  React.useEffect(() => {
    return () => {
      if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null }
      if (vCleanupRef.current) { vCleanupRef.current(); vCleanupRef.current = null }
    }
  }, [])

  // (#41-3/#45) ResizeObserver: コンテナ幅・高さ変化に合わせてinvalidateSize()
  // ドラッグ中もタイルが欠けないよう、連続再描画を抑制して呼び出す
  React.useEffect(() => {
    if (!splitRef.current) return
    let timer = null
    const observer = new ResizeObserver(() => {
      if (timer) return // 連続呼び出しを抑制
      timer = setTimeout(() => {
        timer = null
        const map = getMapInstance()
        if (map) map.invalidateSize()
      }, 50)
    })
    observer.observe(splitRef.current)
    // (#45) ワークスペース全体も監視（縦リサイズ時の高さ変化）
    if (workspaceRef.current) observer.observe(workspaceRef.current)
    return () => {
      observer.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [showMap])

  return (
    <div ref={workspaceRef} className="search-workspace flex flex-col flex-1 min-h-0">
      {/* Status Banner */}
      <StatusBanner />
      {/* Edit Panel (0件時の導線) */}
      <EditPanel />

      {/* 検索条件（折りたたみ可 + 縦リサイズ #45） */}
      <div
        className={`shrink-0 border-b border-slate-200 bg-white overflow-hidden ${searchCollapsed ? 'py-1' : ''}`}
        style={!searchCollapsed ? { height: `${topPct}%` } : undefined}
      >
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
            <span className="text-[10px] text-slate-400 min-w-0 max-w-[260px] truncate hidden md:inline-block">
              範囲: {state.bbox.south.toFixed(4)}°N, {state.bbox.west.toFixed(4)}°E 〜 {state.bbox.north.toFixed(4)}°N, {state.bbox.east.toFixed(4)}°E
            </span>
          )}
          {/* (#47) 検索アクション — フォームのスクロール領域の外で常に視認可能 */}
          <div className="ml-auto flex items-center gap-2">
            <SearchActionButton
              criteria={criteria}
              status={state.status}
              onSearch={handleSearchClick}
              onCancel={cancel}
            />
            <ShareButton />
          </div>
        </div>
        {!searchCollapsed && (
          <div className="px-3 mt-1 overflow-y-auto h-[calc(100%-28px)]">
            <SearchPanel />
          </div>
        )}
      </div>

      {/* (#45) 縦リサイズハンドル */}
      {!searchCollapsed && (
        <div
          className="h-4 cursor-row-resize bg-slate-200 hover:bg-primary-300 active:bg-primary-400 transition-colors flex items-center justify-center shrink-0 touch-none"
          onPointerDown={handleVResizeStart}
          title="上下にドラッグして検索条件と結果領域の高さを調整"
        >
          <div className="w-16 h-1 rounded-full bg-slate-400" />
        </div>
      )}

      {/* 施設一覧 + 地図 のリサイズ可能スプリットレイアウト (#41) */}
      <div ref={splitRef} className="search-split flex flex-1 min-h-0 relative">
        {/* 施設一覧（左） */}
        <div
          className={`${showMap ? '' : 'w-full'} flex flex-col min-h-0 overflow-hidden`} 
          style={showMap ? { width: `${splitPct}%` } : undefined}
        >
          <ResultsPanel />
        </div>

        {/* ドラッグハンドル (#41-2): 見た目4px、ヒット領域16px */}
        {showMap && (
          <div
            className="w-4 cursor-col-resize bg-slate-200 hover:bg-primary-300 active:bg-primary-400 transition-colors flex items-center justify-center shrink-0 touch-none"
            onPointerDown={handleResizeStart}
            title="ドラッグでリサイズ"
          >
            <div className="w-1 h-8 bg-slate-400 rounded-full" />
          </div>
        )}

        {/* 地図（右） */}
        {showMap && (
          <div
            className="flex flex-col min-h-0 relative flex-1 overflow-hidden"
          >
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
