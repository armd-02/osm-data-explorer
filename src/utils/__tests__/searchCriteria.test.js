import { describe, it, expect } from 'vitest'
import { buildSearchCriteria } from '../searchCriteria'

/**
 * (#47) buildSearchCriteria 純粋関数テスト
 *
 * 「検索する」押下時点で生成される検索条件スナップショットを検証する。
 * dispatch との競合排除・モード切り替え時の旧値漏れ・disable条件を保障する。
 *
 * 注: かんたん検索・自治体モードのキーワードはクエリに含まれず、
 *     結果取得後に filterByKeyword でクライアント側フィルタに渡される。
 *     （詳細検索のキーワードも同様にクライアント側フィルタ）
 */

const SMALL_BBOX = { south: 34.7, west: 135.5, north: 34.72, east: 135.52 }
const BBOX_STR = '34.700000,135.500000,34.720000,135.520000'
const HUGE_BBOX = { south: 30.0, west: 130.0, north: 40.0, east: 140.0 }

function leafletLikeBounds(bbox) {
  return {
    getSouth: () => bbox.south,
    getNorth: () => bbox.north,
    getWest: () => bbox.west,
    getEast: () => bbox.east
  }
}

function baseState(overrides = {}) {
  return {
    searchSource: 'map',
    searchMode: 'simple',
    simpleSearch: { category: '', keyword: '', location: '' },
    advancedSearch: { tags: [], keyword: '', useAnd: true },
    municipalitySearch: { category: '', keyword: '' },
    selectedMunicipality: null,
    bbox: null,
    ...overrides
  }
}

describe('buildSearchCriteria — 地図モード（かんたん検索）', () => {
  it('カテゴリ+キーワードでBBOXクエリを生成する', () => {
    const criteria = buildSearchCriteria(baseState({
      bbox: SMALL_BBOX,
      simpleSearch: { category: 'cafe', keyword: 'コーヒー', location: '' }
    }))
    expect(criteria.ok).toBe(true)
    expect(criteria.searchSource).toBe('map')
    expect(criteria.searchMode).toBe('simple')
    expect(criteria.category).toBe('cafe')
    expect(criteria.keyword).toBe('コーヒー')
    expect(criteria.bbox).toEqual(SMALL_BBOX)
    expect(criteria.query).toContain(`node[amenity=cafe](${BBOX_STR});`)
  })

  it('状態BBOXがない場合、地図表示範囲(mapBounds)を使う (#41/#47)', () => {
    const bounds = leafletLikeBounds({ south: 35.6, west: 139.7, north: 35.7, east: 139.8 })
    const criteria = buildSearchCriteria(baseState({
      simpleSearch: { category: 'restaurant', keyword: '', location: '' }
    }), { mapBounds: bounds })
    expect(criteria.ok).toBe(true)
    expect(criteria.bbox).toEqual({ south: 35.6, west: 139.7, north: 35.7, east: 139.8 })
    expect(criteria.query).toContain('[amenity=restaurant]')
  })

  it('BBOXも地図表示範囲もない場合は no_bbox で失敗', () => {
    const criteria = buildSearchCriteria(baseState())
    expect(criteria.ok).toBe(false)
    expect(criteria.reason).toBe('no_bbox')
    expect(criteria.message).toBeTruthy()
    expect(criteria.suggestion).toBeTruthy()
  })

  it('範囲が広すぎる場合は too_large で失敗', () => {
    const criteria = buildSearchCriteria(baseState({ bbox: HUGE_BBOX }))
    expect(criteria.ok).toBe(false)
    expect(criteria.reason).toBe('too_large')
  })
})

