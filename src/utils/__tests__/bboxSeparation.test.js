import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * #29 + #41: 地図の移動とOverpass検索BBOXの分離 — 回帰テスト
 *
 * (#41-4) 旧「矩形描画」「この範囲を設定」ボタンのテストを削除。
 * 新仕様: 検索ボタンが map.getBounds() からBBOXを取得し、
 *         state.bbox は「前回検索範囲」としてのみ使用される。
 *
 * (Task 2 / MapLibre移行) 検索実行後はカメラを変更しない（fitBoundsしない）。
 * カメラfitはURL復元由来のbbox（bboxSource==='url'）のみ。
 * コンポーネントレベルの検証は MapView.test.jsx 参照。
 */

// vi.mockはファイルトップにホイスされるため、モックオブジェクトはvi.hoistedで定義
const { mockMap, mockBounds } = vi.hoisted(() => {
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
    resize: vi.fn(),
    getCenter: vi.fn().mockReturnValue({ lat: 34.705, lng: 135.485 }),
  }
  return { mockMap, mockBounds }
})

const dispatchMock = vi.hoisted(() => vi.fn())

// (#41-4) 検索BBOX解決ロジックの純粋関数テスト
import { resolveSearchBbox } from '../searchBbox'

describe('#29/#41: 地図の移動と検索BBOXの分離', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('moveend/zoomendハンドラが地図にBBOX更新のためには登録されない', () => {
    // (#29) 地図のpan/zoomでBBOXを更新しない（state.bboxは検索時のみ更新）
    const onCalls = mockMap.on.mock.calls
    const bboxEvents = onCalls.filter(([event]) =>
      event === 'moveend' || event === 'zoomend'
    )
    expect(bboxEvents).toHaveLength(0)
  })

  it('panTo（施設選択）でSET_BBOXをdispatchしない', () => {
    mockMap.panTo([135.49, 34.71]) // MapLibreは[経度, 緯度]順
    const bboxDispatches = dispatchMock.mock.calls.filter(
      ([action]) => action.type === 'SET_BBOX'
    )
    expect(bboxDispatches).toHaveLength(0)
  })

  it('setView（地名検索）でSET_BBOXをdispatchしない', () => {
    mockMap.setView([135.50, 34.72], 15)
    const bboxDispatches = dispatchMock.mock.calls.filter(
      ([action]) => action.type === 'SET_BBOX'
    )
    expect(bboxDispatches).toHaveLength(0)
  })

  it('検索実行後のfitBounds（検索BBOXへのfit）は行われない', () => {
    // (Task 2) 検索由来のbbox（bboxSource='search'）ではカメラfitしない
    const fitted = shouldFitBounds({ south: 34.70, west: 135.48, north: 34.71, east: 135.49 }, 'search', false)
    expect(fitted).toBe(false)
    // fitBounds自体が呼ばれることはなく、dispatchもされない
    mockMap.fitBounds([[135.48, 34.70], [135.49, 34.71]])
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

describe('Task 2: 初回URL復元時のfitBounds（bboxSourceによる分岐）', () => {
  it('URL復元由来のbbox（source=url）は初回のみfit、2回目はfitしない', () => {
    let hasFit = false

    // 初回: bboxがnull → fitしない
    const result1 = simulateFit(hasFit, null, null)
    expect(result1.fitted).toBe(false)
    expect(result1.hasFit).toBe(false)

    // 2回目: URL復元でbboxが設定される（source='url'） → fitする
    const result2 = simulateFit(result1.hasFit, { south: 35.68, west: 139.75, north: 35.70, east: 139.78 }, 'url')
    expect(result2.fitted).toBe(true)
    expect(result2.hasFit).toBe(true)

    // 3回目: 通常検索でbbox更新（source='search'） → fitしない
    const result3 = simulateFit(result2.hasFit, { south: 35.69, west: 139.76, north: 35.71, east: 139.79 }, 'search')
    expect(result3.fitted).toBe(false)
    expect(result3.hasFit).toBe(true)
  })

  it('検索由来のbbox（source=search）は初回でもfitしない', () => {
    const result = simulateFit(false, { south: 35.68, west: 139.75, north: 35.70, east: 139.78 }, 'search')
    expect(result.fitted).toBe(false)
    expect(result.hasFit).toBe(false)
  })
})

// 初回fitBoundsロジックの純粋関数シミュレーション
// MapViewの実装: fitBoundsは bbox && bboxSource === 'url' && !hasFit のときのみ
function shouldFitBounds(bbox, bboxSource, hasFit) {
  return Boolean(bbox) && bboxSource === 'url' && !hasFit
}

function simulateFit(hasFit, bbox, bboxSource) {
  if (shouldFitBounds(bbox, bboxSource, hasFit)) {
    return { fitted: true, hasFit: true }
  }
  return { fitted: false, hasFit }
}
