import React, { useEffect, useRef } from 'react'
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
 * 設計方針 (#29 + #41):
 * - state.bbox は「前回検索に使用したBBOX」であり、地図のpan/zoomでは更新されない
 * - (#41) 検索範囲は「検索する」押下時点の地図表示範囲（getBounds）で決定される
 * - 矩形指定・「この範囲を設定」ボタンは廃止
 * - 施設選択のpanToでBBOXが変わらない
 */
function MapView() {
  const mapRef = useRef(null)       // DOM要素ref
  const leafletRef = useRef(null)   // Leaflet Mapインスタンスref
  const bboxLayerRef = useRef(null)
  const markersRef = useRef([])
  // (#41-1) 初回BBOX復元時のみfitBounds。URL復元がマウント後に発生しても対応。
  const hasFitInitialBboxRef = useRef(false)
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

    // (#41-1) 初回BBOX復元フラグ: false = まだfitしていない
    // BBOX overlay effectが初回bbox出現時にfitしてtrueにする
    hasFitInitialBboxRef.current = false

    // (#29) 地図のmoveend/zoomendでBBOXを更新しない

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

  // Draw BBOX overlay（前回検索範囲の表示）
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
        weight: 1.5,
        fillOpacity: 0.03,
        dashArray: '6'
      }).addTo(map)

      // (#41-1) 初回BBOX復元時のみfitBounds
      // マウント後にURLからBBOXが復元された場合でも、一度だけ地図を合わせる。
      // その後の検索・panToではfitBoundsしない。
      if (!hasFitInitialBboxRef.current) {
        map.fitBounds(bounds, { padding: [20, 20] })
        hasFitInitialBboxRef.current = true
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

  return (
    <div className="absolute inset-0">
      <div ref={mapRef} className="w-full h-full" />
      <MapToolbar leafletRef={leafletRef} />
      {results.length > MAX_MAP_MARKERS && (
        <div className="absolute bottom-1 left-1 right-1 z-[1000] bg-amber-50/95 border border-amber-200 text-amber-800 text-[10px] leading-tight px-2 py-1 rounded shadow-sm">
          地図上の表示は {MAX_MAP_MARKERS} 件まで（全 {results.length.toLocaleString()} 件）。検索結果一覧・集計・CSV/GeoJSON出力は全件対応です。
        </div>
      )}
    </div>
  )
}

export default MapView
