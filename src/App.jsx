import React, { useState, useEffect, useRef } from 'react'
import { AppContext, useApp } from './context/AppContext'
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
import BarrierFreeLegend from './components/BarrierFreeLegend'
import { useIsMobile } from './hooks/useIsMobile'
import MobileShell from './components/mobile/MobileShell'
import { BatchMatchProvider } from './context/BatchMatchContext.jsx'
import { appReducer, createInitialState } from './state/appReducer'

// ハンバーガーメニュー（タイトル行右端）の項目 — 画面切替
const MENU_ITEMS = [
  { id: 'search', label: '施設検索' },
  { id: 'batch', label: '店名→座標CSV' },
  { id: 'stats', label: '集計・出力' },
]

// メニュー一番下のフッター項目。画面切替とは別扱い（情報案内）なので、
// 区切りで区切って小さく表示する。
const MENU_FOOTER_ITEM = { label: 'まちデータ帳とは' }

function App() {
  const [mainTab, setMainTab] = useState('search')
  const [searchCollapsed, setSearchCollapsed] = useState(false)
  // 施設検索画面の地図表示切替
  const [showMap, setShowMap] = useState(true)
  // モバイル幅（<1024px）ではモバイル専用レイアウト（下部ナビ3タブ）
  const isMobile = useIsMobile()
  const [state, dispatch] = React.useReducer(appReducer, createInitialState())

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
      // (Task 2) URL復元由来のbboxは source:'url' と記録
      // → MapViewはこれのみカメラfit（検索由来はfitしない）
      if (urlState.bbox) dispatch({ type: 'SET_BBOX', payload: { ...urlState.bbox, source: 'url' } })
      if (urlState.selectedMunicipality) dispatch({ type: 'SET_MUNICIPALITY', payload: urlState.selectedMunicipality })
      if (urlState.municipalitySearch) dispatch({ type: 'SET_MUNICIPALITY_SEARCH', payload: urlState.municipalitySearch })
      // (A2) 一覧フィルタを最後に適用: 検索stateのミラー値を上書きし、URLを権威に
      if (urlState.resultFilters) dispatch({ type: 'SET_RESULT_FILTERS', payload: urlState.resultFilters })
    }
  }, [dispatch])

  // モバイル: 下部ナビゲーションの専用レイアウト
  if (isMobile) {
    return (
      <AppContext.Provider value={{ state, dispatch }}>
        <BatchMatchProvider>
          <MobileShell />
        </BatchMatchProvider>
      </AppContext.Provider>
    )
  }

  // ハンバーガーメニューからの画面切替
  const handleMenuSelect = (id) => { setMainTab(id) }
  const handleAboutSelect = () => { setMainTab('about') }

  // ハンバーガーメニューでハイライトする現在の画面
  // （「まちデータ帳とは」は画面切替とは別扱いなのでハイライトしない）
  const activeMenuId = ['search', 'batch', 'stats'].includes(mainTab) ? mainTab : null

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <BatchMatchProvider>
      <Layout
        headerAction={
          <HamburgerMenu
            items={MENU_ITEMS}
            activeId={activeMenuId}
            onSelect={handleMenuSelect}
            footerItem={MENU_FOOTER_ITEM}
            onFooterSelect={handleAboutSelect}
          />
        }
      >
        <div className="app-shell flex flex-col h-full min-h-0">
          {/* ===== Main Content =====
              上部タブバーに代わって、タイトル行右端のハンバーガーメニューで
              各画面を切り替える。各画面のコンポーネントは既存のまま使用する。 */}
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
              <div className="p-4 space-y-3">
                <StatisticsPanel />
                <ExportBar />
              </div>
            )}
            {mainTab === 'about' && <AboutPanel />}
          </div>
        </div>
      </Layout>
      </BatchMatchProvider>
    </AppContext.Provider>
  )
}

/**
 * 施設検索タブの内容
 * 縦に流れるスクロールレイアウト（スマホと同じ考え方）: 画面全体が1つの縦スクロール列。
 * ブロック順: StatusBanner → EditPanel → 検索条件 → 結果一覧 → 地図 → ExportBar
 * - 検索条件: 折りたたみ式（ヘッダー行 ⇄ フォーム表示）、展開時は自然の高さ。幅いっぱいの行
 * - 結果一覧+地図: 幅1280px以上（xl）で2列グリッド（並列）、未満では1列で縦積み
 * - 結果一覧: 高さ上限640px・内部スクロール（ResultsPanel内で設定。ページが際限なく長くなるのを防ぐ）
 * - 地図: 高さ520px固定のブロック（flexで残り高さを埋める方式は廃止。隠す/表示する切替あり）
 */
