// @vitest-environment jsdom
/**
 * (#44) Overpass取得データに基づくカテゴリ集計
 * - countCategoriesInResults: 結果に出現したカテゴリのみを件数付きで返す
 * - filterGroupsByCounts: 出現カテゴリに絞り込む（選択中カテゴリは必ず残す）
 */
import { describe, it, expect } from 'vitest'
import { countCategoriesInResults, filterGroupsByCounts } from '../resultCategories'
import { getGroupedCategories } from '../../data/categories'

const el = (id, tags) => ({ type: 'node', id, tags })

const cafe = el(1, { amenity: 'cafe', name: 'カフェA' })
const cafe2 = el(2, { amenity: 'cafe', name: 'カフェB' })
const park = el(3, { leisure: 'park', name: '中央公園' })
const books = el(4, { shop: 'books', name: '書店' })
const unnamed = el(5, { })

describe('countCategoriesInResults', () => {
  it('空配列・非配列は空オブジェクトを返す', () => {
    expect(countCategoriesInResults([])).toEqual({})
    expect(countCategoriesInResults(null)).toEqual({})
    expect(countCategoriesInResults(undefined)).toEqual({})
  })

  it('結果に出現したカテゴリだけ件数付きで返す', () => {
    const counts = countCategoriesInResults([cafe, cafe2, park, books])
    // food_drink（飲食店すべて）は cafe にも一致する（上位カテゴリ）
    expect(counts).toEqual({ cafe: 2, food_drink: 2, park: 1, retail: 1 })
  })

  it('タグのない要素は集計に含めない', () => {
    const counts = countCategoriesInResults([unnamed, cafe])
    expect(counts).toEqual({ cafe: 1, food_drink: 1 })
  })

  it('同じ要素が複数カテゴリに一致しうる（例: shop+amenity）', () => {
    const counts = countCategoriesInResults([el(9, { amenity: 'cafe', shop: 'convenience', name: 'X' })])
    // cafe(amenity=cafe)とconvenience(shop=convenience)の両方に一致
    expect(counts.cafe).toBe(1)
    expect(counts.convenience).toBe(1)
  })
})

describe('filterGroupsByCounts', () => {
  const groups = getGroupedCategories()

  it('出現しなかったカテゴリを除外する（グループも空なら除外）', () => {
    const filtered = filterGroupsByCounts(groups, { cafe: 2, park: 1 })
    const labels = filtered.flatMap((g) => g.categories.map((c) => c.id))
    expect(labels).toContain('cafe')
    expect(labels).toContain('park')
    expect(labels).not.toContain('restaurant')
    // 「買う」「暮らす」「学ぶ」「その他」は出現なし → グループごと除外
    const groupNames = filtered.map((g) => g.group)
    expect(groupNames).toEqual(['食べる', '遊ぶ'])
    // count が付与される
    const cafeCat = filtered.find((g) => g.group === '食べる').categories.find((c) => c.id === 'cafe')
    expect(cafeCat.count).toBe(2)
  })

  it('選択中カテゴリは count が 0 でも必ず残す', () => {
    const filtered = filterGroupsByCounts(groups, { cafe: 1 }, 'hospital')
    const labels = filtered.flatMap((g) => g.categories.map((c) => c.id))
    expect(labels).toContain('cafe')
    expect(labels).toContain('hospital')
    const hosp = filtered.find((g) => g.group === '暮らす').categories.find((c) => c.id === 'hospital')
    expect(hosp.count).toBe(0)
  })

  it('集計が空で選択もない場合は全グループが除外される', () => {
    expect(filterGroupsByCounts(groups, {})).toEqual([])
  })
})
