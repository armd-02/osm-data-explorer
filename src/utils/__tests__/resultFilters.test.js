// @vitest-environment jsdom
/**
 * (#44) applyResultFilters / hasActiveFilters: 目的スコープ（purposeFilter）
 */
import { describe, it, expect } from 'vitest'
import { applyResultFilters, hasActiveFilters } from '../resultFilters'

const cafe = { type: 'node', id: 1, tags: { amenity: 'cafe' } }
const park = { type: 'node', id: 2, tags: { leisure: 'park' } }
const hotel = { type: 'way', id: 3, tags: { tourism: 'hotel' } }
const conv = { type: 'node', id: 4, tags: { shop: 'convenience' } }
const RESULTS = [cafe, park, hotel, conv]

const BASE = { nameFilter: '', typeFilter: 'all', catFilter: '', purposeFilter: '', websiteOnly: false, sortDir: 'none' }

describe('applyResultFilters: purposeFilter（目的スコープ）', () => {
  it('遊ぶ: その目的のカテゴリに一致する要素だけが残る', () => {
    const out = applyResultFilters(RESULTS, { ...BASE, purposeFilter: '遊ぶ' })
    // park（公園・広場）と hotel（宿泊施設）は遊ぶグループ、cafe（食べる）/conv（買う）は外れる
    expect(out.map(r => r.id)).toEqual([2, 3])
  })

  it('買う: 小売・コンビニ系だけが残る', () => {
    const out = applyResultFilters(RESULTS, { ...BASE, purposeFilter: '買う' })
    expect(out.map(r => r.id)).toEqual([4])
  })

  it('食べる: cafeだけが残る', () => {
    const out = applyResultFilters(RESULTS, { ...BASE, purposeFilter: '食べる' })
    expect(out.map(r => r.id)).toEqual([1])
  })

  it('未知の目的名はフィルタしない（全件維持）', () => {
    const out = applyResultFilters(RESULTS, { ...BASE, purposeFilter: '存在しない目的' })
    expect(out.map(r => r.id)).toEqual([1, 2, 3, 4])
  })

  it('catFilterとpurposeFilterはANDで効く', () => {
    // cafe（食べる）をcatFilterで選択し、遊ぶのpurposeFilterも設定 → 一致なし
    const out = applyResultFilters(RESULTS, { ...BASE, catFilter: 'cafe', purposeFilter: '遊ぶ' })
    expect(out).toHaveLength(0)
  })

  it('他のフィルタ（nameFilter等）と組み合わせられる', () => {
    // Overpass正規化では tags.name → 顶层name にコピーされる（facilityNameはresult.nameを読む）
    const named = [
      { type: 'node', id: 10, name: '中央公園', tags: { leisure: 'park', name: '中央公園' } },
      { type: 'node', id: 11, name: '北公園', tags: { leisure: 'park', name: '北公園' } }
    ]
    const out = applyResultFilters(named, { ...BASE, purposeFilter: '遊ぶ', nameFilter: '中央' })
    expect(out.map(r => r.id)).toEqual([10])
  })
})

describe('hasActiveFilters', () => {
  it('purposeFilterのみでもtrue', () => {
    expect(hasActiveFilters({ ...BASE, purposeFilter: '遊ぶ' })).toBe(true)
    expect(hasActiveFilters(BASE)).toBe(false)
  })
})
