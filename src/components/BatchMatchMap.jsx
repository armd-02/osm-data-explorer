import React, { useRef, useEffect } from 'react'
import L from 'leaflet'

/**
 * 一括照合用ミニ地図 (#35)
 * プレビュー候補の位置を表示（panToのみ、BBOX変更しない）
 * 確定済みの位置も表示
 *
 * (モバイル対応) PCのBatchMatch 3ペインとモバイル縦流れレイアウトの両方で
 * 共用する。#38（プレーンテキストツールチップ）・#39（対象なし時のマーカー
 * 削除＝残存防止）の挙動をここで一元管理する。
 */
export default function BatchMatchMap({ matchResults, previewCandidate, activeRow }) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = L.map(mapContainerRef.current, {
      center: [34.705, 135.485],
      zoom: 14,
      zoomControl: true,
      attributionControl: true  // OSM帰属表示を有効化 (#35)
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // プレビュー/確定の位置へpanTo
  useEffect(() => {
    if (!mapRef.current || !matchResults) return

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
        mapRef.current.removeLayer(markerRef.current)
        markerRef.current = null
      }
      return
    }

    mapRef.current.panTo([target.lat, target.lon], { animate: true })

    // マーカー更新
    if (markerRef.current) {
      mapRef.current.removeLayer(markerRef.current)
      markerRef.current = null
    }
    const color = target.confirmed ? '#059669' : '#dc2626'
    markerRef.current = L.marker([target.lat, target.lon], {
      icon: L.divIcon({
        html: `<div style="width:14px;height:14px;background:${color};border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      })
    }).addTo(mapRef.current)
    // #38: 安全なテキストツールチップ（textContentでHTML解釈しない）
    const safeLabel = document.createElement('span')
    safeLabel.textContent = target.label ?? ''
    markerRef.current.bindTooltip(safeLabel, { direction: 'top', offset: [0, -8] })
  }, [previewCandidate, activeRow?.confirmed, activeRow?.matched?.lat, activeRow?.matched?.lon, matchResults])

  return <div ref={mapContainerRef} className="w-full h-full" />
}
