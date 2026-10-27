import { describe, it, expect } from 'vitest'
import {
  CATEGORIES,
  CATEGORY_GROUPS,
  getCategoryById,
  getGroupedCategories,
  categoryToQueryFilter
} from '../../data/categories'

describe('カテゴリの粒度整理（optgroup グループ化）', () => {
  it('5つのドメイングループを返し、計18カテゴリを含む', () => {
    const grouped = getGroupedCategories()
    expect(grouped.length).toBe(5)
    const total = grouped.reduce((n, g) => n + g.categories.length, 0)
    expect(total).toBe(18)
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

  it('ラーメンカテゴリ（AND条件）のクエリ生成は不変', () => {
    const ramen = getCategoryById('ramen')
    expect(ramen.logic).toBe('and')
    const f = categoryToQueryFilter(ramen)
    expect(f.andFilters.length).toBe(2)
    expect(f.andFilters[0]).toBe('cuisine=ramen')
  })
})
