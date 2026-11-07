import React, { useState, useCallback, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { geocode } from '../utils/geo'

/**
 * 地名検索のポップアップ内容をDOMノードで構築する（#38）。
 * 全テキストはtextContentで設定（setHTMLに文字列を渡さない）。
 */
function buildGeocodePopupElement(displayName) {
  const root = document.createElement('div')
  root.className = 'geocode-popup'
  const line1 = document.createElement('strong')
  line1.textContent = displayName
  const line2 = document.createElement('small')
  line2.textContent = '地図の表示位置が移動しました'
  root.append(line1, line2)
  return root
}

/**
 * 地名検索用マーカー要素（プレーンDOM、#38準拠）
 */
function buildGeocodeMarkerElement() {
  const el = document.createElement('div')
  el.className = 'geocode-marker'
  return el
}

/**
 * 地図ツールバー: 地名検索のみ（MapLibre版）
 *
 * (#41) 矩形描画と「この範囲を設定」ボタンは無い。
 * 検索範囲は地図の表示範囲（getBounds）で自動的に決定される。
 */
function MapToolbar({ mapRef }) {
  const [geocodeQuery, setGeocodeQuery] = useState('')
  const [geocoding, setGeocoding] = useState(false)
  const [geocodeError, setGeocodeError] = useState(null)
  const markerRef = useRef(null)

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
      const m = mapRef.current
      if (m) {
        // MapLibreのcenterは[経度, 緯度]順
        m.setView([result.lon, result.lat], Math.max(m.getZoom(), 15))

        // 前回の地名検索マーカーを削除（残存防止）
        if (markerRef.current) {
          markerRef.current.remove()
          markerRef.current = null
        }

        const marker = new maplibregl.Marker({ element: buildGeocodeMarkerElement() })
          .setLngLat([result.lon, result.lat])
        // (#38) ポップアップはDOMノード（textContent）のみ
        marker.setPopup(
          new maplibregl.Popup({ offset: 14 }).setDOMElement(buildGeocodePopupElement(result.displayName))
        )
        marker.addTo(m)
        markerRef.current = marker
        // マーカーのポップアップを開く（旧Leaflet版のopenPopupに相当）
        marker.getPopup().addTo(m)
      }

      setGeocodeQuery('')
    } catch (error) {
      setGeocodeError(error.message || '地名検索に失敗しました')
    } finally {
      setGeocoding(false)
    }
  }, [geocodeQuery, geocoding, mapRef])

  // アンマウント時にマーカーを削除
  React.useEffect(() => {
    return () => {
      if (markerRef.current) {
        markerRef.current.remove()
        markerRef.current = null
      }
    }
  }, [])

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
