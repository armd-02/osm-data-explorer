import React, { useState, useCallback, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { CATEGORIES, getCategoryById, categoryToReadableTags } from '../data/categories'
import { geocode } from '../utils/geo'
import { useMapRef } from '../hooks/useMapRef'

function SimpleSearch() {
  const { state, dispatch } = useApp()
  const { category, keyword, location } = state.simpleSearch
  const [geocoding, setGeocoding] = useState(false)
  const [geocodeMsg, setGeocodeMsg] = useState(null)
  const mapRef = useMapRef()

  const update = (field, value) => {
    dispatch({ type: 'SET_SIMPLE_SEARCH', payload: { [field]: value } })
  }

  const handleLocate = useCallback(async (e) => {
    e.preventDefault()
    if (!location.trim() || geocoding) return

    setGeocoding(true)
    setGeocodeMsg(null)

    try {
      const result = await geocode(location)
      if (!result) {
        setGeocodeMsg({ type: 'error', text: '場所が見つかりませんでした' })
        return
      }

      // 地図を移動
      if (mapRef.current) {
        const map = mapRef.current
        map.setView([result.lat, result.lon], Math.max(map.getZoom(), 14))
      }

      setGeocodeMsg({ type: 'success', text: `「${location}」へ移動しました` })
      update('location', '')
    } catch (error) {
      setGeocodeMsg({ type: 'error', text: error.message })
    } finally {
      setGeocoding(false)
    }
  }, [location, geocoding, mapRef, dispatch])

  // 選択中カテゴリのタグ情報
  const selectedCat = useMemo(() => (category ? getCategoryById(category) : null), [category])

  return (
    <div className="space-y-3">
      {/* Category selection */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          探したいカテゴリ
        </label>
        <select
          value={category}
          onChange={(e) => update('category', e.target.value)}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="">選択してください（任意）</option>
          {CATEGORIES.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.label}</option>
          ))}
        </select>
        {selectedCat && (
          <div className="mt-1.5 bg-slate-50 rounded px-2 py-1.5">
            <p className="text-[11px] text-slate-500">
              条件: <code className="text-[11px] bg-white px-1 rounded">{categoryToReadableTags(selectedCat)}</code>
            </p>
            {selectedCat.description && (
              <p className="text-[11px] text-slate-400 mt-0.5">{selectedCat.description}</p>
            )}
          </div>
        )}
        <p className="mt-1 text-[11px] text-slate-400">
          ※ 初期カテゴリは代表的な施設のみです。詳細検索で任意のタグを指定できます。
        </p>
        {!category && (
          <p className="mt-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1">
            ⚠️ カテゴリ未指定だと、範囲内の<strong>全OSM地物</strong>（道路・建物・施設など大量）を取得します。カテゴリやキーワードで絞り込むと、目的の施設に集中して検索が速くなります。
          </p>
        )}
      </div>

      {/* Keyword search */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          名前やキーワード
        </label>
        <input
          type="text"
          value={keyword}
          onChange={(e) => update('keyword', e.target.value)}
          placeholder="例: 珈琲、ラーメン"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <p className="mt-1 text-xs text-slate-400">
          店舗名や施設名の一部で検索できます
        </p>
      </div>

      {/* Location */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          場所（地名）
        </label>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={location}
            onChange={(e) => update('location', e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLocate(e)}
            placeholder="例: 大阪市北区、十三"
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <button
            type="button"
            onClick={handleLocate}
            disabled={geocoding || !location.trim()}
            className="px-3 py-2 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 disabled:text-slate-300 text-slate-700 text-sm rounded-lg transition-colors"
            title="地図をその場所へ移動"
          >
            {geocoding ? '...' : '移動'}
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          地図を目的地へ移動します。検索範囲は地図の表示範囲になります。
        </p>
        {geocodeMsg && (
          <p className={`mt-1 text-xs ${geocodeMsg.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
            {geocodeMsg.text}
          </p>
        )}
      </div>
    </div>
  )
}

export default SimpleSearch
