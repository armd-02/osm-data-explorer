import React, { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { OSM_RASTER_STYLE } from '../../utils/mapStyle'

/**
 * 施設詳細用の小型ロケーションマップ（#62）。
 *
 * - 渡された座標を中心にし、デフォルスマーカー（ピン）を表示する。
 *   デフォルスマーカーは maplibre-gl がインラインSVGで生成するため、
 *   外部アセット/CDNへの依存がない。
 * - 非インタラクティブ（pointer-events: none）。ボトムシート内の表示用マップ
 *   であるため、シートのスクロール操作とタッチ操作が競合しないようにする。
 * - メインマップと同一のOSMラスタスタイル（OSM_RASTER_STYLE、OSMFJタイル）を
 *   使う。コンパクト版 AttributionControl で © OpenStreetMap 表示
 *   （タイル利用規約上必須）。
 * - アンマウントまたは座標変更時に map を破棄する。
 */
export default function MiniLocationMap({ lng, lat, height = 200, zoom = 15, className = '' }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined

    const map = new maplibregl.Map({
      container: el,
      style: OSM_RASTER_STYLE,
      center: [lng, lat],
      zoom,
      attributionControl: false, // 既定の（広い）attrib bar の代わりに compact 版を明示追加
    })
    map.addControl(new maplibregl.AttributionControl({ compact: true }))
    new maplibregl.Marker().setLngLat([lng, lat]).addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [lng, lat, zoom])

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`位置マップ（緯度 ${lat}、経度 ${lng}）`}
      className={`pointer-events-none overflow-hidden rounded-lg border border-slate-200 ${className}`}
      style={{ height }}
    />
  )
}
