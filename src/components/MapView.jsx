import React, { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useApp } from '../context/AppContext'
import { setMapInstance } from '../hooks/useMapRef'
import MapToolbar from './MapToolbar'
import { OSM_RASTER_STYLE } from '../utils/mapStyle'
import { wheelchairBadge } from '../utils/accessibility'
import { buildOsmElementUrl, buildIdElementUrl } from '../utils/editLinks'

// Default center: Osaka, Japan（MapLibreは[経度, 緯度]順）
const DEFAULT_CENTER = [135.5023, 34.6937]
const DEFAULT_ZOOM = 13

// 結果マーカー用のGeoJSONソース・レイヤID
const RESULTS_SOURCE = 'results'
const POINT_LAYER = 'point-circle'
const CLUSTERS_LAYER = 'clusters'
const CLUSTER_COUNT_LAYER = 'cluster-count'

// (Task 1) 既存の「500件上限」をネイティブクラスタリングに置き換え。
// superclusterベースのクラスタは全件を扱えるため上限・警告バナーは不要。
const CLUSTER_RADIUS = 45
const CLUSTER_MAX_ZOOM = 13

const POINT_LAYER_DEF = {
  id: POINT_LAYER,
  type: 'circle',
  source: RESULTS_SOURCE,
  filter: ['!', ['has', 'point_count']],
  circleRadius: 6,
  circleColor: '#2563eb',
  circleStrokeWidth: 2,
  circleStrokeColor: '#ffffff'
}

const CLUSTERS_LAYER_DEF = {
  id: CLUSTERS_LAYER,
  type: 'circle',
  source: RESULTS_SOURCE,
  filter: ['has', 'point_count'],
  circleRadius: ['step', ['get', 'point_count'], 12, 4, 16, 16, 20, 24, 32],
  circleColor: '#f59e0b',
  circleStrokeWidth: 2,
  circleStrokeColor: '#ffffff'
}

const CLUSTER_COUNT_LAYER_DEF = {
  id: CLUSTER_COUNT_LAYER,
  type: 'symbol',
  source: RESULTS_SOURCE,
  filter: ['has', 'point_count'],
  textField: ['get', 'point_count'],
  textFont: ['Noto Sans Regular'],
  textSize: 12,
  textColor: '#ffffff',
  layout: { textAnchor: 'center' }
}

/**
 * 結果マーカーのポップアップ内容をDOMノードで構築する（#38）。
 * setHTMLにタグ由来文字列を渡さず、全テキストはtextContentで設定する。
 * リンク（OSM/iD）はURL生成関数から生成する安全な<a>要素のみ。
 */
function buildPopupElement(result) {
  const root = document.createElement('div')
  root.className = 'map-popup-root'

  const nameEl = document.createElement('div')
  nameEl.className = 'map-popup-name'
  nameEl.textContent = result.name || '（名前のない要素）'
  root.appendChild(nameEl)

  const metaEl = document.createElement('div')
  metaEl.className = 'map-popup-meta'
  metaEl.textContent = `${result.type} / ID: ${result.id}`
  root.appendChild(metaEl)

  const wc = wheelchairBadge(result.tags)
  if (wc) {
    const wcEl = document.createElement('div')
    wcEl.className = 'map-popup-wc'
    wcEl.textContent = wc.text.startsWith('♿') ? wc.text : `♿ ${wc.text}`
    root.appendChild(wcEl)
  }

  const linkRow = document.createElement('div')
  linkRow.className = 'map-popup-links'
  const osmLink = document.createElement('a')
  osmLink.href = buildOsmElementUrl(result)
  osmLink.target = '_blank'
  osmLink.rel = 'noopener'
  osmLink.className = 'map-popup-link'
  osmLink.textContent = '🔗 OSMで開く'
  const idLink = document.createElement('a')
  idLink.href = buildIdElementUrl(result)
  idLink.target = '_blank'
  idLink.rel = 'noopener'
  idLink.className = 'map-popup-link'
  idLink.textContent = '✏️ iDで編集'
  linkRow.append(osmLink, idLink)
  root.appendChild(linkRow)

  // 主要タグ（name系・wheelchairを除く）を最大3件
  const keyTags = Object.entries(result.tags || {})
    .filter(([k]) => k !== 'name' && k !== 'name:ja' && k !== 'wheelchair')
    .slice(0, 3)
  for (const [k, v] of keyTags) {
    const tagEl = document.createElement('div')
    tagEl.className = 'map-popup-tag'
    tagEl.textContent = `${k}: ${v}`
    root.appendChild(tagEl)
  }

  return root
}

