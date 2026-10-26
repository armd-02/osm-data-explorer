import React, { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useApp } from '../context/AppContext'
import { setMapInstance } from '../hooks/useMapRef'
import MapToolbar from './MapToolbar'

// Default center: Osaka, Japan
const DEFAULT_CENTER = [34.6937, 135.5023]
const DEFAULT_ZOOM = 13

/**
 * HTMLエスケープ（XSS対策）
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const MAX_MAP_MARKERS = 500

/**
 * 地図コンポーネント
 * 
 * 設計方針 (#29):
 * - state.bbox は「検索に使う確定BBOX」であり、地図のpan/zoomでは更新されない
 * - 検索範囲は明示的な操作（矩形指定 / 「この範囲を設定」ボタン）でのみ更新
 * - 施設選択のpanToでBBOXが変わらない
 */
function MapView() {
  const mapRef = useRef(null)       // DOM要素ref
  const leafletRef = useRef(null)   // Leaflet Mapインスタンスref
  const bboxLayerRef = useRef(null)
  const markersRef = useRef([])
  const needsFitRef = useRef(false)
  const { state, dispatch } = useApp()
  const { results, activeResultId, bbox } = state

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return

    const initialBbox = state.bbox
    const center = initialBbox
      ? [(initialBbox.south + initialBbox.north) / 2, (initialBbox.west + initialBbox.east) / 2]
      : DEFAULT_CENTER

    const map = L.map(mapRef.current, {
      center,
      zoom: initialBbox ? 12 : DEFAULT_ZOOM,
      zoomControl: true
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map)

    leafletRef.current = map
    setMapInstance(map)

    // URL復元BBOXならfitBoundsする
    if (initialBbox) {
      needsFitRef.current = true
    }

    // (#29) 地図のmoveend/zoomendでBBOXを更新しない
    // 検索BBOXは明示的な操作（矩形指定/ボタン）でのみ変更される

    return () => {
      map.remove()
      leafletRef.current = null
      setMapInstance(null)
    }
  }, [])

  // ウィンドウリサイズで地図サイズを再調整
  useEffect(() => {
    let timer = null
    const onResize = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        if (leafletRef.current) leafletRef.current.invalidateSize()
      }, 100)
    }
    window.addEventListener('resize', onResize)
    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // Draw BBOX overlay（確定BBOXの表示）
  useEffect(() => {
    if (!leafletRef.current) return
    const map = leafletRef.current

    if (bboxLayerRef.current) {
      map.removeLayer(bboxLayerRef.current)
      bboxLayerRef.current = null
    }

    if (bbox) {
      const bounds = L.latLngBounds(
        [bbox.south, bbox.west],
        [bbox.north, bbox.east]
      )
      bboxLayerRef.current = L.rectangle(bounds, {
        color: '#3b82f6',
        weight: 2,
        fillOpacity: 0.05,
        dashArray: '6'
      }).addTo(map)

      // URLからBBOXを復元した場合、地図をその範囲に合わせる
      if (needsFitRef.current) {
        map.fitBounds(bounds, { padding: [20, 20] })
        needsFitRef.current = false
      }
    }
  }, [bbox])

  // Draw result markers
  useEffect(() => {
    if (!leafletRef.current) return
    const map = leafletRef.current

    markersRef.current.forEach((m) => map.removeLayer(m))
    markersRef.current = []

    if (results.length > 0) {
      const visibleResults = results.length > MAX_MAP_MARKERS
        ? results.slice(0, MAX_MAP_MARKERS)
        : results
      visibleResults.forEach((result) => {
        if (result.lat && result.lon) {
          const marker = L.marker([result.lat, result.lon], {
            icon: L.divIcon({
              html: `<div class="w-3 h-3 bg-primary-600 rounded-full border-2 border-white shadow-sm"></div>`,
              iconSize: [12, 12],
              iconAnchor: [6, 6]
            })
          }).addTo(map)

          const name = escapeHtml(result.name || '（名前のない要素）')
          const type = escapeHtml(result.type || 'node')
          const osmUrl = `https://www.openstreetmap.org/${result.type}/${result.id}`
          const keyTags = Object.entries(result.tags || {})
            .filter(([k]) => k !== 'name' && k !== 'name:ja')
            .slice(0, 3)
            .map(([k, v]) => `<div style="color:#555;font-size:11px">${escapeHtml(k)}: ${escapeHtml(v)}</div>`)
            .join('')
          marker.bindPopup(`
            <div style="font-size: 12px; min-width: 160px; max-width: 220px;">
              <strong>${name}</strong><br/>
              <span style="color:#666">${type} / ID: ${result.id}</span><br/>
              <a href="${osmUrl}" target="_blank" rel="noopener" style="color:#2563eb;font-size:11px">🔗 OSMで開く</a>
              ${keyTags}
            </div>
          `)

          markersRef.current.push(marker)
        }
      })
    }
  }, [results])

  // Highlight active result — panToで移動（BBOXは変更しない）
  useEffect(() => {
    if (!leafletRef.current || !activeResultId) return
    const map = leafletRef.current
    const result = results.find((r) => `${r.type}/${r.id}` === activeResultId)
    if (result && result.lat != null && result.lon != null) {
      map.panTo([result.lat, result.lon], { animate: true })
    }
  }, [activeResultId, results])

  // 矩形描画完了時のBBOX設定（明示的な操作）
  const handleDrawComplete = useCallback((newBbox) => {
    dispatch({ type: 'SET_BBOX', payload: newBbox })
  }, [dispatch])

  // 「この表示範囲を検索範囲に設定」ボタン
  const handleSetViewAsBbox = useCallback(() => {
    if (!leafletRef.current) return
    const bounds = leafletRef.current.getBounds()
    dispatch({
      type: 'SET_BBOX',
      payload: {
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast()
      }
    })
  }, [dispatch])

  return (
    <div className="absolute inset-0">
      <div ref={mapRef} className="w-full h-full" />
      <MapToolbar
        leafletRef={leafletRef}
        bboxLayerRef={bboxLayerRef}
        onDrawComplete={handleDrawComplete}
        onSetViewAsBbox={handleSetViewAsBbox}
      />
      {results.length > MAX_MAP_MARKERS && (
        <div className="absolute bottom-1 left-1 right-1 z-[1000] bg-amber-50/95 border border-amber-200 text-amber-800 text-[10px] leading-tight px-2 py-1 rounded shadow-sm">
          地図上の表示は {MAX_MAP_MARKERS} 件まで（全 {results.length.toLocaleString()} 件）。検索結果一覧・集計・CSV/GeoJSON出力は全件対応です。
        </div>
      )}
      {/* BBOX未設定時の案内 */}
      {!bbox && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-blue-50 border border-blue-200 text-blue-800 text-xs px-3 py-1.5 rounded-md shadow-sm">
          検索範囲が未設定です。「☐ 範囲指定」または「この範囲を設定」で指定してください。
        </div>
      )}
    </div>
  )
}

export default MapView
