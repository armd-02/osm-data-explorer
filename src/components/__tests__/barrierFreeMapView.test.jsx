// @vitest-environment jsdom
/**
 * (#62) バリアフリー検索 — 第4ピース: 地図上の線・点描画と凡例のテスト
 *
 * - バリアフリー検索（resultKind='barrier_free'）の結果は専用の
 *   'barrier-free' ソース（cluster無効）+ bf-line（way）/ bf-node（node）
 *   レイヤで描画される。way は頂点平均の近似中心点ではなく正確な形状
 *   （bf.geometry）で線描画される。
 * - バリアフリー表示中は既存のクラスタリングソース（'results'）のデータは空。
 * - POI検索へ切り返すと bf ソース・レイヤは削除され、'results' に復元される。
 * - bf-node のクリックは POI の点レイヤと同様にポップアップ（PC）/
 *   ボトムシート（モバイル: onMarkerClick）を出す。
 * - 凡例（BarrierFreeLegend）は MapView 内では描画しない（地図上のオーバーレイ廃止）。
 *   表示は親レイアウト（Appの地図ブロック・モバイル検索タブ）が地図本体の下の
 *   通常のフローで行い、表示条件（resultKind + 結果数）は BarrierFreeLegend 自身で
 *   判定する（BarrierFreeLegend.test.jsx / barrierFreeLegendPlacement.test.jsx 参照）。
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import MapView, { BF_LINE_LAYER_DEF, BF_NODE_LAYER_DEF } from '../MapView'
import { AppContext } from '../../context/AppContext'

const mockState = vi.hoisted(() => ({ api: null }))
vi.mock('maplibre-gl', async () => {
  const mod = await import('../../test/maplibreMock')
  mockState.api = mod.createMapLibreMock({ autoLoad: false })
  return { default: mockState.api }
})

class MockResizeObserver { observe() {} unobserve() {} disconnect() {} }

beforeEach(() => {
  global.ResizeObserver = global.ResizeObserver || MockResizeObserver
  if (mockState.api) mockState.api.resetState()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// toStandardResults（barrierFreeResults.js）の出力形状を模したバリアフリー結果
const BF_RESULTS = [
  {
    id: 1, type: 'way',
    tags: { highway: 'footway', tactile_paving: 'yes' },
    lat: 34.6705, lon: 135.4805, name: null, osmId: 'way/1',
    bf: { kind: 'way', tactile: 'yes', lengthM: 120, kerb: null, hasSound: false, hasVibration: false,
      geometry: [[135.48, 34.67], [135.481, 34.6705], [135.482, 34.671]] }
  },
  {
    id: 2, type: 'way',
    tags: { highway: 'path', tactile_paving: 'no' },
    lat: 34.672, lon: 135.483, name: null, osmId: 'way/2',
    bf: { kind: 'way', tactile: 'no', lengthM: 80, kerb: null, hasSound: false, hasVibration: false,
      geometry: [[135.4825, 34.6718], [135.4835, 34.6722]] }
  },
  {
    id: 3, type: 'node',
    tags: { 'traffic_signals:sound': 'yes', 'traffic_signals:vibration': 'yes' },
    lat: 34.672, lon: 135.484, name: null, osmId: 'node/3',
    bf: { kind: 'node', tactile: null, lengthM: null, kerb: null, hasSound: true, hasVibration: true,
      geometry: [135.484, 34.672] }
  },
  {
    id: 4, type: 'node',
    tags: { barrier: 'kerb', kerb: 'cut' },
    lat: 34.673, lon: 135.485, name: null, osmId: 'node/4',
    bf: { kind: 'node', tactile: null, lengthM: null, kerb: 'cut', hasSound: false, hasVibration: false,
      geometry: [135.485, 34.673] }
  },
  {
    // kerb と音声/振動の両方を持つノード（role: 'kerb+signal'）
    id: 5, type: 'node',
    tags: { barrier: 'kerb', kerb: 'low', 'traffic_signals:sound': 'yes' },
    lat: 34.674, lon: 135.486, name: null, osmId: 'node/5',
    bf: { kind: 'node', tactile: null, lengthM: null, kerb: 'low', hasSound: true, hasVibration: false,
      geometry: [135.486, 34.674] }
  }
]

const POI_RESULTS = [
  { type: 'node', id: 9001, lat: 34.68, lon: 135.48, name: '喫茶店', tags: { name: '喫茶店', amenity: 'cafe' } }
]

function renderMap(state = {}, props = {}) {
  const fullState = {
    results: [], resultKind: null, bbox: null, bboxSource: null, activeResultId: null,
    status: 'idle',
    ...state
  }
  const view = render(
    <AppContext.Provider value={{ state: fullState, dispatch: vi.fn() }}>
      <MapView {...props} />
    </AppContext.Provider>
  )
  return { view, state: fullState }
}

const rerender = (view, state) => act(() => {
  view.rerender(
    <AppContext.Provider value={{ state, dispatch: vi.fn() }}>
      <MapView />
    </AppContext.Provider>
  )
})

const getMap = () => mockState.api._state.maps.at(-1)
const fireLoad = () => act(() => { getMap().fire('load') })
const layerIds = (map) => map._layers.map((l) => l.id)
const sourceIds = (map) => [...map._sources.keys()]

describe('バリアフリー結果の線・点描画', () => {
  it('bf ソース（cluster無効）+ bf-line/bf-node レイヤを追加し、線と点のGeoJSONを setData する', () => {
    renderMap({ results: BF_RESULTS, resultKind: 'barrier_free' })
    fireLoad()
    const map = getMap()

    // 専用ソースはクラスタリング無効（cluster プロパティなし）
    const src = map._sources.get('barrier-free')
    expect(src).toBeTruthy()
    expect(src.type).toBe('geojson')
    expect(src.cluster).toBeUndefined()

    // レイヤは既存3件+bf2件
    expect(layerIds(map)).toEqual(['point-circle', 'clusters', 'cluster-count', 'bf-line', 'bf-node'])

    // 最終 setData は bf ソース（先にresultsクリア→後にbf設定の順序）
    const { id, data } = map._lastGeoJSON
    expect(id).toBe('barrier-free')
    expect(data.features).toHaveLength(5)

    const lines = data.features.filter((f) => f.geometry.type === 'LineString')
    const points = data.features.filter((f) => f.geometry.type === 'Point')
    expect(lines).toHaveLength(2)
    expect(points).toHaveLength(3)

    // way は bf.geometry の正確な形状（頂点平均の中心点ではない）
    expect(lines[0].geometry.coordinates).toEqual([[135.48, 34.67], [135.481, 34.6705], [135.482, 34.671]])
    expect(lines[0].properties).toEqual({ key: 'way/1', kind: 'way', name: null, tactile: 'yes' })
    expect(lines[1].properties.tactile).toBe('no')

    // node は Point + 役割（role）
    expect(points.map((f) => f.properties.key)).toEqual(['node/3', 'node/4', 'node/5'])
    expect(points.map((f) => f.properties.role)).toEqual(['signal', 'kerb', 'kerb+signal'])
  })

  it('検索結果が更新されると bf ソースのデータも再 setData される', () => {
    const { view, state } = renderMap({ results: BF_RESULTS, resultKind: 'barrier_free' })
    fireLoad()
    const map = getMap()

    const nextResults = [BF_RESULTS[0]]
    rerender(view, { ...state, results: nextResults })
    expect(map._lastGeoJSON.id).toBe('barrier-free')
    expect(map._lastGeoJSON.data.features).toHaveLength(1)
    expect(map._lastGeoJSON.data.features[0].properties.key).toBe('way/1')
  })
})

describe('resultsToGeoJSON は bf 付き項目を除外する（青い点レイヤ）', () => {
  it('bf 付き項目（歩道ウェイの近似中心点など）は results ソースに入らない', () => {
    // POI結果とbf結果が混在する場合でも、bf項目は青い点として描画されない
    renderMap({ results: [...POI_RESULTS, BF_RESULTS[0]], resultKind: 'poi' })
    fireLoad()
    const map = getMap()
    const { data } = map._lastGeoJSON
    expect(data.features).toHaveLength(1)
    expect(data.features[0].properties.key).toBe('node/9001')
    expect(data.features.some((f) => f.properties.key === 'way/1')).toBe(false)
  })

  it('bf のみで構成された結果は results ソースが空になる', () => {
    renderMap({ results: BF_RESULTS, resultKind: 'poi' })
    fireLoad()
    const map = getMap()
    expect(map._lastGeoJSON.data.features).toHaveLength(0)
  })
})

describe('POI ⇄ バリアフリー のソース切り替え', () => {
  it('bf → POI 切替で bf ソース・レイヤを削除し、results ソースにPOIデータを設定する', () => {
    const { view, state } = renderMap({ results: BF_RESULTS, resultKind: 'barrier_free' })
    fireLoad()
    const map = getMap()
    expect(map.getSource('barrier-free')).toBeTruthy()

    rerender(view, { ...state, results: POI_RESULTS, resultKind: 'poi' })

    // bf ソース・レイヤは削除
    expect(map.getSource('barrier-free')).toBeNull()
    expect(layerIds(map)).toEqual(['point-circle', 'clusters', 'cluster-count'])
    // results ソースにPOIデータが設定される（最終 setData）
    expect(map._lastGeoJSON.id).toBe('results')
    expect(map._lastGeoJSON.data.features).toHaveLength(1)
    expect(map._lastGeoJSON.data.features[0].properties.key).toBe('node/9001')
  })

  it('POI → bf 切替で bf ソース・レイヤを追加し、results ソースを空にする', () => {
    const { view, state } = renderMap({ results: POI_RESULTS, resultKind: 'poi' })
    fireLoad()
    const map = getMap()
    expect(map.getSource('barrier-free')).toBeNull()

    rerender(view, { ...state, results: BF_RESULTS, resultKind: 'barrier_free' })

    expect(map.getSource('barrier-free')).toBeTruthy()
    expect(layerIds(map)).toContain('bf-line')
    expect(layerIds(map)).toContain('bf-node')
    // 最終 setData は bf ソース（results は先に空クリア済み）
    expect(map._lastGeoJSON.id).toBe('barrier-free')
    expect(map._lastGeoJSON.data.features).toHaveLength(5)
  })
})

describe('バリアフリー線・点のクリック（ポップアップ）', () => {
  it('PC: bf-node クリックで barrierFreeLabel と OSMリンクのポップアップを表示する', () => {
    renderMap({ results: BF_RESULTS, resultKind: 'barrier_free' })
    fireLoad()
    const map = getMap()

    // node/3: 音声+振動 → 「音・振動案内信号」
    const feature = map._lastGeoJSON.data.features.find((f) => f.properties.key === 'node/3')
    act(() => {
      map.fire('click', 'bf-node', { features: [feature], lngLat: { lat: 34.672, lng: 135.484 } })
    })

    const popup = mockState.api._state.popups.at(-1)
    expect(popup).toBeTruthy()
    // setDOMElementでDOMノード（setHTML未使用）
    expect(popup._element).toBeInstanceOf(HTMLElement)
    expect(popup._text).toBeNull()
    expect(popup._element.querySelector('.map-popup-name').textContent).toBe('音・振動案内信号')
    const osmLink = popup._element.querySelector('a[href="https://www.openstreetmap.org/node/3"]')
    expect(osmLink).toBeTruthy()
  })

  it('PC: bf-line（way）クリックでも同様にポップアップを表示する', () => {
    renderMap({ results: BF_RESULTS, resultKind: 'barrier_free' })
    fireLoad()
    const map = getMap()

    // way/1: footway + tactile yes → 「歩道（点字ブロックあり）」
    const feature = map._lastGeoJSON.data.features.find((f) => f.properties.key === 'way/1')
    act(() => {
      map.fire('click', 'bf-line', { features: [feature], lngLat: { lat: 34.6705, lng: 135.481 } })
    })

    const popup = mockState.api._state.popups.at(-1)
    expect(popup).toBeTruthy()
    expect(popup._element).toBeInstanceOf(HTMLElement)
    expect(popup._element.querySelector('.map-popup-name').textContent).toBe('歩道（点字ブロックあり）')
    const osmLink = popup._element.querySelector('a[href="https://www.openstreetmap.org/way/1"]')
    expect(osmLink).toBeTruthy()
  })

  it('PC: 縁石ノード（kerb値付き）のラベルは「縁石（…）」になる', () => {
    renderMap({ results: BF_RESULTS, resultKind: 'barrier_free' })
    fireLoad()
    const map = getMap()

    // node/4: barrier=kerb, kerb=cut → 「縁石（段差下がり）」
    const feature = map._lastGeoJSON.data.features.find((f) => f.properties.key === 'node/4')
    act(() => {
      map.fire('click', 'bf-node', { features: [feature], lngLat: { lat: 34.673, lng: 135.485 } })
    })

    const popup = mockState.api._state.popups.at(-1)
    expect(popup._element.querySelector('.map-popup-name').textContent).toBe('縁石（段差下がり）')
  })

  it('モバイル: onMarkerClick があれば bf-node タップでコールバックし、ポップアップを作らない', () => {
    const onMarkerClick = vi.fn()
    renderMap({ results: BF_RESULTS, resultKind: 'barrier_free' }, { onMarkerClick })
    fireLoad()
    const map = getMap()
    const popupsBefore = mockState.api._state.popups.length

    const feature = map._lastGeoJSON.data.features.find((f) => f.properties.key === 'node/4')
    act(() => {
      map.fire('click', 'bf-node', { features: [feature], lngLat: { lat: 34.673, lng: 135.485 } })
    })

    expect(onMarkerClick).toHaveBeenCalledTimes(1)
    expect(onMarkerClick.mock.calls[0][0].id).toBe(4)
    expect(mockState.api._state.popups.length).toBe(popupsBefore)
  })
})

describe('凡例の位置（地図上のオーバーレイ廃止）', () => {
  it('MapView は凡例を描画しない（凡例は地図本体の下へ移動）', () => {
    const { view } = renderMap({ results: BF_RESULTS, resultKind: 'barrier_free' })
    fireLoad()
    expect(view.queryByText('凡例')).toBeNull()
  })
})

describe('bf レイヤ定義（MapLibre仕様）', () => {
  it('bf-line は line レイヤで tactile による match 色分け（kebab-case / paint nesting）', () => {
    expect(BF_LINE_LAYER_DEF).toMatchObject({
      id: 'bf-line', type: 'line', source: 'barrier-free',
      filter: ['==', ['get', 'kind'], 'way']
    })
    expect(BF_LINE_LAYER_DEF.paint['line-color']).toEqual([
      'match', ['get', 'tactile'], 'yes', '#eab308', 'no', '#dc2626', '#f87171'
    ])
    expect(BF_LINE_LAYER_DEF.paint['line-width']).toBe(4)
    // トップレベルにcamelCaseプロパティが無い
    const camelKeys = Object.keys(BF_LINE_LAYER_DEF).filter((k) => /^[a-z]+[A-Z]/.test(k))
    expect(camelKeys).toEqual([])
  })

  it('bf-node は circle レイヤで role による match 色分け（縁石=オレンジ/音声=紫/両方=ティール）', () => {
    expect(BF_NODE_LAYER_DEF).toMatchObject({
      id: 'bf-node', type: 'circle', source: 'barrier-free',
      filter: ['==', ['get', 'kind'], 'node']
    })
    expect(BF_NODE_LAYER_DEF.paint['circle-color']).toEqual([
      'match', ['get', 'role'],
      'signal', '#7c3aed',
      'kerb', '#f59e0b',
      'kerb+signal', '#0d9488',
      '#64748b'
    ])
    expect(BF_NODE_LAYER_DEF.paint['circle-radius']).toBe(6)
    const camelKeys = Object.keys(BF_NODE_LAYER_DEF).filter((k) => /^[a-z]+[A-Z]/.test(k))
    expect(camelKeys).toEqual([])
  })
})
