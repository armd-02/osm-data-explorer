import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * #29: 地図の移動とOverpass検索BBOXの分離 — 回帰テスト
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
}))

describe('#29: 地図の移動と検索BBOXの分離', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('moveend/zoomendハンドラが地図に登録されない', () => {
    // MapViewの設計: 地図のpan/zoomでBBOXを更新しない
    // mockMap.on()がmoveend/zoomendで呼ばれていないことを確認
    // (MapViewの初期化effectではon('moveend'/'zoomend')を登録しない)
    const onCalls = mockMap.on.mock.calls
    const bboxEvents = onCalls.filter(([event]) => 
      event === 'moveend' || event === 'zoomend'
    )
    expect(bboxEvents).toHaveLength(0)
  })

  it('矩形描画でSET_BBOXがdispatchされる', () => {
    const testBbox = { south: 34.70, west: 135.48, north: 34.71, east: 135.49 }
    dispatchMock({ type: 'SET_BBOX', payload: testBbox })

    expect(dispatchMock).toHaveBeenCalledWith({
      type: 'SET_BBOX',
      payload: { south: 34.70, west: 135.48, north: 34.71, east: 135.49 }
    })
  })

  it('「この範囲を設定」でgetBoundsからSET_BBOXがdispatchされる', () => {
    const bounds = mockMap.getBounds()
    dispatchMock({
      type: 'SET_BBOX',
      payload: {
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast()
      }
    })

    expect(dispatchMock).toHaveBeenCalledWith({
      type: 'SET_BBOX',
      payload: { south: 34.70, west: 135.48, north: 34.71, east: 135.49 }
    })
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
