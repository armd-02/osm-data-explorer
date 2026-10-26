import React, { useState, useCallback } from 'react'
import L from 'leaflet'
import { geocode } from '../utils/geo'

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 地図ツールバー: 地名検索のみ
 * 
 * (#41) 矩形描画と「この範囲を設定」ボタンを削除。
 * 検索範囲は地図の表示範囲（getBounds）で自動的に決定される。
 */
function MapToolbar({ leafletRef }) {
  const [geocodeQuery, setGeocodeQuery] = useState('')
  const [geocoding, setGeocoding] = useState(false)
  const [geocodeError, setGeocodeError] = useState(null)

  const handleGeocode = useCallback(async (e) => {
    e.preventDefault()
    if (!geocodeQuery.trim() || geocoding) return

    setGeocoding(true)
    setGeocodeError(null)

    try {
      const result = await geocode(geocodeQuery)
      if (!result) {
        setGeocodeError('場所が見つかりませんでした。別の表記で試してください。')
        return
      }

      // 地図を目的地へ移動
      const m = leafletRef.current
      if (m) {
        m.setView([result.lat, result.lon], Math.max(m.getZoom(), 15))

        L.marker([result.lat, result.lon], {
          icon: L.divIcon({
            html: '<div style="width:16px;height:16px;background:#2563eb;border-radius:50%;border:3px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          })
        }).addTo(m).bindPopup(
          `<strong>${escapeHtml(result.displayName)}</strong><br/><small>地図の表示位置が移動しました</small>`
        ).openPopup()
      }

      setGeocodeQuery('')
    } catch (error) {
      setGeocodeError(error.message || '地名検索に失敗しました')
    } finally {
      setGeocoding(false)
    }
  }, [geocodeQuery, geocoding, leafletRef])

  return (
    <div className="absolute top-2 right-2 z-[1000] flex flex-col gap-1.5">
      {/* 地名検索 */}
      <form onSubmit={handleGeocode} className="flex gap-1">
        <input
          type="text"
          value={geocodeQuery}
          onChange={(e) => setGeocodeQuery(e.target.value)}
          placeholder="地名で移動"
          className="px-2 py-1 text-xs border border-slate-200 rounded-md bg-white shadow-sm w-28 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <button
          type="submit"
          disabled={geocoding || !geocodeQuery.trim()}
          className="px-2 py-1 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 text-white text-xs rounded-md shadow-sm transition-colors"
        >
          {geocoding ? '...' : 'GO'}
        </button>
      </form>

      {geocodeError && (
        <p className="text-[10px] text-red-600 bg-red-50 rounded px-1.5 py-0.5 max-w-32">
          {geocodeError}
        </p>
      )}
    </div>
  )
}

export default MapToolbar