export function SearchTabContent({ searchCollapsed, setSearchCollapsed, showMap, setShowMap }) {
  const { state } = useApp()
  const { search, cancel } = useSearch()

  // (回帰) 地図ロード完了までgetMapInstance()はnull。
  // ページを開いた直後は初回レンダリング時点でnullのため、
  // 「検索する」ボタンが地図準備前にno_bboxで無効化され、
  // setMapInstanceはReact状態変更を伴わないため地図準備後も再レンダリングが起きず
  // 無効のままになる。
  // 地図がload/move/zoomした時点でboundsVersionをbumpして再レンダリングさせ、
  // criteriaを新しい地図表示範囲で再計算する（モバイル版boundsVersionと同一方式）。
  // ※ 地図表示中(showMap)の時のみ: 地図非表示時はgetBounds()が古い/縮退した
  // 値を返し、誤ったBBOXで検索が発動する。
  const [boundsVersion, setBoundsVersion] = useState(0)
  useEffect(() => {
    if (!showMap) return undefined
    const map = getMapInstance()
    if (!map || typeof map.on !== 'function' || typeof map.off !== 'function') return undefined
    const bump = () => setBoundsVersion((v) => v + 1)
    map.on('load', bump)
    map.on('moveend', bump)
    map.on('zoomend', bump)
    return () => {
      map.off('load', bump)
      map.off('moveend', bump)
      map.off('zoomend', bump)
    }
  }, [showMap])

  // 検索実行 — フォームのスクロール領域の外にあるボタンから呼ばれる。
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

  return (
    <div className="search-workspace flex-1 min-h-0 overflow-y-auto space-y-3">
      <StatusBanner />
      <EditPanel />

      {/* 検索条件（折りたたみ可・展開時は自然高さ） */}
      <div
        className={`border border-slate-200 rounded-lg bg-white mx-3 ${
          searchCollapsed ? 'py-1' : ''
        }`}
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
          {/* 検索アクション — フォームのスクロール領域の外で常に視認可能 */}
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
          <div className="mt-1">
            <SearchPanel />
          </div>
        )}
      </div>

      {/* 結果一覧 + 地図（1280px以上で2列、未満で縦積み） */}
      <div className="mx-3 grid grid-cols-1 xl:grid-cols-2 gap-3">
        <ResultsPanel />

        {/* 地図（固定高さのブロック） */}
        {showMap ? (
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="h-8 bg-slate-100 border-b border-slate-200 flex items-center px-2">
              <span className="text-[10px] text-slate-500">地図表示</span>
              <button
                onClick={() => setShowMap(false)}
                className="ml-auto text-[10px] text-slate-400 hover:text-slate-600"
              >
                地図を隠す
              </button>
            </div>
            {/* 地図本体: 高さ520px固定（flexでの残り高さ埋めは使わない） */}
            <div className="search-split relative h-[520px]">
              <MapView />
            </div>
            {/* (#62) バリアフリー凡例: 地図本体の下（地図上のオーバーレイ廃止）。
                表示条件は BarrierFreeLegend 自身が context で判定する。 */}
            <BarrierFreeLegend />
          </div>
        ) : (
          <div className="flex items-center justify-center p-4 bg-slate-50 border border-dashed border-slate-300 rounded-lg">
            <button
              onClick={() => setShowMap(true)}
              className="text-xs text-slate-500 hover:text-primary-600 border border-slate-300 rounded px-3 py-1.5 bg-white"
            >
              地図を表示
            </button>
          </div>
        )}
      </div>

      <ExportBar />
    </div>
  )
}

/**
 * ハンバーガーメニュー（タイトル行右端）
 *
 * 上部タブバーの代替として、メニューから「施設検索」「店名→座標CSV」
 * 「集計・出力」の画面を切り替える。開閉状態は内部stateで持つ。
 * 外部クリック・Escキーで閉じる。
 *
 * footerItem（任意）: 画面切替とは別扱いのフッター項目（「まちデータ帳とは」）。
 * メニュー一番下に区切りを入れて小さく表示する。
 */
function HamburgerMenu({ items, activeId, onSelect, footerItem, onFooterSelect }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  // 開いている間は、外部クリック・Escキーで閉じる
  useEffect(() => {
    if (!open) return undefined
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const onEsc = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="メニュー"
        className="flex items-center justify-center w-9 h-9 rounded-md text-slate-600 hover:bg-slate-100 transition-colors"
      >
        {/* ハンバーガーアイコン（≡） */}
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="メニュー"
          className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg py-1"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              aria-current={activeId === item.id ? 'true' : undefined}
              onClick={() => {
                onSelect(item.id)
                setOpen(false)
              }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                activeId === item.id
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
          {/* 画面切替とは別扱いのフッター項目（区切り＋小さい表示） */}
          {footerItem && (
            <>
              <div className="my-1 border-t border-slate-200" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onFooterSelect()
                  setOpen(false)
                }}
                className="w-full text-left px-3 py-1 text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
              >
                {footerItem.label}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default App
