// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import MapView from '../MapView'
import { AppContext } from '../../context/AppContext'
import { OSM_RASTER_STYLE } from '../../utils/mapStyle'

/**
 * MapLibre移行（Task 1）+ 検索後カメラ不動（Task 2）の検証
 *
 * - (Task 2) 検索実行（bboxSource='search'）ではfitBoundsを呼ばない。
 *   カメラfitはURL復元由来（bboxSource='url'）の初回適用時のみ。
 * - (Task 2) 選択矩形（BBOXオーバーレイ）の描画は存在しない。
 * - (a) OSMラスタタイル+© OpenStreetMap attribution（スタイル定義を検証）
 * - (#38) ポップアップはtextContentベースのDOMノード（HTML注入不可）
 * - (#39相当) 結果更新時に旧ポップアップを閉じる
 * - クラスタリング（supercluster不要のネイティブcluster）+ 500件上限の撤廃
 * - (#60) ウィンドウリサイズでmap.resize()
 * - アクティブ結果のハイライトマーカー（panToのみ、BBOX不変）
 */

// vi.mockファクトリはファイル先頭にホイスされるため、共通モックは動的importで参照。
// autoLoad: false → 'load'イベントをテストが制御して発火する。
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

const BBOX_OSAKA = { south: 34.66, west: 135.47, north: 34.69, east: 135.5 }
const BBOX_KYOto = { south: 34.7, west: 135.48, north: 34.71, east: 135.49 }

const RESULTS = [
  {
    type: 'node', id: 9001, lat: 34.68, lon: 135.48,
    name: '<script>alert(1)</script>',
    tags: { name: '<script>alert(1)</script>', amenity: 'cafe', wheelchair: 'yes' }
  },
  {
    // overpass.jsのパイプラインはway/relationのcenterをトップレベルlat/lonに正規化する
    type: 'way', id: 9002, lat: 34.67, lon: 135.49, center: { lat: 34.67, lon: 135.49 },
    name: 'テストラーメン屋',
    tags: { name: 'テストラーメン屋', amenity: 'restaurant', cuisine: 'ramen' }
  }
]

