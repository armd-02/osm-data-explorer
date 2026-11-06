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

describe('applyResultFilters: missingFilter（B2: 主要属性の欠落で絞り込み）', () => {
  const full = { type: 'node', id: 20, name: '完全カフェ', tags: { amenity: 'cafe', name: '完全カフェ', phone: '06-1111-1111', opening_hours: 'Mo-Fr 09:00-17:00', website: 'https://full.example', 'addr:street': '梅田1-1' } }
  const noPhone = { type: 'node', id: 21, name: '電話なしカフェ', tags: { amenity: 'cafe', name: '電話なしカフェ', opening_hours: 'Mo-Fr 09:00-17:00', website: 'https://nophone.example', 'addr:street': '梅田2-2' } }
  const noWeb = { type: 'node', id: 22, name: 'サイトなし公園', tags: { leisure: 'park', name: 'サイトなし公園', phone: '06-2222-2222', 'addr:city': '大阪市' } }
  const M = [full, noPhone, noWeb]

  it('特定属性: その属性が未登録の施設だけが残る', () => {
    expect(applyResultFilters(M, { ...BASE, missingFilter: 'phone' }).map(r => r.id)).toEqual([21])
    expect(applyResultFilters(M, { ...BASE, missingFilter: 'website' }).map(r => r.id)).toEqual([22])
    expect(applyResultFilters(M, { ...BASE, missingFilter: 'opening_hours' }).map(r => r.id)).toEqual([22])
    expect(applyResultFilters(M, { ...BASE, missingFilter: 'address' }).map(r => r.id)).toEqual([])
  })

  it('any: いずれかの主要属性が未登録なら残る', () => {
    expect(applyResultFilters(M, { ...BASE, missingFilter: 'any' }).map(r => r.id)).toEqual([21, 22])
  })

  it('none（または未設定）なら全件維持', () => {
    expect(applyResultFilters(M, { ...BASE, missingFilter: 'none' }).map(r => r.id)).toEqual([20, 21, 22])
    expect(applyResultFilters(M, BASE).map(r => r.id)).toEqual([20, 21, 22])
  })

  it('nameFilterと組み合わせられる（名称検索のまま欠落絞り込み）', () => {
    const out = applyResultFilters(M, { ...BASE, missingFilter: 'phone', nameFilter: '電話' })
    expect(out.map(r => r.id)).toEqual([21])
    // 名称一致しても電話があれば除外される
    const out2 = applyResultFilters(M, { ...BASE, missingFilter: 'phone', nameFilter: '完全' })
    expect(out2).toHaveLength(0)
  })

  it('空文字のopening_hoursも未登録扱い（has関数と同一のtruthiness判定）', () => {
    const emptyHours = { type: 'node', id: 23, name: '空営業時間', tags: { amenity: 'cafe', name: '空営業時間', opening_hours: '' } }
    expect(applyResultFilters([emptyHours], { ...BASE, missingFilter: 'opening_hours' })).toHaveLength(1)
  })
})

describe('hasActiveFilters', () => {
  it('purposeFilterのみでもtrue', () => {
    expect(hasActiveFilters({ ...BASE, purposeFilter: '遊ぶ' })).toBe(true)
    expect(hasActiveFilters(BASE)).toBe(false)
  })

  it('missingFilter（B2）がnone以外ならtrue', () => {
    expect(hasActiveFilters({ ...BASE, missingFilter: 'any' })).toBe(true)
    expect(hasActiveFilters({ ...BASE, missingFilter: 'none' })).toBe(false)
  })
})
