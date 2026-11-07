import { describe, it, expect } from 'vitest'
import { isValidBbox, boundsToBbox, resolveSearchBbox, MIN_BBOX_SPAN } from '../searchBbox'
import { buildSearchCriteria } from '../searchCriteria'

/**
 * 縮退BBOX回帰テスト
 *
 * 背景: 地図コンテナが非表示（hidden / サイズ0）の状態でgetBounds()すると
 * south==north, west==east の面積ゼロBBOXが返る。これをOverpassに送ると
 * "bbox order must be [south, west, north, east]" エラー（HTTP 400）が返り、
 * フォールバック連鎖の末にタイムアウト・全失敗となる。
 *
 * 修正: 縮退・逆順・NaNのBBOXを検証で弾き、未設定（no_bbox）扱いにする。
 */

// jsdom実測: 非表示（display:none）LeafletコンテナのgetBounds()
const DEGENERATE_BOUNDS = {
  getSouth: () => 34.69363839631074,
  getNorth: () => 34.69363839631074,
  getWest: () => 135.50228118896487,
  getEast: () => 135.50228118896487
}

const VALID_BBOX = { south: 34.7, west: 135.5, north: 34.72, east: 135.52 }

function baseState(overrides = {}) {
  return {
    searchSource: 'map',
    searchMode: 'simple',
    simpleSearch: { category: 'cafe', keyword: '', location: '' },
    advancedSearch: { tags: [], keyword: '', useAnd: true },
    municipalitySearch: { category: '', keyword: '', cuisine: '' },
    selectedMunicipality: null,
    bbox: null,
    ...overrides
  }
}

describe('isValidBbox', () => {
  it('正常なBBOXはtrue', () => {
    expect(isValidBbox(VALID_BBOX)).toBe(true)
  })

  it('縮退BBOX（south==north）はfalse', () => {
    expect(isValidBbox({ south: 34.7, west: 135.5, north: 34.7, east: 135.52 })).toBe(false)
  })

  it('縮退BBOX（west==east）はfalse', () => {
    expect(isValidBbox({ south: 34.7, west: 135.5, north: 34.72, east: 135.5 })).toBe(false)
  })

  it('逆順BBOX（south > north）はfalse', () => {
    expect(isValidBbox({ south: 34.72, west: 135.5, north: 34.7, east: 135.52 })).toBe(false)
  })

  it('NaNを含むBBOXはfalse', () => {
    expect(isValidBbox({ south: NaN, west: 135.5, north: 34.72, east: 135.52 })).toBe(false)
  })

  it('丸め精度未満の極小BBOX（span < 1e-6）はfalse', () => {
    const tiny = MIN_BBOX_SPAN / 2
    expect(isValidBbox({ south: 34.7, west: 135.5, north: 34.7 + tiny, east: 135.5 + tiny })).toBe(false)
  })

  it('丸め精度以上ならtrue', () => {
    expect(isValidBbox({ south: 34.7, west: 135.5, north: 34.7 + MIN_BBOX_SPAN, east: 135.5 + MIN_BBOX_SPAN })).toBe(true)
  })

  it('null / undefined / 欠損キーはfalse', () => {
    expect(isValidBbox(null)).toBe(false)
    expect(isValidBbox(undefined)).toBe(false)
    expect(isValidBbox({ south: 34.7, west: 135.5, north: 34.72 })).toBe(false)
    expect(isValidBbox('foo')).toBe(false)
  })
})

describe('boundsToBbox', () => {
  it('正常なboundsはBBOXを返す', () => {
    const bounds = {
      getSouth: () => 34.7, getNorth: () => 34.72,
      getWest: () => 135.5, getEast: () => 135.52
    }
    expect(boundsToBbox(bounds)).toEqual(VALID_BBOX)
  })

  it('非表示地図（サイズ0）の縮退boundsはnullを返す', () => {
    expect(boundsToBbox(DEGENERATE_BOUNDS)).toBeNull()
  })

  it('null boundsはnullを返す', () => {
    expect(boundsToBbox(null)).toBeNull()
  })

  it('MapLibre LngLatBounds形式（{_southWest, _northEast}）からBBOXを返す', () => {
    const bounds = {
      pad: () => bounds,
      _southWest: { lat: 34.7, lng: 135.5 },
      _northEast: { lat: 34.72, lng: 135.52 }
    }
    expect(boundsToBbox(bounds)).toEqual(VALID_BBOX)
  })

  it('MapLibre形式の縮退bounds（sw == ne）はnullを返す', () => {
    const bounds = {
      _southWest: { lat: 34.69363839631074, lng: 135.50228118896487 },
      _northEast: { lat: 34.69363839631074, lng: 135.50228118896487 }
    }
    expect(boundsToBbox(bounds)).toBeNull()
  })

  it('未知の形式（LeafletでもMapLibreでもない）はnullを返す', () => {
    expect(boundsToBbox({ foo: 1 })).toBeNull()
  })
})