/**
 * 検索結果をクラスタリング用GeoJSONに変換する
 */
function resultsToGeoJSON(results) {
  return {
    type: 'FeatureCollection',
    features: (Array.isArray(results) ? results : [])
      .filter((r) => r.lat != null && r.lon != null)
      .map((r) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
        properties: {
          type: r.type,
          id: r.id,
          key: `${r.type}/${r.id}`,
          name: r.name || null
        }
      }))
  }
}

/**
 * 地図コンポーネント（MapLibre GL版）
 *
 * 設計方針 (#29 + #41 + Task 2):
 * - state.bbox は「前回検索に使用したBBOX」であり、地図のpan/zoomでは更新されない
 * - (#41) 検索範囲は「検索する」押下時点の地図表示範囲（getBounds）で決定される
 * - (Task 2) 検索実行後、カメラ位置・ズームを変更しない（fitBoundsしない）。
 *   カメラfitはURL復元由来のbbox（bboxSource==='url'）の初回適用時のみ。
 * - (Task 2) 選択矩形（BBOXオーバーレイ）は地図上に描画しない。
 * - マーカーはネイティブクラスタリング（MapLibreのcluster、supercluster不要）で表示
 * - (#38) ポップアップはtextContentベースのDOMノードのみ（setHTML禁止）
 * - (#60) コンテナサイズ変化でmap.resize()（hidden→表示復帰時のタイル再描画）
 */
