// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { applyResultFilters, hasActiveFilters } from '../resultFilters'

const results = [
  { id: 1, type: 'node', name: 'Café B', tags: { amenity: 'cafe', name: 'Café B' } },
  { id: 2, type: 'way', name: 'Store A', tags: { shop: 'convenience', name: 'Store A' } },
  { id: 3, type: 'node', name: 'Park C', tags: { leisure: 'park', name: 'Park C' } },
]

const base = { nameFilter: '', typeFilter: 'all', catFilter: '', websiteOnly: false, sortDir: 'none' }

describe('hasActiveFilters', () => {
  it('デフォルト（未使用）フィルタでは false', () => {
    expect(hasActiveFilters(base)).toBe(false)
  })
  it('いずれか1つが設定されていれば true', () => {
    expect(hasActiveFilters({ ...base, nameFilter: 'cafe' })).toBe(true)
    expect(hasActiveFilters({ ...base, typeFilter: 'node' })).toBe(true)
    expect(hasActiveFilters({ ...base, catFilter: 'cafe' })).toBe(true)
    expect(hasActiveFilters({ ...base, websiteOnly: true })).toBe(true)
    expect(hasActiveFilters({ ...base, sortDir: 'asc' })).toBe(true)
  })
})

describe('applyResultFilters', () => {
  it('フィルタ未使用なら元の配列をそのまま返す', () => {
    expect(applyResultFilters(results, base)).toBe(results)
  })

  it('nameFilter で施設名を部分一致フィルタする（大文字小文字無視）', () => {
    const out = applyResultFilters(results, { ...base, nameFilter: 'STORE' })
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe(2)
  })

  it('catFilter は categoryMatchesElement でカテゴリ一致を判定する', () => {
    const out = applyResultFilters(results, { ...base, catFilter: 'cafe' })
    expect(out.map((r) => r.id)).toEqual([1])
  })

  it('typeFilter は OSM要素種別（node/way/relation）で絞り込む', () => {
    const out = applyResultFilters(results, { ...base, typeFilter: 'way' })
    expect(out.map((r) => r.id)).toEqual([2])
  })

  it('websiteOnly は公式サイトが登録されているものだけを残す', () => {
    const withSite = [
      { id: 1, type: 'node', name: 'A', tags: { amenity: 'cafe', name: 'A', website: 'https://a.example' } },
      { id: 2, type: 'node', name: 'B', tags: { amenity: 'cafe', name: 'B' } },
    ]
    const out = applyResultFilters(withSite, { ...base, websiteOnly: true })
    expect(out.map((r) => r.id)).toEqual([1])
  })

  it('sortDir: asc / desc で施設名順に並び替える（無名は「名前のない要素」として末尾寄り）', () => {
    const mixed = [
      { id: 1, type: 'node', name: 'beta', tags: { name: 'beta' } },
      { id: 2, type: 'node', tags: {} },
      { id: 3, type: 'node', name: 'Alpha', tags: { name: 'Alpha' } },
    ]
    // ICU ja照合順: Latin文字 < 日本語文字
    const asc = applyResultFilters(mixed, { ...base, sortDir: 'asc' })
    expect(asc.map((r) => r.id)).toEqual([3, 1, 2])
    const desc = applyResultFilters(mixed, { ...base, sortDir: 'desc' })
    expect(desc.map((r) => r.id)).toEqual([2, 1, 3])
  })

  it('複数のフィルタを同時に適用する', () => {
    const out = applyResultFilters(results, { ...base, typeFilter: 'node', nameFilter: 'park' })
    expect(out.map((r) => r.id)).toEqual([3])
  })
})