function renderMap(state = {}, props = {}) {
  const fullState = {
    results: [], bbox: null, bboxSource: null, activeResultId: null,
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

const getMap = () => mockState.api._state.maps.at(-1)
const fireLoad = () => act(() => { getMap().fire('load') })
const callsOf = (map, name) => map._calls.filter((c) => c.name === name)

describe('Task 2: 検索後のカメラ不変', () => {
  it('検索由来のbbox（bboxSource=search）ではfitBoundsを呼ばない', () => {
    renderMap({ bbox: BBOX_KYOto, bboxSource: 'search', results: RESULTS })
    fireLoad()
    expect(callsOf(getMap(), 'fitBounds')).toHaveLength(0)
    // 初期center/zoomもBBOXから派生しない（既定の大阪中心）
    const map = getMap()
    expect(map._options.center).toEqual([135.5023, 34.6937])
    expect(map._options.zoom).toBe(13)
  })

  it('URL復元由来のbbox（bboxSource=url）は初回ロード時のみfitBoundsする', () => {
    renderMap({ bbox: BBOX_OSAKA, bboxSource: 'url' })
    fireLoad()
    const fits = callsOf(getMap(), 'fitBounds')
    expect(fits).toHaveLength(1)
    // [[west, south], [east, north]]（MapLibreは{lng, lat}順）
    expect(fits[0].args[0]).toEqual([[135.47, 34.66], [135.5, 34.69]])
    expect(fits[0].args[1]).toEqual({ padding: 20 })
  })

  it('URL復元fit後に検索すると、再fitされない（カメラ位置・ズームは不変）', () => {
    const { view, state } = renderMap({ bbox: BBOX_OSAKA, bboxSource: 'url', results: RESULTS })
    fireLoad()
    expect(callsOf(getMap(), 'fitBounds')).toHaveLength(1)

    // 検索実行: 新規bbox（source=search）でstateが更新される
    const next = { ...state, bbox: BBOX_KYOto, bboxSource: 'search' }
    act(() => {
      view.rerender(
        <AppContext.Provider value={{ state: next, dispatch: vi.fn() }}>
          <MapView />
        </AppContext.Provider>
      )
    })

    // fitBoundsは初回の1件のみ（再fitなし）
    expect(callsOf(getMap(), 'fitBounds')).toHaveLength(1)
    // setViewも呼ばれない（カメラ位置・ズームの変更なし）
    expect(callsOf(getMap(), 'setView')).toHaveLength(0)
    // 結果マーカーは反映される（検索結果の更新自体は正常に動作）
    expect(getMap()._lastGeoJSON.data.features.length).toBe(2)
  })

  it('選択矩形（BBOXオーバーレイ）の描画は存在しない', () => {
    renderMap({ bbox: BBOX_OSAKA, bboxSource: 'url', results: RESULTS })
    fireLoad()
    const map = getMap()
    // 結果レイヤのみ（矩形レイヤ・矩形ソースなし）
    const layerIds = map._layers.map((l) => l.id)
    expect(layerIds).toEqual(['point-circle', 'clusters', 'cluster-count'])
    const sourceIds = [...map._sources.keys()]
    expect(sourceIds).toEqual(['results'])
  })
})

describe('(a) OSMベースマップと帰属表示', () => {
  it('OSMラスタタイル+© OpenStreetMap attributionのスタイルで初期化する', () => {
    renderMap({})
    const map = getMap()
    // タイルソース（tile.openstreetmap.jp / OSMFJ のOSMラスタ、community_mapmakerと同一）
    expect(map._options.style.sources.osm.type).toBe('raster')
    expect(map._options.style.sources.osm.tiles).toEqual([
      'https://tile.openstreetmap.jp/{z}/{x}/{y}.png'
    ])
    expect(map._options.style.sources.osm.attribution).toContain('© OpenStreetMap')
    // レイヤはraster
    const layer = OSM_RASTER_STYLE.layers[0]
    expect(layer.type).toBe('raster')
    expect(layer.source).toBe('osm')
    // NavigationControl（zoomボタン）が左上に配置される
    expect(map._options.style).toEqual(OSM_RASTER_STYLE)
  })
})

describe('#38: プレーンテキストポップアップ（HTML注入対策）', () => {
  it('ポップアップはDOMノードで構築され、nameがテキストとして扱われる', () => {
    renderMap({ results: RESULTS })
    fireLoad()
    const map = getMap()

    const feature = map._lastGeoJSON.data.features.find((f) => f.properties.key === 'node/9001')
    act(() => {
      map.fire('click', 'point-circle', {
        features: [feature],
        lngLat: { lat: 34.68, lng: 135.48 }
      })
    })

    const popup = mockState.api._state.popups.at(-1)
    expect(popup).toBeTruthy()
    // setDOMElementでDOMノード（setHTML未使用）
    expect(popup._element).toBeInstanceOf(HTMLElement)
    expect(popup._text).toBeNull()

    // スクリプト注入試みのnameはエスケープされたテキストとして表示される
    const nameEl = popup._element.querySelector('.map-popup-name')
    expect(nameEl.textContent).toBe('<script>alert(1)</script>')
    expect(nameEl.innerHTML).not.toContain('<script>')
    expect(popup._element.querySelector('script')).toBeNull()
  })

  it('結果が更新されると旧ポップアップは閉じる', () => {
    const { view, state } = renderMap({ results: RESULTS })
    fireLoad()
    const map = getMap()

    const feature = map._lastGeoJSON.data.features.find((f) => f.properties.key === 'node/9001')
    act(() => {
      map.fire('click', 'point-circle', { features: [feature], lngLat: { lat: 34.68, lng: 135.48 } })
    })
    const popup = mockState.api._state.popups.at(-1)
    expect(popup._removed).toBe(false)

    // 結果更新 → 旧ポップアップがcloseされる
    const next = { ...state, results: [...RESULTS, { type: 'node', id: 9003, lat: 34.665, lon: 135.485, name: '新規', tags: { name: '新規', shop: 'bakery' } }] }
    act(() => {
      view.rerender(
        <AppContext.Provider value={{ state: next, dispatch: vi.fn() }}>
          <MapView />
        </AppContext.Provider>
      )
    })
    expect(popup._removed).toBe(true)
  })
})

describe('クラスタリング（ネイティブcluster、supercluster不要）', () => {
  it('cluster有効なGeoJSONソース+3レイヤ（点/クラスタ/件数）を追加する', () => {
    renderMap({ results: RESULTS })
    fireLoad()
    const map = getMap()
    const source = map._sources.get('results')
    expect(source.type).toBe('geojson')
    expect(source.cluster).toBe(true)
    expect(source.clusterRadius).toBeGreaterThan(0)
    const layerIds = map._layers.map((l) => l.id)
    expect(layerIds).toEqual(['point-circle', 'clusters', 'cluster-count'])
  })

  it('500件上限が撤廃され、全件がGeoJSONに含まれる', () => {
    const many = Array.from({ length: 600 }, (_, i) => ({
      type: 'node', id: 10000 + i, lat: 34.6 + (i % 50) * 0.0005, lon: 135.47 + Math.floor(i / 50) * 0.0005,
      name: `施設${i}`, tags: { name: `施設${i}`, amenity: 'cafe' }
    }))
    renderMap({ results: many })
    fireLoad()
    const map = getMap()
    expect(map._lastGeoJSON.data.features.length).toBe(600)
  })

  it('クラスタクリックでメンバー範囲へfitBoundsする（ユーザー操作は許可）', () => {
    mockState.api.setQuerySourceFeatures(() => [
      { geometry: { coordinates: [135.5, 34.85] } },
      { geometry: { coordinates: [135.51, 34.86] } }
    ])
    renderMap({ results: RESULTS })
    fireLoad()
    const map = getMap()

    act(() => {
      map.fire('click', 'clusters', { features: [{ properties: { cluster_id: 1, point_count: 2 } }] })
    })

    const fits = callsOf(map, 'fitBounds')
    expect(fits).toHaveLength(1)
    expect(fits[0].args[0]).toEqual([[135.5, 34.85], [135.51, 34.86]])
    expect(fits[0].args[1]).toEqual({ padding: 40, maxZoom: 17, duration: 800 })
  })
})

describe('#60: リサイズ時の再描画（resize）', () => {
  afterEach(() => vi.useRealTimers())

  it('ウィンドウリサイズでmap.resize()が呼ばれる', () => {
    vi.useFakeTimers()
    renderMap({ results: RESULTS })
    fireLoad()
    const map = getMap()

    act(() => {
      fireEvent(window, new Event('resize'))
    })
    vi.advanceTimersByTime(110)

    expect(callsOf(map, 'resize').length).toBeGreaterThanOrEqual(1)
  })
})

describe('ハイライトマーカー（#60 施設選択）', () => {
  it('アクティブ結果にオレンジマーカー+プレーンテキストポップアップを表示する', () => {
    renderMap({ results: RESULTS, activeResultId: 'node/9001' })
    fireLoad()

    const markers = mockState.api._state.markers
    const highlight = markers.find((m) => m._element && m._element.className === 'map-highlight-marker')
    expect(highlight).toBeTruthy()
    expect(highlight._lngLat).toEqual([135.48, 34.68]) // [lng, lat]
    expect(highlight._popup._text).toBe('<script>alert(1)</script>') // setText（プレーン）
  })

  it('アクティブ結果の変更でマーカー位置が追従し、解除で削除される', () => {
    // （load前にactiveResultIdを設定してもpanToは走らないため、
    //   load後に設定・変更・解除の順で検証する）
    const { view, state } = renderMap({ results: RESULTS })
    fireLoad()
    const map = getMap()

    const set = (s) => act(() => {
      view.rerender(
        <AppContext.Provider value={{ state: s, dispatch: vi.fn() }}>
          <MapView />
        </AppContext.Provider>
      )
    })

    // node/9001 を選択 → panTo + マーカー作成
    set({ ...state, activeResultId: 'node/9001' })
    expect(callsOf(map, 'panTo')).toEqual([{ name: 'panTo', args: [[135.48, 34.68], { duration: 500 }] }])
    let highlight = mockState.api._state.markers.find((m) => m._element && m._element.className === 'map-highlight-marker')
    expect(highlight._lngLat).toEqual([135.48, 34.68])

    // 別結果へ切替 → 同一マーカーの位置追従（panToも更新）
    set({ ...state, activeResultId: 'way/9002' })
    expect(highlight._lngLat).toEqual([135.49, 34.67])
    expect(mockState.api._state.markers.filter((m) => m._element && m._element.className === 'map-highlight-marker')).toHaveLength(1)

    // 解除 → マーカー削除
    set({ ...state, activeResultId: null })
    expect(highlight._removed).toBe(true)
  })
})

describe('Task 11: GeoJSONソース更新はsetData（Map.setGeoJSONはmaplibre-glに存在しない）', () => {
  it('mockは実APIに合わせMap.setGeoJSONを持たない（回帰時にTypeErrorで検出）', () => {
    renderMap({ results: RESULTS })
    fireLoad()
    // 実maplibre-glのMapにはsetGeoJSONメソッドがない（mapbox-gl由来のAPI）。
    // モックにも存在させないことで、アプリ側が誤ってmap.setGeoJSON()を呼んだ場合は
    // 本番と同様の「setGeoJSON is not a function」でテストが失敗する。
    expect(getMap().setGeoJSON).toBeUndefined()
  })

  it('検索結果の到着はgetSource("results").setData()で反映される', () => {
    const { view, state } = renderMap({ results: [] })
    fireLoad()
    const map = getMap()
    // load時のsyncResults: 空のFeatureCollectionがsetDataされている
    expect(map._lastGeoJSON.id).toBe('results')
    expect(map._lastGeoJSON.data.features.length).toBe(0)

    // 検索結果がstateに到着 → [results] effectがsetDataを呼ぶ
    act(() => {
      view.rerender(
        <AppContext.Provider
          value={{ state: { ...state, results: RESULTS, bbox: BBOX_KYOto, bboxSource: 'search' }, dispatch: vi.fn() }}
        >
          <MapView />
        </AppContext.Provider>
      )
    })

    expect(map._lastGeoJSON.id).toBe('results')
    expect(map._lastGeoJSON.data.features.length).toBe(2)
    const keys = map._lastGeoJSON.data.features.map((f) => f.properties.key)
    expect(keys).toEqual(['node/9001', 'way/9002'])
  })
})

describe('モバイル: マーカークリックでボトムシート（ポップアップ非表示）', () => {
  it('onMarkerClickが提供されていればクリックでコールバックし、ポップアップを作らない', () => {
    const onMarkerClick = vi.fn()
    renderMap({ results: RESULTS }, { onMarkerClick })
    fireLoad()
    const map = getMap()
    const popupsBefore = mockState.api._state.popups.length

    const feature = map._lastGeoJSON.data.features.find((f) => f.properties.key === 'node/9001')
    act(() => {
      map.fire('click', 'point-circle', { features: [feature], lngLat: { lat: 34.68, lng: 135.48 } })
    })

    expect(onMarkerClick).toHaveBeenCalledTimes(1)
    const clicked = onMarkerClick.mock.calls[0][0]
    expect(clicked.id).toBe(9001)
    expect(mockState.api._state.popups.length).toBe(popupsBefore)
  })
})
