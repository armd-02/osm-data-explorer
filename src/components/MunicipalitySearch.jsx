import React, { useMemo, useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { useSearch } from '../hooks/useSearch'
import { CATEGORIES } from '../data/categories'

/**
 * (#44) 自治体別施設検索
 * 都道府県→市区町村を選んで、その自治体BBOXでPOIを検索する。
 * 自治体データは静的JSON（public/data/municipalities.json）から読み込む。
 */

// 都道府県リストを動的生成（データ読み込み後にセット）
export default function MunicipalitySearch() {
  const { state, dispatch } = useApp()
  const { search, cancel } = useSearch()

  const [data, setData] = useState(null) // municipalities.json
  const [loading, setLoading] = useState(true)
  const [prefCode, setPrefCode] = useState('')
  const [munCode, setMunCode] = useState('')
  const [category, setCategory] = useState('')
  const [keyword, setKeyword] = useState('')

  // 自治体JSONをフェッチ（初回のみ）
  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/'
    fetch(base + 'data/municipalities.json')
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(d => {
        setData(d)
        // URL復元: selectedMunicipalityがあればpref/munをセット
        if (state.selectedMunicipality && state.selectedMunicipality.code) {
          const mun = d.municipalities.find(m => m.code === state.selectedMunicipality.code)
          if (mun) {
            setPrefCode(mun.prefCode)
            setMunCode(mun.code)
            if (state.simpleSearch?.category) setCategory(state.simpleSearch.category)
            if (state.simpleSearch?.keyword) setKeyword(state.simpleSearch.keyword)
          }
        }
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  // 都道府県リストを生成（prefCode + nameの重複排除）
  const PREFECTURES = useMemo(() => {
    if (!data) return []
    const map = new Map()
    for (const m of data.municipalities) {
      if (m.prefCode && m.prefecture && !map.has(m.prefCode)) {
        map.set(m.prefCode, { code: m.prefCode, name: m.prefecture })
      }
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code))
  }, [data])

  // 選択した都道府県内の自治体（admin_level 7 + 8）
  const munList = useMemo(() => {
    if (!data || !prefCode) return []
    return data.municipalities
      .filter(m => m.prefCode === prefCode)
      .sort((a, b) => {
        // admin_level 7 を優先、次に 8
        if (a.adminLevel !== b.adminLevel) return a.adminLevel - b.adminLevel
        return a.name.localeCompare(b.name, 'ja')
      })
  }, [data, prefCode])

  // 選択した自治体
  const selectedMun = useMemo(() => {
    if (!data || !munCode) return null
    return data.municipalities.find(m => m.code === munCode) || null
  }, [data, munCode])

  // 地名変更時、自治体選択をリセット
  const handlePrefChange = (e) => {
    setPrefCode(e.target.value)
    setMunCode('')
  }

  // 検索実行 (#44: 自治体BBOXを直接使用)
  const handleSearch = () => {
    if (!selectedMun) return

    // 自治体BBOXを渡す
    dispatch({ type: 'SET_SEARCH_SOURCE', payload: 'municipality' })
    dispatch({ type: 'SET_MUNICIPALITY', payload: {
      code: selectedMun.code,
      name: selectedMun.name,
      bbox: selectedMun.bbox
    }})

    // 検索モードをmunicipalityに設定
    dispatch({ type: 'SET_SEARCH_MODE', payload: 'simple' })
    dispatch({ type: 'SET_SIMPLE_SEARCH', payload: { category, keyword, location: '' } })

    // 自治体BBOXで検索
    search(selectedMun.bbox)
  }

  const isLoading = state.status === 'loading'

  // ローディング中
  if (loading) {
    return <p className="text-sm text-slate-500 py-4 text-center">自治体データを読み込み中...</p>
  }

  // データ読み込み失敗
  if (!data) {
    return <p className="text-sm text-red-600 py-4 text-center">自治体データの読み込みに失敗しました。</p>
  }

  return (
    <div className="space-y-3">
      {/* 都道府県選択 */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">都道府県</label>
        <select
          value={prefCode}
          onChange={handlePrefChange}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="">選択してください</option>
          {PREFECTURES.map(p => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* 市区町村選択 */}
      {prefCode && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">市区町村</label>
          <select
            value={munCode}
            onChange={(e) => setMunCode(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">選択してください</option>
            {munList.map(m => (
              <option key={m.code} value={m.code}>
                {m.name}
                {m.adminLevel === 8 ? '（区）' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* カテゴリ・キーワード（任意） */}
      {selectedMun && (
        <>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">カテゴリ（任意）</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">すべて（POI）</option>
              {CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">キーワード（任意）</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="例: 寿司"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        </>
      )}

      {/* BBOX表示 */}
      {selectedMun && (
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
          <p className="text-xs text-slate-600">
            📍 {selectedMun.name}とその周辺（BBOX）
          </p>
          <p className="text-xs text-slate-400 font-mono mt-1">
            {selectedMun.bbox.south.toFixed(4)}, {selectedMun.bbox.west.toFixed(4)}
            〜{selectedMun.bbox.north.toFixed(4)}, {selectedMun.bbox.east.toFixed(4)}
          </p>
          <p className="text-xs text-amber-600 mt-1">
            ⚠️ BBOXには隣接自治体の施設が含まれる場合があります
          </p>
          {/* (#44) 広域自治体警告 */}
          {(() => {
            const b = selectedMun.bbox
            const latKm = (b.north - b.south) * 111
            const lonKm = (b.east - b.west) * 111 * Math.cos(((b.north + b.south) / 2) * Math.PI / 180)
            const area = latKm * lonKm
            if (area > 40000) return <p className="text-xs text-red-600 mt-1">❌ この自治体は広すぎるため検索できません</p>
            if (area > 2500) return <p className="text-xs text-amber-700 mt-1">⚠️ 広域のため検索に時間がかかる場合があります（約${Math.round(area).toLocaleString()} km²）</p>
            return null
          })()}
        </div>
      )}

      {/* 検索ボタン */}
      <button
        onClick={handleSearch}
        disabled={!selectedMun || isLoading || (selectedMun && (() => {
          const b = selectedMun.bbox
          const latKm = (b.north - b.south) * 111
          const lonKm = (b.east - b.west) * 111 * Math.cos(((b.north + b.south) / 2) * Math.PI / 180)
          return latKm * lonKm > 40000
        })())}
        className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
      >
        {isLoading ? '検索中...' : '検索する'}
      </button>
      {isLoading && (
        <button
          onClick={cancel}
          className="w-full py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          中止
        </button>
      )}
    </div>
  )
}
