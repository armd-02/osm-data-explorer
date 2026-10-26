import React, { useState, useRef, useCallback, useEffect } from 'react'
import L from 'leaflet'
import { useApp } from '../context/AppContext'
import { geocode, isAdministrativeBoundary } from '../utils/geo'

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 地図ツールバー: 地名検索 + 矩形描画 + 表示範囲設定
 * 
 * (#29) leafletRefはLeaflet Mapインスタンスのref（DOM要素refではない）
 */
function MapToolbar({ leafletRef, bboxLayerRef, onDrawComplete, onSetViewAsBbox }) {
  const [geocodeQuery, setGeocodeQuery] = useState('')
  const [geocoding, setGeocoding] = useState(false)
  const [geocodeError, setGeocodeError] = useState(null)
  const [drawingMode, setDrawingMode] = useState(false)
  const firstClickRef = useRef(null)
  const drawLineRef = useRef(null)
  const drawRectRef = useRef(null)

  const map = leafletRef.current

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

      // 地図を目的地へ移動（BBOXは変更しない）
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
          `<strong>${escapeHtml(result.displayName)}</strong><br/><small>地図の表示位置が移動します（検索範囲は変更されません）</small>`
        ).openPopup()
      }

      setGeocodeQuery('')
    } catch (error) {
      setGeocodeError(error.message || '地名検索に失敗しました')
    } finally {
      setGeocoding(false)
    }
  }, [geocodeQuery, geocoding, leafletRef])

  // 矩形描画モードのトグル
  const toggleDrawMode = useCallback(() => {
    const m = leafletRef.current
    if (!m) return

    if (drawingMode) {
      m.off('click', handleClick)
      setDrawingMode(false)
      firstClickRef.current = null
      if (drawLineRef.current) {
        m.removeLayer(drawLineRef.current)
        drawLineRef.current = null
      }
      if (drawRectRef.current) {
        m.removeLayer(drawRectRef.current)
        drawRectRef.current = null
      }
    } else {
      m.on('click', handleClick)
      setDrawingMode(true)
    }
  }, [drawingMode, leafletRef])

  const handleClick = useCallback((e) => {
    const m = leafletRef.current
    if (!m) return

    const latlng = e.latlng

    if (!firstClickRef.current) {
      firstClickRef.current = latlng
      L.marker(latlng, {
        icon: L.divIcon({
          html: '<div style="width:10px;height:10px;background:#f59e0b;border-radius:50%;border:2px solid white"></div>',
          iconSize: [10, 10],
          iconAnchor: [5, 5]
        })
      }).addTo(m)
    } else {
      const start = firstClickRef.current
      const end = latlng

      const south = Math.min(start.lat, end.lat)
      const north = Math.max(start.lat, end.lat)
      const west = Math.min(start.lng, end.lng)
      const east = Math.max(start.lng, end.lng)

      const bounds = L.latLngBounds([south, west], [north, east])
      if (drawRectRef.current) {
        m.removeLayer(drawRectRef.current)
      }
      drawRectRef.current = L.rectangle(bounds, {
        color: '#f59e0b',
        weight: 2,
        fillOpacity: 0.1
      }).addTo(m)

      // 矩形でBBOXを設定（明示的な操作）
      onDrawComplete({ south, west, north, east })

      firstClickRef.current = null
      m.off('click', handleClick)
      setDrawingMode(false)
    }
  }, [leafletRef, onDrawComplete])

  // アンマウント時クリーンアップ
  useEffect(() => {
    return () => {
      const m = leafletRef.current
      if (m) {
        m.off('click', handleClick)
      }
    }
  }, [leafletRef])

  return (
    <div className="absolute top-2 right-2 z-[1000] flex flex-col gap-1.5">
      {/* 地名検索 */}
      <form onSubmit={handleGeocode} className="flex gap-1">
        <input
          type="text"
          value={geocodeQuery}
          onChange={(e) => setGeocodeQuery(e.target.value)}
          placeholder="地名で移動"
          className="px-2 py-1 text-xs border border-slate-200 rounded-md bg-white shadow-sm w-32 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <button
          type="submit"
          disabled={geocoding || !geocodeQuery.trim()}
          className="px-2 py-1 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 text-white text-xs rounded-md shadow-sm transition-colors"
          title="地図の表示位置を移動（検索範囲は変更されません）"
        >
          {geocoding ? '...' : 'GO'}
        </button>
      </form>

      {geocodeError && (
        <p className="text-[10px] text-red-600 bg-red-50 rounded px-1.5 py-0.5 max-w-36">
          {geocodeError}
        </p>
      )}

      {/* 矩形描画トグル */}
      <button
        onClick={toggleDrawMode}
        className={`px-2.5 py-1.5 text-xs rounded-md shadow-sm transition-colors border ${
          drawingMode
            ? 'bg-amber-500 text-white border-amber-600'
            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
        }`}
        title="矩形を描いて検索範囲を指定"
      >
        {drawingMode ? '描画中...' : '☐ 範囲指定'}
      </button>

      {drawingMode && (
        <p className="text-[10px] text-slate-600 bg-white/90 rounded px-1.5 py-1 max-w-40 shadow-sm">
          地図をクリックして2点指定してください
        </p>
      )}

      {/* 現在の表示範囲を検索範囲に設定 */}
      <button
        onClick={onSetViewAsBbox}
        className="px-2.5 py-1.5 text-xs rounded-md shadow-sm transition-colors border bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
        title="地図の現在の表示範囲を検索範囲に設定"
      >
        ◎ この範囲を設定
      </button>
    </div>
  )
}

export default MapToolbar