describe('buildSearchCriteria — 地図モード（詳細検索）', () => {
  it('タグ条件がある場合はクエリを生成する', () => {
    const criteria = buildSearchCriteria(baseState({
      bbox: SMALL_BBOX,
      searchMode: 'advanced',
      advancedSearch: {
        tags: [{ key: 'amenity', value: 'cafe', mode: 'equals' }],
        keyword: '',
        useAnd: true
      }
    }))
    expect(criteria.ok).toBe(true)
    expect(criteria.searchMode).toBe('advanced')
    expect(criteria.query).toContain(`node[amenity=cafe](${BBOX_STR});`)
  })

  it('キーワードのみでも生成できる（クライアント側フィルタ用）', () => {
    const criteria = buildSearchCriteria(baseState({
      bbox: SMALL_BBOX,
      searchMode: 'advanced',
      advancedSearch: { tags: [], keyword: '寿司', useAnd: true }
    }))
    expect(criteria.ok).toBe(true)
    expect(criteria.keyword).toBe('寿司')
  })

  it('条件が空の場合は no_conditions で失敗', () => {
    const criteria = buildSearchCriteria(baseState({
      bbox: SMALL_BBOX,
      searchMode: 'advanced',
      advancedSearch: { tags: [], keyword: '', useAnd: true }
    }))
    expect(criteria.ok).toBe(false)
    expect(criteria.reason).toBe('no_conditions')
  })

  it('AND/OR の使い分けが反映される', () => {
    const tags = [
      { key: 'amenity', value: 'cafe', mode: 'equals' },
      { key: 'shop', value: 'bakery', mode: 'equals' }
    ]
    const andC = buildSearchCriteria(baseState({
      bbox: SMALL_BBOX, searchMode: 'advanced',
      advancedSearch: { tags, keyword: '', useAnd: true }
    }))
    const orC = buildSearchCriteria(baseState({
      bbox: SMALL_BBOX, searchMode: 'advanced',
      advancedSearch: { tags, keyword: '', useAnd: false }
    }))
    // AND: フィルタを連結（[amenity=cafe][shop=bakery]）
    expect(andC.query).toMatch(/\[amenity=cafe\]\[shop=bakery\]/)
    // OR: union の別ブランチ
    expect(orC.query).toContain('[amenity=cafe]')
    expect(orC.query).toContain('[shop=bakery]')
    expect(orC.query).not.toMatch(/\[amenity=cafe\]\[shop=bakery\]/)
  })
})

describe('buildSearchCriteria — 自治体モード (#44/#47)', () => {
  it('自治体未選択の場合は municipality_not_selected で失敗（ボタンdisable）', () => {
    const criteria = buildSearchCriteria(baseState({
      searchSource: 'municipality',
      selectedMunicipality: null
    }))
    expect(criteria.ok).toBe(false)
    expect(criteria.reason).toBe('municipality_not_selected')
  })

  it('選択済み自治体のBBOXでカテゴリクエリを生成する', () => {
    const mun = { code: '27214', name: '高槻市', bbox: SMALL_BBOX }
    const criteria = buildSearchCriteria(baseState({
      searchSource: 'municipality',
      selectedMunicipality: mun,
      municipalitySearch: { category: 'cafe', keyword: '' }
    }))
    expect(criteria.ok).toBe(true)
    expect(criteria.searchSource).toBe('municipality')
    expect(criteria.searchMode).toBe('simple')
    expect(criteria.bbox).toEqual(SMALL_BBOX)
    expect(criteria.query).toContain(`node[amenity=cafe](${BBOX_STR});`)
    expect(criteria.query).toContain('out body center')
  })

  it('カテゴリ未指定時はPOI対象タグに限定する（道路等を除外 #44）', () => {
    const criteria = buildSearchCriteria(baseState({
      searchSource: 'municipality',
      selectedMunicipality: { code: '27214', name: '高槻市', bbox: SMALL_BBOX },
      municipalitySearch: { category: '', keyword: '' }
    }))
    expect(criteria.ok).toBe(true)
    expect(criteria.query).toContain(`node[amenity](${BBOX_STR});`)
    expect(criteria.query).toContain(`node[shop](${BBOX_STR});`)
    // 全要素（フィルタなし）検索にはしない
    expect(criteria.query).not.toContain(`node(${BBOX_STR});`)
  })

  it('カテゴリ変更直後のstateでも新しいカテゴリが反映される（dispatch競合なし）', () => {
    // ユーザが「カフェ」から「レストラン」に変更した直後のstateをそのまま渡す。
    // クエリは常に渡されたstateの値から生成されるため、古い値が残らない。
    const before = buildSearchCriteria(baseState({
      searchSource: 'municipality',
      selectedMunicipality: { code: '27214', name: '高槻市', bbox: SMALL_BBOX },
      municipalitySearch: { category: 'cafe', keyword: '' }
    }))
    const after = buildSearchCriteria(baseState({
      searchSource: 'municipality',
      selectedMunicipality: { code: '27214', name: '高槻市', bbox: SMALL_BBOX },
      municipalitySearch: { category: 'restaurant', keyword: '' }
    }))
    expect(before.query).toContain('[amenity=cafe]')
    expect(after.query).toContain('[amenity=restaurant]')
    expect(after.query).not.toContain('[amenity=cafe]')
  })

  it('広すぎる自治体は too_large で失敗', () => {
    const criteria = buildSearchCriteria(baseState({
      searchSource: 'municipality',
      selectedMunicipality: { code: '23', name: '東京都', bbox: HUGE_BBOX }
    }))
    expect(criteria.ok).toBe(false)
    expect(criteria.reason).toBe('too_large')
  })
})

