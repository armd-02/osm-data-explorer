import React, { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useApp } from '../context/AppContext'
import { setMapInstance } from '../hooks/useMapRef'
import MapToolbar from './MapToolbar'

// Default center: Osaka, Japan
const DEFAULT_CENTER = [34.6937, 135.5023]
const DEFAULT_ZOOM = 13

function MapView() {
  const mapRef = useRef(null)
  const leafletRef = useRef(null)
  const bboxLayerRef = useRef(null)
  const markersRef = useRef([])
  const { state, dispatch } = useApp()
  const { results, activeResultId, bbox } = state

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return

    const map = L.map(mapRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true
    })

    // OSM tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map)

    leafletRef.current = map
    setMapInstance(map)

    // Update BBOX when map moves
    const updateBbox = () => {
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
    updateBbox()

    return () => {
      map.remove()
      leafletRef.current = null
      setMapInstance(null)
    }
  }, [dispatch])

  // Draw BBOX overlay
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
    }
  }, [bbox])

  // Draw result markers
  useEffect(() => {
    if (!leafletRef.current) return
    const map = leafletRef.current

    // Clear old markers
    markersRef.current.forEach((m) => map.removeLayer(m))
    markersRef.current = []

    // Add new markers
    if (results.length > 0 && results.length <= 500) {
      results.forEach((result) => {
        if (result.lat && result.lon) {
          const marker = L.marker([result.lat, result.lon], {
            icon: L.divIcon({
              html: `<div class="w-3 h-3 bg-primary-600 rounded-full border-2 border-white shadow-sm"></div>`,
              iconSize: [12, 12],
              iconAnchor: [6, 6]
            })
          }).addTo(map)

          const name = result.name || '（名前のない要素）'
          const type = result.type || 'node'
          const osmUrl = `https://www.openstreetmap.org/${type}/${result.id}`
          const keyTags = Object.entries(result.tags || {})
            .filter(([k]) => k !== 'name' && k !== 'name:ja')
            .slice(0, 3)
            .map(([k, v]) => `<div style="color:#555;font-size:11px">${k}: ${v}</div>`)
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

  // Highlight active result
  useEffect(() => {
    if (!leafletRef.current || !activeResultId) return
    const map = leafletRef.current
    const result = results.find((r) => r.id === activeResultId)
    if (result && result.lat && result.lon) {
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
    </div>
  )
}

export default MapView
