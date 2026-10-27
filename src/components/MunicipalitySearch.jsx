import React, { useMemo, useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { CATEGORIES } from '../data/categories'

/**
 * (#44) 自治体別施設検索
 * 都道府県→市区町村を選んで、その自治体BBOXでPOIを検索する。
 * 自治体データは静的JSON（public/data/municipalities.json）から読み込む。
 */

// 都道府県リストを動的生成（データ読み込み後にセット）
export default function MunicipalitySearch() {
  const { state, dispatch } = useApp()

  const [data, setData] = useState(null) // municipalities.json
  const [loading, setLoading] = useState(true)
  const [prefCode, setPrefCode] = useState('')
  const [munCode, setMunCode] = useState('')
  // (#47) カテゴリ・キーワードは親stateに上げ、検索ボタンと共有する
  const { category, keyword } = state.municipalitySearch || { category: '', keyword: '' }

  // 自治体JSONをフェッチ（初回のみ）
  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/'
    fetch(base + 'data/municipalities.json')
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  /**
   * 親stateのselectedMunicipalityとselectを同期（URL復元対応）
   *
   * 旧実装は初回fetchの.then内で state をクローズしていたが、Reactは
   * 子effect→親effect の順で実行するため、App側のURL復元dispatchが
   * fetch解決前に反映されるかどうかで結果が変わる（stale closure競合）。
   * 代わりに data / selectedMunicipality 変化に反応するeffectにすると
   * タイミングに依存せず確定的に同期される。
   */
  useEffect(() => {
    if (!data || !state.selectedMunicipality || !state.selectedMunicipality.code) return
    const mun = data.municipalities.find(m => m.code === state.selectedMunicipality.code)
    if (!mun || mun.code === munCode) return
    setPrefCode(mun.prefCode)
    setMunCode(mun.code)
    // (#46) 表示名・BBOXが未設定ならデータから補完
    if (!state.selectedMunicipality.name || !state.selectedMunicipality.bbox) {
      dispatch({ type: 'SET_MUNICIPALITY', payload: {
        code: mun.code,
        name: mun.displayName || mun.name,
        bbox: mun.bbox
      }})
    }
  }, [data, state.selectedMunicipality, munCode, dispatch])

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

  // 都道府県変更時、自治体選択をリセットし、親stateからもクリア (#47)
  const handlePrefChange = (e) => {
    setPrefCode(e.target.value)
    setMunCode('')
    dispatch({ type: 'SET_MUNICIPALITY', payload: null })
  }

  // (#47) 市区町村選択を親stateに同期（検索ボタンのdisable判定・BBOX共有用）
  const handleMunChange = (e) => {
    const code = e.target.value
    setMunCode(code)
    if (!code) {
      dispatch({ type: 'SET_MUNICIPALITY', payload: null })
      return
    }
    const mun = data.municipalities.find(m => m.code === code)
    if (mun) {
      dispatch({ type: 'SET_MUNICIPALITY', payload: {
        code: mun.code,
        name: mun.displayName || mun.name,
        bbox: mun.bbox
      }})
    }
  }

  const updateMunicipalitySearch = (field, value) => {
    dispatch({ type: 'SET_MUNICIPALITY_SEARCH', payload: { [field]: value } })
  }

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
            onChange={handleMunChange}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">選択してください</option>
            {munList.map(m => (
              <option key={m.code} value={m.code}>
                {m.displayName || m.name}
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
              onChange={(e) => updateMunicipalitySearch('category', e.target.value)}
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
              onChange={(e) => updateMunicipalitySearch('keyword', e.target.value)}
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
            📍 {selectedMun.displayName || selectedMun.name}とその周辺（BBOX）
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
    </div>
  )
}