describe('resolveSearchBbox', () => {
  it('縮退mapBounds + 有効なstateBbox → stateBboxを使用', () => {
    expect(resolveSearchBbox(VALID_BBOX, DEGENERATE_BOUNDS)).toEqual(VALID_BBOX)
  })

  it('縮退mapBounds + 縮退stateBbox → null', () => {
    const degenerate = { south: 34.7, west: 135.5, north: 34.7, east: 135.5 }
    expect(resolveSearchBbox(degenerate, DEGENERATE_BOUNDS)).toBeNull()
  })

  it('縮退mapBounds + stateBboxなし → null（no_bbox案内へ）', () => {
    expect(resolveSearchBbox(null, DEGENERATE_BOUNDS)).toBeNull()
  })

  it('正常なmapBoundsがあれば優先使用する', () => {
    const bounds = {
      getSouth: () => 35.0, getNorth: () => 35.02,
      getWest: () => 139.0, getEast: () => 139.02
    }
    expect(resolveSearchBbox(VALID_BBOX, bounds)).toEqual({ south: 35.0, west: 139.0, north: 35.02, east: 139.02 })
  })
})

describe('buildSearchCriteria — 縮退BBOXの排除', () => {
  it('非表示地図からの縮退mapBoundsはno_bboxで失敗する', () => {
    const criteria = buildSearchCriteria(baseState(), { mapBounds: DEGENERATE_BOUNDS })
    expect(criteria.ok).toBe(false)
    expect(criteria.reason).toBe('no_bbox')
    expect(criteria.message).toBeTruthy()
    expect(criteria.suggestion).toBeTruthy()
  })

  it('縮退state.bbox（前回の保存値）はno_bboxで失敗する', () => {
    const degenerate = { south: 34.7, west: 135.5, north: 34.7, east: 135.52 }
    const criteria = buildSearchCriteria(baseState({ bbox: degenerate }))
    expect(criteria.ok).toBe(false)
    expect(criteria.reason).toBe('no_bbox')
  })

  it('縮退bboxOverrideは無効としてフォールバックする', () => {
    const degenerate = { south: 34.7, west: 135.5, north: 34.7, east: 135.52 }
    const validBounds = {
      getSouth: () => 35.6, getNorth: () => 35.62,
      getWest: () => 139.7, getEast: () => 139.72
    }
    const criteria = buildSearchCriteria(baseState(), { bboxOverride: degenerate, mapBounds: validBounds })
    expect(criteria.ok).toBe(true)
    expect(criteria.bbox).toEqual({ south: 35.6, west: 139.7, north: 35.62, east: 139.72 })
  })

  it('縮退mapBoundsでも有効なstate.bboxがあれば検索可能', () => {
    const criteria = buildSearchCriteria(baseState({ bbox: VALID_BBOX }), { mapBounds: DEGENERATE_BOUNDS })
    expect(criteria.ok).toBe(true)
    expect(criteria.bbox).toEqual(VALID_BBOX)
  })

  it('自治体モードでも縮退bboxは弾かれる', () => {
    const criteria = buildSearchCriteria(
      baseState({
        searchSource: 'municipality',
        selectedMunicipality: {
          code: '27101', name: '川崎市',
          bbox: { south: 35.5, west: 139.1, north: 35.5, east: 139.3 } // 縮退
        }
      })
    )
    expect(criteria.ok).toBe(false)
    expect(criteria.reason).toBe('no_bbox')
  })
})
