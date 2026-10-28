import React, { useState, useEffect, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { useSearch } from '../../hooks/useSearch'
import { getMapInstance } from '../../hooks/useMapRef'
import { buildSearchCriteria } from '../../utils/searchCriteria'
import MapView from '../MapView'
import SearchActionButton from '../SearchActionButton'

/**
 * (#59) モバイル「地図」タブ
 *
 * - フルスクリーンマップ + 地名検索ツールバー
 * - 「この表示範囲で検索」ボタン: 押下時点で getBounds() を読み、明示的なトリガーのみで検索
 *   （地図の移動・拡大だけでOverpass検索が自動実行されることはない）
 * - マーカータップで施設詳細ボトムシートを開く（onMarkerClick）
 */
export default function MobileMapTab({ onMarkerClick = null }) {
  const { state, dispatch } = useApp()
  const { search, cancel } = useSearch()
  const [boundsVersion, setBoundsVersion] = useState(0)

  useEffect(() => {
    const map = getMapInstance()
    if (!map || typeof map.on !== 'function' || typeof map.off !== 'function') return undefined
    const update = () => setBoundsVersion((v) => v + 1)
    map.on('moveend', update)
    map.on('zoomend', update)
    return () => {
      map.off('moveend', update)
      map.off('zoomend', update)
    }
  }, [])

  const mapBounds = useMemo(() => {
    const map = getMapInstance()
    return map && typeof map.getBounds === 'function' ? map.getBounds() : null
  }, [boundsVersion])

  const isMapMode = state.searchSource === 'map'
  const criteria = useMemo(
    () => buildSearchCriteria(state, isMapMode && mapBounds ? { mapBounds } : {}),
    [state, mapBounds, isMapMode]
  )

  const handleSearch = () => {
    const map = getMapInstance()
    const mapBounds =
      map && typeof map.getBounds === 'function' ? map.getBounds() : null
    const c = buildSearchCriteria(state, isMapMode && mapBounds ? { mapBounds } : {})
    if (c.ok !== true) return
    search(c)
  }

  const rangeText = isMapMode
    ? (mapBounds ? '現在の表示範囲' : null)
    : state.selectedMunicipality
      ? `${state.selectedMunicipality.name}（自治体モード）`
      : null

  return (
    <div className="h-full flex flex-col">
      <div className="relative flex-1 min-h-0">
        {/* MapView は内部的に MapToolbar（地名検索）を含む */}
        <MapView onMarkerClick={onMarkerClick} />
      </div>

      <div className="shrink-0 bg-white border-t border-slate-200 px-3 py-3 space-y-1.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <p className="text-[11px] text-slate-500 truncate">
          検索範囲: <span className="text-slate-700">{rangeText || '未設定'}</span>
        </p>
        <SearchActionButton
          fullWidth
          criteria={criteria}
          status={state.status}
          onSearch={handleSearch}
          onCancel={cancel}
          label={isMapMode ? 'この表示範囲で検索' : '検索する'}
        />
      </div>
    </div>
  )
}
