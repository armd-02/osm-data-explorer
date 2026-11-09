import { describe, it, expect, vi, beforeEach } from 'vitest'

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

describe('categoryMatchesElement — バリアフリーカテゴリ (#62)', () => {
  beforeEach(() => {
    // (#62) バリアフリーカテゴリはOSMタグ条件を持たない（tags: []）
    mockCategories.set('barrier_free', { id: 'barrier_free', tags: [], logic: 'or' })
    mockCategories.set('cafe', {
      id: 'cafe',
      tags: [{ key: 'amenity', values: ['cafe'] }],
      logic: 'or',
    })
  })

  it('barrier_free は bf フィールドを持つ要素（正規化済みバリアフリー結果）に一致する', () => {
    const bfResult = { type: 'way', id: 100, tags: { highway: 'footway' }, bf: { kind: 'way' } }
    expect(categoryMatchesElement('barrier_free', bfResult)).toBe(true)
  })

  it('bf フィールドが無い要素には一致しない（tags: [] の generic 判定で通らない）', () => {
    const facilityResult = { type: 'node', id: 1, tags: { amenity: 'cafe' } }
    expect(categoryMatchesElement('barrier_free', facilityResult)).toBe(false)
  })

  it('bf 要素でも他のカテゴリは通常通りタグで判定される（bf の影響を受けない）', () => {
    const bfResult = { type: 'way', id: 100, tags: { highway: 'footway' }, bf: { kind: 'way' } }
    expect(categoryMatchesElement('cafe', bfResult)).toBe(false)
    expect(categoryMatchesElement('cafe', el({ amenity: 'cafe' }))).toBe(true)
  })

  it('要素が null/undefined でもクラッシュしない', () => {
    expect(categoryMatchesElement('barrier_free', null)).toBe(false)
    expect(categoryMatchesElement('barrier_free', undefined)).toBe(false)
  })
})