describe('buildSearchCriteria — モード切り替え時の値漏れ (#47)', () => {
  it('地図モードでは自治体モード用の条件を使わない', () => {
    const criteria = buildSearchCriteria(baseState({
      bbox: SMALL_BBOX,
      municipalitySearch: { category: 'cafe', keyword: 'コーヒー' },
      selectedMunicipality: { code: '27214', name: '高槻市', bbox: SMALL_BBOX },
      simpleSearch: { category: 'school', keyword: '', location: '' }
    }))
    expect(criteria.searchSource).toBe('map')
    expect(criteria.query).toContain('school')
    expect(criteria.query).not.toContain('コーヒー')
  })

  it('自治体モードでは地図モード用の条件を使わない', () => {
    const criteria = buildSearchCriteria(baseState({
      bbox: SMALL_BBOX,
      searchSource: 'municipality',
      selectedMunicipality: { code: '27214', name: '高槻市', bbox: SMALL_BBOX },
      municipalitySearch: { category: 'cafe', keyword: '' },
      simpleSearch: { category: 'school', keyword: '旧校舎', location: '' },
      advancedSearch: { tags: [{ key: 'amenity', value: 'hospital', mode: 'equals' }], keyword: '大学', useAnd: true }
    }))
    expect(criteria.searchSource).toBe('municipality')
    expect(criteria.query).toContain('[amenity=cafe]')
    expect(criteria.query).not.toContain('school')
    expect(criteria.query).not.toContain('旧校舎')
    expect(criteria.query).not.toContain('hospital')
  })

  it('bboxOverride が地図モードのBBOXを上書きする（legacy互換）', () => {
    const override = { south: 35.0, west: 139.0, north: 35.02, east: 139.02 }
    const criteria = buildSearchCriteria(baseState({ bbox: SMALL_BBOX }), { bboxOverride: override })
    expect(criteria.ok).toBe(true)
    expect(criteria.bbox).toEqual(override)
  })
})

describe('buildSearchCriteria — cuisineフィルタ (#54)', () => {
  it('地図モード: レストラン+ラーメン → [amenity=restaurant][cuisine=ramen] がクエリに入る', () => {
    const criteria = buildSearchCriteria(baseState({
      bbox: SMALL_BBOX,
      simpleSearch: { category: 'restaurant', keyword: '', location: '', cuisine: 'ramen' }
    }))
    expect(criteria.ok).toBe(true)
    expect(criteria.cuisine).toBe('ramen')
    expect(criteria.query).toContain('[amenity=restaurant][cuisine=ramen]')
  })

  it('自治体モード: 飲食店+寿司 → 各unionブランチに[cuisine=sushi]が連結される', () => {
    const mun = { code: '26100', name: '高槻市', bbox: SMALL_BBOX }
    const criteria = buildSearchCriteria(baseState({
      searchSource: 'municipality',
      selectedMunicipality: mun,
      municipalitySearch: { category: 'food_drink', keyword: '', cuisine: 'sushi' }
    }))
    expect(criteria.ok).toBe(true)
    expect(criteria.cuisine).toBe('sushi')
    expect(criteria.query).toContain('[cuisine=sushi]')
  })

  it('非飲食カテゴリ+ cuisine: クエリに反映されない（飲食カテゴリのみ有効）', () => {
    const criteria = buildSearchCriteria(baseState({
      bbox: SMALL_BBOX,
      simpleSearch: { category: 'pharmacy', keyword: '', location: '', cuisine: 'ramen' }
    }))
    expect(criteria.ok).toBe(true)
    expect(criteria.query).not.toContain('cuisine')
    expect(criteria.query).toContain('[amenity=pharmacy]')
  })

  it('cuisine未指定時は従来クエリと同一（後方互換）', () => {
    const a = buildSearchCriteria(baseState({
      bbox: SMALL_BBOX,
      simpleSearch: { category: 'restaurant', keyword: '', location: '' }
    }))
    const b = buildSearchCriteria(baseState({
      bbox: SMALL_BBOX,
      simpleSearch: { category: 'restaurant', keyword: '', location: '', cuisine: '' }
    }))
    expect(a.query).toBe(b.query)
    expect(a.query).not.toContain('cuisine')
  })
})