function MapView({ onMarkerClick = null }) {
  const containerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const loadedRef = useRef(false)
  const popupRef = useRef(null)
  const highlightMarkerRef = useRef(null)
  // (#41-1 / Task 2) URL復元bboxの初回fitフラグ（一度きり）
  const hasFitInitialBboxRef = useRef(false)
  // (#60) アクティブ結果のハイライトマーカー
  const { state } = useApp()
  const { results, activeResultId } = state

  // (#47) 最新のstateを常に読むためのref（イベントハンドラで旧stateを防ぐ）
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state })
  const onMarkerClickRef = useRef(onMarkerClick)
  useEffect(() => { onMarkerClickRef.current = onMarkerClick })

  // results/activeResultId の最新値（loadイベント内で使用する）
  const resultsRef = useRef(results)
  useEffect(() => { resultsRef.current = results })
  const activeResultIdRef = useRef(activeResultId)
  useEffect(() => { activeResultIdRef.current = activeResultId })

  const syncResults = () => {
    const map = mapInstanceRef.current
    if (!map || !loadedRef.current) return false
    // 注: maplibre-glのMapにはMap.setGeoJSON()がない（mapbox-gl由来のAPI）。
    // 正しいAPIは getSource(id).setData(geojson) である。
    const source = map.getSource(RESULTS_SOURCE)
    if (!source) return false
    source.setData(resultsToGeoJSON(resultsRef.current))
    return true
  }

  // (#60) アクティブ結果のハイライトマーカー管理
  const syncHighlight = () => {
    const map = mapInstanceRef.current
    if (!map || !loadedRef.current) return

    const activeId = activeResultIdRef.current
    const active = activeId
      ? resultsRef.current.find((r) => `${r.type}/${r.id}` === activeId)
      : null
    const valid = active && active.lat != null && active.lon != null

    if (!valid) {
      if (highlightMarkerRef.current) {
        highlightMarkerRef.current.remove()
        highlightMarkerRef.current = null
      }
      return
    }

    const lngLat = [active.lon, active.lat]
    if (!highlightMarkerRef.current) {
      const el = document.createElement('div')
      el.className = 'map-highlight-marker'
      const marker = new maplibregl.Marker({ element: el }).setLngLat(lngLat)
      // (#38) 名称はsetText（プレーンテキスト）
      marker.setPopup(new maplibregl.Popup({ offset: 14 }).setText(active.name || '選択中の施設'))
      marker.addTo(map)
      highlightMarkerRef.current = marker
    } else {
      highlightMarkerRef.current.setLngLat(lngLat)
    }
  }

  // クリック・カーソルハンドラ（load後にレイヤが存在的になってから有効）
  const setupInteractions = (map) => {
    const closePopup = () => {
      if (popupRef.current) {
        popupRef.current.remove()
        popupRef.current = null
      }
    }

    map.on('click', POINT_LAYER, (e) => {
      const key = e.features?.[0]?.properties?.key
      if (!key) return
      const result = stateRef.current.results.find((r) => `${r.type}/${r.id}` === key)
      if (!result) return

      // (#59) モバイル: マーカータップで施設詳細ボトムシートを開く（ポップアップ非表示）
      if (onMarkerClickRef.current) {
        closePopup()
        onMarkerClickRef.current(result)
        return
      }

      closePopup()
      // (#38) ポップアップ内容はDOMノード（textContent）のみ
      const popup = new maplibregl.Popup({ offset: 10, closeButton: true })
        .setLngLat(e.lngLat)
        .setDOMElement(buildPopupElement(result))
      popup.addTo(map)
      popupRef.current = popup
    })

    // クラスタクリック → メンバー範囲へ拡大（ユーザー操作によるfitは許可）
    map.on('click', CLUSTERS_LAYER, (e) => {
      const clusterId = e.features?.[0]?.properties?.cluster_id
      if (clusterId == null) return
      const features = map.querySourceFeatures(RESULTS_SOURCE, {
        cluster: clusterId,
        clusterProperties: { expandToSingle: true }
      }) || []
      if (features.length === 0) return
      let west = 180, south = 90, east = -180, north = -90
      for (const f of features) {
        const [x, y] = f.geometry.coordinates
        if (x < west) west = x
        if (x > east) east = x
        if (y < south) south = y
        if (y > north) north = y
      }
      map.fitBounds([[west, south], [east, north]], { padding: 40, maxZoom: 17, duration: 800 })
    })

    // ポインタカーソル
    for (const layerId of [POINT_LAYER, CLUSTERS_LAYER]) {
      map.on('mouseenter', layerId, () => {
        const canvas = map.getCanvas?.()
        if (canvas) canvas.style.cursor = 'pointer'
      })
      map.on('mouseleave', layerId, () => {
        const canvas = map.getCanvas?.()
        if (canvas) canvas.style.cursor = ''
      })
    }
  }

  const setupResultLayers = (map) => {
    if (map.getSource(RESULTS_SOURCE)) return
    map.addSource(RESULTS_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      cluster: true,
      clusterRadius: CLUSTER_RADIUS,
      clusterMaxZoom: CLUSTER_MAX_ZOOM
    })
    map.addLayer(POINT_LAYER_DEF)
    map.addLayer(CLUSTERS_LAYER_DEF)
    map.addLayer(CLUSTER_COUNT_LAYER_DEF)
    setupInteractions(map)
  }

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapInstanceRef.current) return

    // URL復元bbox（bboxSource='url'）があれば中心・ズームをそれに合わせる。
    // (Task 2) 検索由来のbboxでは初期カメラをBBOXに依存させない。
    const s0 = stateRef.current
    const initialBbox = (s0.bbox && s0.bboxSource === 'url') ? s0.bbox : null
    const center = initialBbox
      ? [(initialBbox.west + initialBbox.east) / 2, (initialBbox.south + initialBbox.north) / 2]
      : DEFAULT_CENTER
    const zoom = initialBbox ? 12 : DEFAULT_ZOOM

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_RASTER_STYLE,
      center,
      zoom
    })
    // Leaflet版は左上のズームコントロール。MapLibre標準は右上のため
    // 地名検索ツールバー（右上）と重ならないよう左上に配置。
    map.addControl(new maplibregl.NavigationControl(), 'top-left')

    mapInstanceRef.current = map
    setMapInstance(map)
    hasFitInitialBboxRef.current = false

    map.on('load', () => {
      loadedRef.current = true

      setupResultLayers(map)

      // (#41-1 / Task 2) URL復元由来のBBOXの場合のみ一度だけfit。
      // 検索由来（bboxSource==='search'）のbboxではカメラを変更しない。
      const s = stateRef.current
      if (s.bbox && s.bboxSource === 'url' && !hasFitInitialBboxRef.current) {
        map.fitBounds(
          [[s.bbox.west, s.bbox.south], [s.bbox.east, s.bbox.north]],
          { padding: 20 }
        )
        hasFitInitialBboxRef.current = true
      }

      syncResults()
      syncHighlight()
    })

    // (#41-3/#60) コンテナのsize変化（タブのhidden↔表示切替など）でresize()。
    // display:none→表示復帰時、sizeが0だったコンテナにタイル再描画が走らず
    // 古いタイルのままであるのを防ぐ。
    let roTimer = null
    const ro = new ResizeObserver(() => {
      if (roTimer) clearTimeout(roTimer)
      roTimer = setTimeout(() => {
        const el = containerRef.current
        if (!el || !mapInstanceRef.current) return
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) {
          mapInstanceRef.current.resize()
        }
      }, 100)
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      if (roTimer) clearTimeout(roTimer)
      if (highlightMarkerRef.current) {
        highlightMarkerRef.current.remove()
        highlightMarkerRef.current = null
      }
      if (popupRef.current) {
        popupRef.current.remove()
        popupRef.current = null
      }
      map.remove()
      mapInstanceRef.current = null
      loadedRef.current = false
      setMapInstance(null)
    }
  }, [])

  // ウィンドウリサイズで地図サイズを再調整
  useEffect(() => {
    let timer = null
    const onResize = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        if (mapInstanceRef.current && typeof mapInstanceRef.current.resize === 'function') {
          mapInstanceRef.current.resize()
        }
      }, 100)
    }
    window.addEventListener('resize', onResize)
    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // 結果マーカー更新（クラスタリングGeoJSON）
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !loadedRef.current) return
    // 旧ポップアップは閉じる（参照していた要素が更新されるため）
    if (popupRef.current) {
      popupRef.current.remove()
      popupRef.current = null
    }
    // (Task 11) maplibre-glにはMap.setGeoJSON()が存在しない（mapbox-glのAPI）ため、
    // 検索結果の反映は getSource().setData() で行う。
    const source = map.getSource(RESULTS_SOURCE)
    if (!source) return
    source.setData(resultsToGeoJSON(results))
  }, [results])

  // Highlight active result — panToで移動（BBOX・ズームは変更しない）
  // 解除（activeResultId=null）時にもsyncHighlight()を実行し、
  // 既存のハイライトマーカーを削除する
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !loadedRef.current) return
    if (activeResultId) {
      const result = results.find((r) => `${r.type}/${r.id}` === activeResultId)
      if (result && result.lat != null && result.lon != null) {
        map.panTo([result.lon, result.lat], { duration: 500 })
      }
    }
    syncHighlight()
  }, [activeResultId, results])

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="w-full h-full" />
      <MapToolbar mapRef={mapInstanceRef} />
    </div>
  )
}

export default MapView
