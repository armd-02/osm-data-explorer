// @vitest-environment jsdom
/**
 * (修正) MobileResultsMap: モバイル「一覧」タブ上部の結果マップ。
 *
 * - POI結果: 点（point-circleレイヤ）として表示、結果範囲にfitBounds
 * - バリアフリー結果: 線（bf-line）＋点（bf-node）として表示
 * - 範囲が算出できない場合は state.bbox にfitBounds（フォールバック）
 * - 再検索（結果変化）: ソースのsetData + fitBounds が再実行される
 * - 検索タブの地図と干渉しない: グローバルなgetMapInstance()に登録しない
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup, waitFor } from '@testing-library/react'
import { AppContext } from '../../../context/AppContext'
import { appReducer, createInitialState } from '../../../state/appReducer'
import { getMapInstance } from '../../../hooks/useMapRef'
import MobileResultsMap from '../MobileResultsMap'

// MapLibre GLはWebGLが必要でjsdomでは初期化できないためモジュール全体をモックする
const mockState = vi.hoisted(() => ({ api: null }))
vi.mock('maplibre-gl', async () => {
  const mod = await import('../../../test/maplibreMock')
  mockState.api = mod.createMapLibreMock()
  return { default: mockState.api }
})

const OSAKA_BBOX = { south: 34.7, west: 135.5, north: 34.8, east: 135.6 }

// ===== テスト用データ =====
const poiA = { type: 'node', id: 1, name: 'カフェA', lat: 34.7, lon: 135.5, tags: { amenity: 'cafe', name: 'カフェA' } }
const poiB = { type: 'node', id: 2, name: '中央公園', lat: 34.71, lon: 135.51, tags: { leisure: 'park', name: '中央公園' } }
const poiSingle = { type: 'node', id: 3, name: '単独カフェ', lat: 34.75, lon: 135.55, tags: { amenity: 'cafe', name: '単独カフェ' } }
const poiNoCoords = { type: 'node', id: 4, name: '座標なし施設', lat: null, lon: null, tags: { amenity: 'cafe', name: '座標なし施設' } }

const bfFootway = {
  type: 'way',
  id: 100,
  name: '中央通り歩道',
  tags: { highway: 'footway', tactile_paving: 'yes', name: '中央通り歩道' },
  bf: { kind: 'way', tactile: 'yes', geometry: [[135.0, 34.0], [135.01, 34.01], [135.02, 34.0]] }
}
const bfKerb = {
  type: 'node',
  id: 200,
  name: null,
  tags: { barrier: 'kerb' },
  bf: { kind: 'node', kerb: null, hasSound: false, hasVibration: false, geometry: [135.1, 34.1] }
}

// ===== ハーネス =====
function Harness({ preActions = [], children }) {
  const [state, dispatch] = React.useReducer(
    appReducer,
    preActions,
    (acts) => acts.reduce((s, a) => appReducer(s, a), createInitialState())
  )
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  )
}

const getMap = () => mockState.api._state.maps.at(-1)
const callsOf = (map, name) => map._calls.filter((c) => c.name === name)

// mockの'load'はqueueMicrotaskで自動発火するため、フラッシュする
async function flushLoad() {
  await act(async () => {})
}

beforeEach(() => {
  if (mockState.api) mockState.api.resetState()
})
afterEach(() => cleanup())

describe('MobileResultsMap: POI結果（kind="poi"）', () => {
  it('結果を点レイヤとして設定し、結果範囲にfitBoundsする', async () => {
    render(
      <Harness preActions={[
        { type: 'SET_RESULTS', payload: [poiA, poiB] },
        { type: 'SET_STATUS', payload: 'success' }
      ]}>
        <MobileResultsMap kind="poi" />
      </Harness>
    )
    await flushLoad()

    const map = getMap()
    expect(map).toBeTruthy()

    // ソース・レイヤ: 'results'（geojson・非クラスタ）+ point-circle
    const src = map._sources.get('results')
    expect(src).toBeTruthy()
    expect(src.type).toBe('geojson')
    expect(src.cluster).toBeFalsy()
    expect(map._layers.map((l) => l.id)).toEqual(['point-circle'])

    // 結果がGeoJSONとして設定される（lon,lat座標）
    const fc = map._lastGeoJSON.data
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.features).toHaveLength(2)
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [135.5, 34.7] })
    expect(fc.features[0].properties.key).toBe('node/1')

    // 結果範囲にfitBounds
    const fit = callsOf(map, 'fitBounds')[0]
    expect(fit.args[0]).toEqual([[135.5, 34.7], [135.51, 34.71]])
    expect(fit.args[1]).toMatchObject({ padding: 24, maxZoom: 16 })
  })

  it('単一点の結果でもfitBoundsできる（範囲をわずかに拡張）', async () => {
    render(
      <Harness preActions={[
        { type: 'SET_RESULTS', payload: [poiSingle] },
        { type: 'SET_STATUS', payload: 'success' }
      ]}>
        <MobileResultsMap kind="poi" />
      </Harness>
    )
    await flushLoad()

    const fit = callsOf(getMap(), 'fitBounds')[0]
    const [[w, s], [e, n]] = fit.args[0]
    expect(w).toBeLessThan(135.55)
    expect(e).toBeGreaterThan(135.55)
    expect(s).toBeLessThan(34.75)
    expect(n).toBeGreaterThan(34.75)
  })

  it('座標がnoneば結果は範囲算出不能 → state.bboxにfitBoundsする', async () => {
    render(
      <Harness preActions={[
        { type: 'SET_RESULTS', payload: [poiNoCoords] },
        { type: 'SET_STATUS', payload: 'success' },
        { type: 'SET_BBOX', payload: OSAKA_BBOX }
      ]}>
        <MobileResultsMap kind="poi" />
      </Harness>
    )
    await flushLoad()

    // 使用可能な座標なし → 空のFeatureCollection
    expect(getMap()._lastGeoJSON.data.features).toHaveLength(0)
    const fit = callsOf(getMap(), 'fitBounds')[0]
    expect(fit.args[0]).toEqual([[135.5, 34.7], [135.6, 34.8]])
  })

  it('再検索（結果変化）でsetDataとfitBoundsが再実行される', async () => {
    const poiC = { type: 'node', id: 5, name: '新カフェ', lat: 34.9, lon: 135.7, tags: { amenity: 'cafe', name: '新カフェ' } }
    let dispatchRef
    function Inner() {
      const [state, dispatch] = React.useReducer(
        appReducer,
        [{ type: 'SET_RESULTS', payload: [poiA, poiB] }, { type: 'SET_STATUS', payload: 'success' }],
        (acts) => acts.reduce((s, a) => appReducer(s, a), createInitialState())
      )
      dispatchRef = dispatch
      return (
        <AppContext.Provider value={{ state, dispatch }}>
          <MobileResultsMap kind="poi" />
        </AppContext.Provider>
      )
    }
    render(<Inner />)
    await flushLoad()

    const map = getMap()
    expect(map._lastGeoJSON.data.features).toHaveLength(2)
    const fitsBefore = callsOf(map, 'fitBounds').length

    // 再検索: 新しい結果に置き換わる
    await act(async () => {
      dispatchRef({ type: 'SET_RESULTS', payload: [poiC] })
    })

    expect(map._lastGeoJSON.data.features).toHaveLength(1)
    expect(map._lastGeoJSON.data.features[0].properties.key).toBe('node/5')
    expect(callsOf(map, 'fitBounds').length).toBe(fitsBefore + 1)
    // 単一点の再検索: 点を中心にわずかに拡張された範囲へfitBounds
    const [[w, s], [e, n]] = callsOf(map, 'fitBounds').at(-1).args[0]
    expect(w).toBeCloseTo(135.6995, 6)
    expect(s).toBeCloseTo(34.8995, 6)
    expect(e).toBeCloseTo(135.7005, 6)
    expect(n).toBeCloseTo(34.9005, 6)
  })
})

describe('MobileResultsMap: バリアフリー結果（kind="barrier_free"）', () => {
  it('歩道を線・縁石を点として設定し、両方を含む範囲にfitBoundsする', async () => {
    render(
      <Harness preActions={[
        { type: 'SET_RESULTS', payload: [bfFootway, bfKerb] },
        { type: 'SET_STATUS', payload: 'success' }
      ]}>
        <MobileResultsMap kind="barrier_free" />
      </Harness>
    )
    await flushLoad()

    const map = getMap()
    // ソース・レイヤ: 'barrier-free' + bf-line/bf-node
    expect(map._sources.get('barrier-free')).toBeTruthy()
    expect(map._layers.map((l) => l.id)).toEqual(['bf-line', 'bf-node'])

    const fc = map._lastGeoJSON.data
    expect(fc.features).toHaveLength(2)
    const line = fc.features.find((f) => f.geometry.type === 'LineString')
    const point = fc.features.find((f) => f.geometry.type === 'Point')
    expect(line.geometry.coordinates).toEqual([[135.0, 34.0], [135.01, 34.01], [135.02, 34.0]])
    expect(line.properties).toMatchObject({ key: 'way/100', kind: 'way', tactile: 'yes' })
    expect(point.geometry.coordinates).toEqual([135.1, 34.1])
    expect(point.properties).toMatchObject({ key: 'node/200', kind: 'node', role: 'kerb' })

    // 線と点の両方を含む範囲
    const fit = callsOf(map, 'fitBounds')[0]
    expect(fit.args[0]).toEqual([[135.0, 34.0], [135.1, 34.1]])
  })
})

describe('MobileResultsMap: 検索タブの地図との干渉', () => {
  it('グローバルなgetMapInstance()には登録しない', async () => {
    render(
      <Harness preActions={[
        { type: 'SET_RESULTS', payload: [poiA] },
        { type: 'SET_STATUS', payload: 'success' }
      ]}>
        <MobileResultsMap kind="poi" />
      </Harness>
    )
    await flushLoad()
    expect(getMapInstance()).toBeNull()
  })

  it('OSM表記（compact）のアトリビューション制御が登録される', async () => {
    render(
      <Harness preActions={[
        { type: 'SET_RESULTS', payload: [poiA] },
        { type: 'SET_STATUS', payload: 'success' }
      ]}>
        <MobileResultsMap kind="poi" />
      </Harness>
    )
    await flushLoad()
    expect(mockState.api._state.controls).toHaveLength(1)
    expect(mockState.api._state.controls[0]._options).toEqual({ compact: true })
  })

  it('アンマウント時にマップが破棄される', async () => {
    const { unmount } = render(
      <Harness preActions={[
        { type: 'SET_RESULTS', payload: [poiA] },
        { type: 'SET_STATUS', payload: 'success' }
      ]}>
        <MobileResultsMap kind="poi" />
      </Harness>
    )
    await flushLoad()
    const map = getMap()
    unmount()
    expect(map._removed).toBe(true)
  })

  it('アクセシビリティ: 結果マップはrole=imgでラベルを持つ', async () => {
    render(
      <Harness preActions={[
        { type: 'SET_RESULTS', payload: [poiA] },
        { type: 'SET_STATUS', payload: 'success' }
      ]}>
        <MobileResultsMap kind="poi" />
      </Harness>
    )
    expect(screen.getByRole('img', { name: '検索結果マップ' })).toBeTruthy()
  })
})
