import { describe, it, expect, vi } from 'vitest'

// getCategoryById をモックして、カテゴリ定義がなくても
// 'or'/'and' 両ロジックの判定をテストできる。
const mockCategories = new Map()
vi.mock('../../data/categories', () => ({
  getCategoryById: (id) => mockCategories.get(id) || null,
}))

import { categoryMatchesElement } from '../categoryMatch'

const el = (tags) => ({ type: 'node', id: 1, tags })

describe('categoryMatchesElement (#59)', () => {
  it('未設定カテゴリ（空）は常にfalse', () => {
    expect(categoryMatchesElement('', el({ amenity: 'cafe' }))).toBe(false)
    expect(categoryMatchesElement(null, el({ amenity: 'cafe' }))).toBe(false)
  })

  it('存在しないカテゴリIDはfalse', () => {
    mockCategories.clear()
    expect(categoryMatchesElement('nope', el({ amenity: 'cafe' }))).toBe(false)
  })

  it("logic 'or' + 複数値: いずれかの値が一致すればtrue", () => {
    mockCategories.set('food_drink', {
      id: 'food_drink',
      tags: [{ key: 'amenity', values: ['cafe', 'restaurant', 'fast_food'] }],
      logic: 'or',
    })
    expect(categoryMatchesElement('food_drink', el({ amenity: 'cafe' }))).toBe(true)
    expect(categoryMatchesElement('food_drink', el({ amenity: 'fast_food' }))).toBe(true)
    expect(categoryMatchesElement('food_drink', el({ amenity: 'fuel' }))).toBe(false)
  })

  it("logic 'or' + 複数tags: 1つのtagでも合えばtrue", () => {
    mockCategories.set('pharmacy', {
      id: 'pharmacy',
      tags: [
        { key: 'amenity', values: ['pharmacy'] },
        { key: 'shop', values: ['drugstore'] },
      ],
      logic: 'or',
    })
    expect(categoryMatchesElement('pharmacy', el({ shop: 'drugstore' }))).toBe(true)
    expect(categoryMatchesElement('pharmacy', el({ amenity: 'pharmacy' }))).toBe(true)
    expect(categoryMatchesElement('pharmacy', el({ shop: 'bakery' }))).toBe(false)
  })

  it("logic 'and': 全tagsが一致してはじめてtrue", () => {
    mockCategories.set('test_and', {
      id: 'test_and',
      tags: [
        { key: 'amenity', values: ['cafe'] },
        { key: 'cuisine', values: ['coffee'] },
      ],
      logic: 'and',
    })
    expect(categoryMatchesElement('test_and', el({ amenity: 'cafe', cuisine: 'coffee' }))).toBe(true)
    expect(categoryMatchesElement('test_and', el({ amenity: 'cafe' }))).toBe(false)
    expect(categoryMatchesElement('test_and', el({ amenity: 'restaurant', cuisine: 'coffee' }))).toBe(false)
  })

  it('tagsが 없는要素でもクラッシュしない', () => {
    mockCategories.set('cafe', {
      id: 'cafe',
      tags: [{ key: 'amenity', values: ['cafe'] }],
      logic: 'or',
    })
    expect(categoryMatchesElement('cafe', {})).toBe(false)
    expect(categoryMatchesElement('cafe', { type: 'node', id: 1 })).toBe(false)
  })
})
