import React, { useState, useEffect, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { useSearch } from '../../hooks/useSearch'
import { getMapInstance } from '../../hooks/useMapRef'
import { buildSearchCriteria } from '../../utils/searchCriteria'
import { checkBboxSize } from '../../utils/geo'
import SimpleSearch from '../SimpleSearch'
import MunicipalitySearch from '../MunicipalitySearch'
import AdvancedSearch from '../AdvancedSearch'
import SearchActionButton from '../SearchActionButton'
import ShareButton from '../ShareButton'

/**
 * (#44) サンプルアクション（生活者目線の入口）
 * 「コーヒーを探す」のように目的単位でタップすると、
 * 現在のエリア+カテゴリで即検索される。
 */
const SAMPLE_ACTIONS = [
  { icon: '☕', label: 'コーヒー', catId: 'cafe' },
  { icon: '🏪', label: 'コンビニ', catId: 'convenience' },
  { icon: '🌳', label: '公園', catId: 'park' },
  { icon: '💊', label: '薬局', catId: 'pharmacy' },
]

/**
 * (#59) モバイル「検索」タブ
 *
 * 入力順（優先度順）: 1) エリア 2) 施設カテゴリ 3) 施設名・キーワード 4) 検索実行
 * - 詳細条件は「条件を追加」で展開する段階的開示（AdvancedSearch）
 * - 「検索する」ボタンはスロールームの外（ヘッダー横並び方式のP0再発防止）
 * - 地図の移動でOverpass検索は実行されない（明示的な押下のみ）
 * - 検索中は「中止」でキャンセル可能
 */

function AreaCard({ state }) {
  const { bbox } = state
  const info = bbox ? checkBboxSize(bbox) : null
  return (
    <div className="space-y-0.5">
      <span className="text-sm text-slate-700">地図の現在表示範囲</span>
      <span className="block text-[11px] text-slate-500">
        「地図」タブで移動・拡大して、検索したい範囲を設定できます。
      </span>
      {bbox && (
        <span className="block font-mono text-[10px] text-slate-400 break-all">
          直前: {bbox.south}, {bbox.west} 〜 {bbox.north}, {bbox.east}
          {info && `（約${Math.round(info.areaKm2).toLocaleString()} km²）`}
        </span>
      )}
      {info && info.message && (
        <span className={`block text-[11px] ${info.tooLarge ? 'text-red-600' : 'text-amber-600'}`}>
          {info.message}
        </span>
      )}
    </div>
  )
}

export default function MobileSearchTab({ onViewResults }) {
  const { state, dispatch } = useApp()
  const { search, cancel } = useSearch()
  const { searchSource, searchMode, bbox, selectedMunicipality } = state
  const [boundsVersion, setBoundsVersion] = useState(0)
  const [sampleMsg, setSampleMsg] = useState(null)

  const switchSource = (source) => {
    if (source === state.searchSource) return
    dispatch({ type: 'SET_SEARCH_SOURCE', payload: source })
    if (source === 'map') dispatch({ type: 'SET_MUNICIPALITY', payload: null })
  }

  const setMode = (mode) => {
    dispatch({ type: 'SET_SEARCH_MODE', payload: mode })
  }

  // 地図が動いた場合（地理コード等）に範囲情報を再計算
  useEffect(() => {
    if (searchSource !== 'map') return undefined
    const map = getMapInstance()
    if (!map || typeof map.on !== 'function' || typeof map.off !== 'function') return undefined
    const update = () => setBoundsVersion((v) => v + 1)
    map.on('moveend', update)
    map.on('zoomend', update)
    return () => {
      map.off('moveend', update)
      map.off('zoomend', update)
    }
  }, [searchSource])

  const isAdvanced = searchMode === 'advanced'

  // 検索条件スナップショット（ボタンの無効判定・ヒント表示用）
  const criteria = useMemo(() => {
    const map = getMapInstance()
    const mapBounds =
      searchSource === 'map' && map && typeof map.getBounds === 'function' ? map.getBounds() : null
    return buildSearchCriteria(state, mapBounds ? { mapBounds } : {})
  }, [state, searchSource, boundsVersion, bbox, selectedMunicipality])

  const handleSearch = () => {
    const map = getMapInstance()
    const mapBounds =
      searchSource === 'map' && map && typeof map.getBounds === 'function' ? map.getBounds() : null
    const c = buildSearchCriteria(state, mapBounds ? { mapBounds } : {})
    if (c.ok !== true) return
    search(c)
  }

  // (#44) サンプルアクション: 現在のエリア+目的カテゴリで即検索
  const handleSample = (catId) => {
    const map = getMapInstance()
    const mapBounds =
      searchSource === 'map' && map && typeof map.getBounds === 'function' ? map.getBounds() : null
    const next =
      searchSource === 'municipality'
        ? { ...state, municipalitySearch: { ...state.municipalitySearch, category: catId } }
        : { ...state, simpleSearch: { ...state.simpleSearch, category: catId } }
    const c = buildSearchCriteria(next, mapBounds ? { mapBounds } : {})
    if (c.ok !== true) {
      setSampleMsg(c.message || '先に検索エリアを設定してください')
      return
    }
    setSampleMsg(null)
    search(c)
  }

  const sourceBtn = (id, label) => (
    <button
      type="button"
      role="tab"
      aria-selected={searchSource === id}
      onClick={() => switchSource(id)}
      className={`min-h-[44px] text-sm rounded-lg transition-colors ${
        searchSource === id
          ? 'bg-white text-slate-800 shadow-sm font-medium'
          : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-3">
        {/* 検索ソース切替 */}
        <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-xl p-1" role="tablist" aria-label="検索モード">
          {sourceBtn('map', '地図範囲で検索')}
          {sourceBtn('municipality', '自治体で検索')}
        </div>

        {searchSource === 'municipality' ? (
          /* エリア(都道府県・市区町村)＋カテゴリ・料理・キーワードをMunicipalitySearchが一括表示 */
          <MunicipalitySearch variant="mobile" />
        ) : (
          <>
            {/* 1) エリア */}
            <section className="bg-slate-50 border border-slate-200 rounded-xl p-3" aria-label="検索範囲">
              <h2 className="text-[11px] font-medium text-slate-500 mb-1.5">どの街・エリアで探す？</h2>
              <AreaCard state={state} />
            </section>

            {/* 2) カテゴリ / 3) キーワード */}
            {isAdvanced ? <AdvancedSearch /> : <SimpleSearch variant="mobile" />}

            {/* 詳細条件の段階的開示 */}
            <button
              type="button"
              onClick={() => setMode(isAdvanced ? 'simple' : 'advanced')}
              className="w-full min-h-[44px] text-sm font-medium text-primary-600 bg-white border border-primary-200 rounded-xl hover:bg-primary-50"
            >
              {isAdvanced ? '− 簡易検索に戻る' : '＋ 条件を追加（詳細検索）'}
            </button>
          </>
        )}

        <ShareButton />

        {/* (#44) サンプルアクション: 「探す」の入口を明示する */}
        <section aria-label="サンプル検索" className="bg-blue-50 border border-blue-100 rounded-xl p-3">
          <h2 className="text-[11px] font-medium text-blue-700 mb-1.5">サンプル検索で試す</h2>
          <div className="grid grid-cols-2 gap-1.5">
            {SAMPLE_ACTIONS.map((s) => (
              <button
                key={s.catId}
                type="button"
                onClick={() => handleSample(s.catId)}
                className="min-h-[44px] rounded-lg bg-white border border-slate-200 px-2 text-sm text-slate-700 active:bg-slate-50"
              >
                {s.icon} {s.label}
              </button>
            ))}
          </div>
          {sampleMsg ? (
            <p className="mt-1.5 text-[11px] text-amber-700">⚠️ {sampleMsg}</p>
          ) : (
            <p className="mt-1.5 text-[11px] text-slate-500">
              現在のエリアでその目的の施設をすぐ検索します。
            </p>
          )}
        </section>
      </div>

      {/* 4) 検索実行（スロールームの外に固定 — P0 再発防止） */}
      <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <SearchActionButton
          fullWidth
          criteria={criteria}
          status={state.status}
          onSearch={handleSearch}
          onCancel={cancel}
          label="検索する"
        />
      </div>
    </div>
  )
}
