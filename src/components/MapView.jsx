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
 * OSMタグ値・名称等は第三者編集可能データのため、
 * HTMLとして解釈される前にエスケープする。
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// 地図上のマーカー表示上限。超過時は先頭分のみ表示し、制約を通知で明示する。
// 検索結果一覧・集計・CSV/GeoJSON出力は全件対応（この上限は地図表示のみ）。
const MAX_MAP_MARKERS = 500

function MapView() {
  const mapRef = useRef(null)
  const leafletRef = useRef(null)
  const bboxLayerRef = useRef(null)
  const markersRef = useRef([])
  // URL復元BBOXで地図をfitする必要があるかどうか（初回のみ）
  const needsFitRef = useRef(false)
  const { state, dispatch } = useApp()
  const { results, activeResultId, bbox } = state

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return

    // URLからBBOXが復元されている場合、初期位置をその中心に設定
    const initialBbox = state.bbox
    const center = initialBbox
      ? [(initialBbox.south + initialBbox.north) / 2, (initialBbox.west + initialBbox.east) / 2]
      : DEFAULT_CENTER

    const map = L.map(mapRef.current, {
      center,
      zoom: initialBbox ? 12 : DEFAULT_ZOOM,
      zoomControl: true
    })

    // OSM tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map)

    leafletRef.current = map
    setMapInstance(map)

    // URL復元BBOXなら、bboxLayerのeffectでfitBoundsする
    if (initialBbox) {
      needsFitRef.current = true
    }

    // Update BBOX when map moves（ただしfitBounds直後はスキップ）
    let skipNextUpdate = false
    const updateBbox = () => {
      if (skipNextUpdate) {
        skipNextUpdate = false
        return
      }
      const bounds = map.getBounds()
      dispatch({
        type: 'SET_BBOX',
        payload: {
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast()
        }
      })
    }

    map.on('moveend zoomend', updateBbox)
    // 初期BBOXを反映（fitBoundsはbboxLayerのeffectで行う）
    if (initialBbox) {
      skipNextUpdate = true
      dispatch({
        type: 'SET_BBOX',
        payload: { ...initialBbox }
      })
    } else {
      updateBbox()
    }

    return () => {
      map.remove()
      leafletRef.current = null
      setMapInstance(null)
    }
  }, [dispatch])

  // ウィンドウリサイズ（スマホの画面回転など）で地図サイズを再調整
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

  // Draw BBOX overlay + fitBounds（URL復元時のみ初回）
  useEffect(() => {
    if (!leafletRef.current) return
    const map = leafletRef.current

    // Remove old BBOX layer
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

    // Clear old markers
    markersRef.current.forEach((m) => map.removeLayer(m))
    markersRef.current = []

    // Add new markers (地図上は MAX_MAP_MARKERS 件まで表示)
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

  // Highlight active result（composite key: type/id）
  useEffect(() => {
    if (!leafletRef.current || !activeResultId) return
    const map = leafletRef.current
    const result = results.find((r) => `${r.type}/${r.id}` === activeResultId)
    if (result && result.lat != null && result.lon != null) {
      map.panTo([result.lat, result.lon], { animate: true })
    }
  }, [activeResultId, results])

  const handleDrawComplete = useCallback((bbox) => {
    dispatch({ type: 'SET_BBOX', payload: bbox })
  }, [dispatch])

  return (
    <div className="absolute inset-0">
      <div ref={mapRef} className="w-full h-full" />
      <MapToolbar
        mapRef={mapRef}
        bboxLayerRef={bboxLayerRef}
        onDrawComplete={handleDrawComplete}
      />
      {results.length > MAX_MAP_MARKERS && (
        <div className="absolute bottom-1 left-1 right-1 z-[1000] bg-amber-50/95 border border-amber-200 text-amber-800 text-[10px] leading-tight px-2 py-1 rounded shadow-sm">
          地図上の表示は {MAX_MAP_MARKERS} 件まで（全 {results.length.toLocaleString()} 件）。検索結果一覧・集計・CSV/GeoJSON出力は全件対応です。
        </div>
      )}
    </div>
  )
}

export default MapView
