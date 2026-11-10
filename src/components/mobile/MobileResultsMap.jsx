import React, { useCallback, useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useApp } from '../../context/AppContext'
import { OSM_RASTER_STYLE } from '../../utils/mapStyle'
import {
  POINT_LAYER_DEF,
  BF_LINE_LAYER_DEF,
  BF_NODE_LAYER_DEF,
  resultsToGeoJSON
} from '../MapView'
import { barrierFreeToMapGeoJSON } from '../../utils/barrierFreeGeoJSON'

/**
 * (修正) モバイル「一覧」タブ上部の結果マップ。
 *
 * 検索成功後、モバイルは自動で一覧タブへ切り替わるため、検索タブの地図に
 * 戻らなくても検索結果の位置を確認できるようにする。バリアフリー検索でも
 * 自治体モード検索でも、一覧タブに結果マップが表示される。
 *
 * 特性:
 * - 自前の MapLibre マップを生成する（グローバルなマップレジストリ
 *   setMapInstance/getMapInstance には登録しない）。検索タブの地図と
 *   干渉しない。
 * - 操作不能（interactive: false + pointer-events: none）。一覧タブは
 *   縦スクロール領域の中に埋め込むため、タッチ操作を地図に取られない。
 *   操作したい場合は「地図で見る」で検索タブへ戻る。
 * - kind='poi'      → 結果を点として表示（MapView と同じ青い点レイヤ）
 *   kind='barrier_free' → 歩道を線・縁石/案内信号を点として表示
 *   （MapView と同じレイヤ定義・色を使うため、見た目が一致する）
 * - 結果の範囲（extent）に fitBounds でカメラを合わせる。範囲が算出できない
 *   場合は前回の検索 bbox に合わせる。
 * - kind は props で固定し、kind 変化時は親側がコンポーネントを
 *   再生成（remount）させることで、ソース/レイヤの入れ替えロジックを
 *   単純化する。
 */

const POI_SOURCE_ID = 'results'
const BF_SOURCE_ID = 'barrier-free'
// MapView と同一のソースID（'results' / 'barrier-free'）を使い、
// レイヤ定義（MapView 由来）をそのまま再利用する

// 初期ソースの空データ（MapView の EMPTY_FC と同じ形状）
const EMPTY_FC = { type: 'FeatureCollection', features: [] }
// 初期カメラのデフォルト（MapView と同じ: 大阪・デフォルトズーム）
const DEFAULT_CENTER = [135.5023, 34.6937]
const DEFAULT_ZOOM = 12

// fitBounds の共通オプション（コンパクトな地図のため padding 24px・
// maxZoom 16。duration 0 は再検索時のカメラ遷移を即時にするため）
const FIT_OPTIONS = { padding: 24, maxZoom: 16, duration: 0 }

/**
 * GeoJSON FeatureCollection の範囲（BBOX）を算出する。
 * 使用可能な座標が1つもなければ null。
 * 単一点のみだった場合は fitBounds がズームを算出できるよう
 * ごく狭い範囲に拡張する。
 */
function extentOfGeoJSON(fc) {
  let west = 180
  let south = 90
  let east = -180
  let north = -90
  let found = false

  const consider = (coord) => {
    const lon = coord && coord[0]
    const lat = coord && coord[1]
    if (typeof lon !== 'number' || typeof lat !== 'number') return
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return
    if (lon < west) west = lon
    if (lon > east) east = lon
    if (lat < south) south = lat
    if (lat > north) north = lat
    found = true
  }

  for (const f of (fc && fc.features) || []) {
    const g = f && f.geometry
    if (!g) continue
    if (g.type === 'Point') consider(g.coordinates)
    else if (g.type === 'LineString') for (const c of g.coordinates) consider(c)
    else if (g.type === 'Polygon') for (const c of (g.coordinates && g.coordinates[0]) || []) consider(c)
  }

  if (!found) return null
  if (west === east && south === north) {
    const d = 0.0005
    west -= d
    east += d
    south -= d
    north += d
  }
  return { west, south, east, north }
}

export default function MobileResultsMap({ kind = 'poi', height = 200 }) {
  const { state } = useApp()
  const results = state.results || []
  const bbox = state.bbox
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const loadedRef = useRef(false)
  // 'load' が非同期で遅れて発火しても、その時点の最新結果を使うよう保持
  const latestRef = useRef({ results, bbox })

  useEffect(() => {
    latestRef.current = { results, bbox }
  }, [results, bbox])

  // 最新の結果をソースに反映し、結果範囲にカメラを合わせる
  const applyData = useCallback(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    const { results: rs, bbox: bb } = latestRef.current
    const fc = kind === 'barrier_free' ? barrierFreeToMapGeoJSON(rs) : resultsToGeoJSON(rs)
    const sourceId = kind === 'barrier_free' ? BF_SOURCE_ID : POI_SOURCE_ID
    const source = map.getSource(sourceId)
    if (source) source.setData(fc)

    const ext = extentOfGeoJSON(fc)
    if (ext) {
      map.fitBounds([[ext.west, ext.south], [ext.east, ext.north]], FIT_OPTIONS)
    } else if (bb) {
      map.fitBounds([[bb.west, bb.south], [bb.east, bb.north]], FIT_OPTIONS)
    }
  }, [kind])

  // マップ生成（kind 変化時は remount されるため、ここでは kind ごとに
  // 必要なソース/レイヤだけを作る）
  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined

    const map = new maplibregl.Map({
      container: el,
      style: OSM_RASTER_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      interactive: false,
      attributionControl: false
    })
    // タイル規約の表示義務を満足するため compact 表記制御を付ける
    map.addControl(new maplibregl.AttributionControl({ compact: true }))
    mapRef.current = map
    loadedRef.current = false

    map.on('load', () => {
      loadedRef.current = true
      if (kind === 'barrier_free') {
        map.addSource(BF_SOURCE_ID, { type: 'geojson', data: EMPTY_FC })
        map.addLayer(BF_LINE_LAYER_DEF)
        map.addLayer(BF_NODE_LAYER_DEF)
      } else {
        map.addSource(POI_SOURCE_ID, { type: 'geojson', data: EMPTY_FC })
        map.addLayer(POINT_LAYER_DEF)
      }
      applyData()
    })

    return () => {
      map.remove()
      mapRef.current = null
      loadedRef.current = false
    }
    // kind は props 固定（親が kind 変化時に remount させる）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])

  // 結果変化（再検索など）時はソース更新 + 範囲に再配置
  useEffect(() => {
    applyData()
  }, [results, bbox, applyData])

  const label = kind === 'barrier_free' ? 'バリアフリー要素マップ' : '検索結果マップ'
  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={label}
      className="pointer-events-none overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
      style={{ height }}
    />
  )
}
