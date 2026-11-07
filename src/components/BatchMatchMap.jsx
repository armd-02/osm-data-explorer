import React, { useRef, useEffect } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { OSM_RASTER_STYLE } from '../utils/mapStyle'

/**
 * 一括照合用ミニ地図 (#35)（MapLibre版）
 * プレビュー候補の位置を表示（panToのみ、BBOX変更しない）
 * 確定済みの位置も表示
 *
 * (モバイル対応) PCのBatchMatch 3ペインとモバイル縦流れレイアウトの両方で
 * 共用する。#38（プレーンテキストポップアップ）・#39（対象なし時のマーカー
 * 削除＝残存防止）の挙動をここで一元管理する。
 */
export default function BatchMatchMap({ matchResults, previewCandidate, activeRow }) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: OSM_RASTER_STYLE,
      // MapLibreのcenterは[経度, 緯度]順（旧Leaflet版は[34.705, 135.485]）
      center: [135.485, 34.705],
      zoom: 14
    })
    mapRef.current = map

    return () => {
      if (markerRef.current) {
        markerRef.current.remove()
        markerRef.current = null
      }
      map.remove()
      mapRef.current = null
    }
  }, [])

  // プレビュー/確定の位置へpanTo
  useEffect(() => {
    const map = mapRef.current
    if (!map || !matchResults) return

    let target = null

    // プレビュー候補があればそれを優先
    if (previewCandidate) {
      const row = matchResults.find(r => r.index === previewCandidate.index)
      if (row && row.candidates[previewCandidate.candidateIdx]) {
        const c = row.candidates[previewCandidate.candidateIdx]
        if (c.result.lat != null && c.result.lon != null) {
          target = { lat: c.result.lat, lon: c.result.lon, label: c.result.name || '候補', confirmed: false }
        }
      }
    }

    // プレビューなしなら、確定済みの場合のみ表示 (#39: confirmedフラグで判定)
    if (!target && activeRow?.confirmed && activeRow.matched) {
      if (activeRow.matched.lat != null && activeRow.matched.lon != null) {
        target = { lat: activeRow.matched.lat, lon: activeRow.matched.lon, label: activeRow.matched.name || '確定済', confirmed: true }
      }
    }

    // 対象がない場合は既存マーカーを削除 (#39: マーカー残存防止)
    if (!target) {
      if (markerRef.current) {
        markerRef.current.remove()
        markerRef.current = null
      }
      return
    }

    // MapLibreのpanToは[経度, 緯度]順
    map.panTo([target.lon, target.lat])

    // マーカー更新
    if (markerRef.current) {
      markerRef.current.remove()
      markerRef.current = null
    }
    const color = target.confirmed ? '#059669' : '#dc2626'
    const el = document.createElement('div')
    el.className = 'batch-map-marker'
    el.style.background = color
    const marker = new maplibregl.Marker({ element: el }).setLngLat([target.lon, target.lat])
    // #38: 安全なテキストポップアップ（setTextはプレーンテキスト）
    marker.setPopup(new maplibregl.Popup({ offset: 12 }).setText(target.label ?? ''))
    marker.addTo(map)
    markerRef.current = marker
  }, [previewCandidate, activeRow?.confirmed, activeRow?.matched?.lat, activeRow?.matched?.lon, matchResults])

  return <div ref={mapContainerRef} className="w-full h-full" />
}
