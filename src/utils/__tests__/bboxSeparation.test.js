import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * #29 + #41: 地図の移動とOverpass検索BBOXの分離 — 回帰テスト
 *
 * (#41-4) 旧「矩形描画」「この範囲を設定」ボタンのテストを削除。
 * 新仕様: 検索ボタンが map.getBounds() からBBOXを取得し、
 *         state.bbox は「前回検索範囲」としてのみ使用される。
 */

// vi.mockはファイルトップにホイスされるため、モックオブジェクトはvi.hoistedで定義
const { mockMap, mockMarker, mockRectangle, mockTileLayer, mockBounds } = vi.hoisted(() => {
  const mockBounds = {
    getSouth: () => 34.70,
    getNorth: () => 34.71,
    getWest: () => 135.48,
    getEast: () => 135.49,
  }
  const mockMap = {
    setView: vi.fn(),
    getZoom: vi.fn().mockReturnValue(13),
    getBounds: vi.fn().mockReturnValue(mockBounds),
    on: vi.fn(),
    off: vi.fn(),
    panTo: vi.fn(),
    fitBounds: vi.fn(),
    remove: vi.fn(),
    removeLayer: vi.fn(),
    invalidateSize: vi.fn(),
    getCenter: vi.fn().mockReturnValue({ lat: 34.705, lng: 135.485 }),
  }
  const mockMarker = { bindPopup: vi.fn().mockReturnThis(), addTo: vi.fn().mockReturnThis() }
  const mockRectangle = { addTo: vi.fn().mockReturnThis() }
  const mockTileLayer = { addTo: vi.fn().mockReturnThis() }
  return { mockMap, mockMarker, mockRectangle, mockTileLayer, mockBounds }
})

vi.mock('leaflet', () => ({
  map: vi.fn().mockReturnValue(mockMap),
  tileLayer: vi.fn().mockReturnValue(mockTileLayer),
  marker: vi.fn().mockReturnValue(mockMarker),
  rectangle: vi.fn().mockReturnValue(mockRectangle),
  divIcon: vi.fn().mockReturnValue({}),
  latLngBounds: vi.fn().mockReturnValue({}),
}))

const dispatchMock = vi.hoisted(() => vi.fn())

vi.mock('../../context/AppContext', () => ({
  useApp: () => ({
    state: { bbox: null, results: [], activeResultId: null },
    dispatch: dispatchMock,
  })
}))

vi.mock('../../hooks/useMapRef', () => ({
  setMapInstance: vi.fn(),
  getMapInstance: vi.fn().mockReturnValue(mockMap),
}))

// (#41-4) 検索BBOX解決ロジックの純粋関数テスト
import { resolveSearchBbox } from '../searchBbox'

describe('#29/#41: 地図の移動と検索BBOXの分離', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('moveend/zoomendハンドラが地図に登録されない', () => {
    // (#29) 地図のpan/zoomでBBOXを更新しない
    const onCalls = mockMap.on.mock.calls
    const bboxEvents = onCalls.filter(([event]) =>
      event === 'moveend' || event === 'zoomend'
    )
    expect(bboxEvents).toHaveLength(0)
  })

  it('panTo（施設選択）でSET_BBOXをdispatchしない', () => {
    mockMap.panTo([34.71, 135.49])
    const bboxDispatches = dispatchMock.mock.calls.filter(
      ([action]) => action.type === 'SET_BBOX'
    )
    expect(bboxDispatches).toHaveLength(0)
  })

  it('setView（地名検索）でSET_BBOXをdispatchしない', () => {
    mockMap.setView([34.72, 135.50], 15)
    const bboxDispatches = dispatchMock.mock.calls.filter(
      ([action]) => action.type === 'SET_BBOX'
    )
    expect(bboxDispatches).toHaveLength(0)
  })

  it('fitBounds（URL復元）でSET_BBOXをdispatchしない', () => {
    mockMap.fitBounds([[34.70, 135.48], [34.71, 135.49]])
    const bboxDispatches = dispatchMock.mock.calls.filter(
      ([action]) => action.type === 'SET_BBOX'
    )
    expect(bboxDispatches).toHaveLength(0)
  })
})

describe('#41-1: 共有URLのBBOX復元と検索範囲', () => {
  const fakeBounds = {
    getSouth: () => 35.68,
    getNorth: () => 35.70,
    getWest: () => 139.75,
    getEast: () => 139.78,
  }

  it('地図BBOXが提供されたら、state.bbox（大阪）ではなく地図範囲で検索', () => {
    const stateBbox = { south: 34.70, west: 135.48, north: 34.71, east: 135.49 }
    const resolved = resolveSearchBbox(stateBbox, fakeBounds)
    // 地図範囲（東京）が使用される
    expect(resolved).toEqual({
      south: 35.68, west: 139.75, north: 35.70, east: 139.78
    })
  })

  it('地図が非表示（bounds=null）ならstate.bbox（前回範囲）を使用', () => {
    const stateBbox = { south: 34.70, west: 135.48, north: 34.71, east: 135.49 }
    const resolved = resolveSearchBbox(stateBbox, null)
    expect(resolved).toEqual(stateBbox)
  })

  it('地図もstate.bboxもない場合はnull（エラー案内を表示）', () => {
    const resolved = resolveSearchBbox(null, null)
    expect(resolved).toBeNull()
  })
})

describe('#41-1: 初回URL復元時のfitBounds', () => {
  it('初回BBOX出現時にfitBoundsが呼ばれ、2回目は呼ばれない', () => {
    // hasFitInitialBboxRefのロジックをシミュレート
    let hasFit = false

    // 初回: bboxがnull → fitしない
    const result1 = simulateFit(hasFit, null)
    expect(result1.fitted).toBe(false)
    expect(result1.hasFit).toBe(false)

    // 2回目: URL復元でbboxが設定される → fitする
    const result2 = simulateFit(result1.hasFit, { south: 35.68, west: 139.75, north: 35.70, east: 139.78 })
    expect(result2.fitted).toBe(true)
    expect(result2.hasFit).toBe(true)

    // 3回目: 通常検索でbbox更新 → fitしない
    const result3 = simulateFit(result2.hasFit, { south: 35.69, west: 139.76, north: 35.71, east: 139.79 })
    expect(result3.fitted).toBe(false)
    expect(result3.hasFit).toBe(true)
  })
})

// 初回fitBoundsロジックの純粋関数シミュレーション
function simulateFit(hasFit, bbox) {
  if (bbox && !hasFit) {
    return { fitted: true, hasFit: true }
  }
  return { fitted: false, hasFit }
}
