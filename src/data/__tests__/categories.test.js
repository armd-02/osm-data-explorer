import { describe, it, expect } from 'vitest'
import {
  CATEGORIES,
  CATEGORY_GROUPS,
  CUISINES,
  getCategoryById,
  getGroupedCategories,
  categoryToQueryFilter,
  isFoodCategory,
  getCategoriesForPurpose,
  getPurposeOfCategory
} from '../../data/categories'

describe('カテゴリの目的ベースグループ化（#44 生活者目線UI）', () => {
  it('6つの目的グループ（食べる・買う・遊ぶ・暮らす・学ぶ・その他）を返し、計19カテゴリを含む', () => {
    const grouped = getGroupedCategories()
    expect(grouped.length).toBe(6)
    expect(grouped.map((g) => g.group)).toEqual(['食べる', '買う', '遊ぶ', '暮らす', '学ぶ', 'その他'])
    const total = grouped.reduce((n, g) => n + g.categories.length, 0)
    expect(total).toBe(19)
  })

  it('グループ間・グループ内でIDが重複しておらず、すべてCATEGORIESに存在する', () => {
    const ids = getGroupedCategories().flatMap((g) => g.categories.map((c) => c.id))
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(getCategoryById(id)).toBeTruthy()
    }
    // グループ表示の集合 === CATEGORIES の集合（漏れ・余計な追加がない）
    expect(ids.sort()).toEqual(CATEGORIES.map((c) => c.id).sort())
  })

  it('グループ名とグループ内順序がCATEGORY_GROUPS定義（広い→狭い）と一致する', () => {
    const grouped = getGroupedCategories()
    grouped.forEach((g, i) => {
      expect(g.group).toBe(CATEGORY_GROUPS[i].name)
      expect(g.categories.map((c) => c.id)).toEqual(CATEGORY_GROUPS[i].ids)
    })
  })

  it('完全に重複するサブセットエントリ（supermarket, gas_station）は削除済み', () => {
    const ids = CATEGORIES.map((c) => c.id)
    expect(ids).not.toContain('supermarket')
    expect(ids).not.toContain('gas_station')
  })

  it('(#54) ラーメンカテゴリは削除済みで、cuisineは独立フィルタ（CUISINES）として扱う', () => {
    // カテゴリからラーメンが削除されている
    expect(getCategoryById('ramen')).toBeNull()
    expect(CATEGORIES.map((c) => c.id)).not.toContain('ramen')

    // cuisineフィルタは独立次元: ラーメン・うどんを含む
    const values = CUISINES.map((c) => c.value)
    expect(values).toContain('ramen')
    expect(values).toContain('udon')
    // 値が一意
    expect(new Set(values).size).toBe(values.length)
    // ラベルがすべて日本語
    for (const c of CUISINES) {
      expect(c.label).toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/)
    }
  })

  it('(#54) 「食べる」グループはamenity粒度の5種（food_drinkが合集合、残りは単一タイプ）', () => {
    const foodGroup = CATEGORY_GROUPS.find((g) => g.name === '食べる')
    expect(foodGroup.ids).toEqual(['food_drink', 'cafe', 'restaurant', 'fast_food', 'bar_izakaya'])

    // 単一タイプカテゴリはamenity=1値のフィルタ
    const cafe = categoryToQueryFilter(getCategoryById('cafe'))
    expect(cafe.unionFilters).toEqual(['amenity=cafe'])
    const ff = categoryToQueryFilter(getCategoryById('fast_food'))
    expect(ff.unionFilters).toEqual(['amenity=fast_food'])
    // バー・居酒屋は3値OR
    const bar = categoryToQueryFilter(getCategoryById('bar_izakaya'))
    expect(bar.unionFilters[0]).toBe('amenity~"^(bar|pub|izakaya)$"')
  })

  it('(#54) isFoodCategory: 「食べる」グループのみtrue、それ以外はfalse', () => {
    for (const id of ['food_drink', 'cafe', 'restaurant', 'fast_food', 'bar_izakaya']) {
      expect(isFoodCategory(id)).toBe(true)
    }
    for (const id of ['retail', 'pharmacy', 'school', 'transport', 'bank', '', null, 'ramen']) {
      expect(isFoodCategory(id)).toBe(false)
    }
  })

  it('(#44) getCategoriesForPurpose: 目的名からカテゴリ一覧を取得、未知の目的はnull', () => {
    const eat = getCategoriesForPurpose('食べる')
    expect(eat.map((c) => c.id)).toEqual(['food_drink', 'cafe', 'restaurant', 'fast_food', 'bar_izakaya'])
    const live = getCategoriesForPurpose('暮らす')
    expect(live.map((c) => c.id)).toEqual(['public_facility', 'hospital', 'pharmacy', 'bank', 'toilets'])
    expect(getCategoriesForPurpose('存在しない目的')).toBeNull()
  })

  it('(#44) getPurposeOfCategory: カテゴリ→目的グループ名を解決できる', () => {
    expect(getPurposeOfCategory('cafe')).toBe('食べる')
    expect(getPurposeOfCategory('convenience')).toBe('買う')
    expect(getPurposeOfCategory('park')).toBe('遊ぶ')
    expect(getPurposeOfCategory('hospital')).toBe('暮らす')
    expect(getPurposeOfCategory('school')).toBe('学ぶ')
    expect(getPurposeOfCategory('transport')).toBe('その他')
    expect(getPurposeOfCategory('ramen')).toBeNull()
  })

  it('(#44) すべての目的グループにicon（emoji）が付与されている', () => {
    for (const g of CATEGORY_GROUPS) {
      expect(g.icon).toBeTruthy()
      expect(g.icon.length).toBeGreaterThan(0)
    }
  })
})
