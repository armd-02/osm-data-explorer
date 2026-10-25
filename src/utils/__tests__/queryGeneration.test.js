/**
 * Overpass QL 生成の回帰テスト（Issue #18）
 * - 複数値のOR → 正規表現 key~"^(v1|v2)$"
 * - 複数条件のAND → 連結フィルタ [cond1][cond2]
 * - 複数条件のOR → unionブランチ
 * - exists / not_exists シンタックス
 */
import { describe, it, expect } from 'vitest'
import { buildSimpleQuery, buildAdvancedQuery } from '../overpass'
import { CATEGORIES, categoryToQueryFilter } from '../../data/categories'

const BBOX = { south: 35.0, west: 139.0, north: 35.1, east: 139.1 }

describe('buildSimpleQuery', () => {
  it('カテゴリ指定なし: 全要素クエリ', () => {
    const { query } = buildSimpleQuery(BBOX, '', '')
    // toFixed(6) で小数点以下6桁
    expect(query).toContain('node(35.000000,139.000000,35.100000,139.100000)')
    expect(query).toContain('way(35.000000,139.000000,35.100000,139.100000)')
    expect(query).toContain('relation(35.000000,139.000000,35.100000,139.100000)')
    expect(query).toContain('[out:json][timeout:25]')
  })

  it('単一値カテゴリ: 単純フィルタ', () => {
    const { query } = buildSimpleQuery(BBOX, 'cafe', '')
    // amenity=cafe のフィルタを含む
    expect(query).toContain('amenity=cafe')
    expect(query).toContain('node[')
    expect(query).toContain('way[')
    expect(query).toContain('relation[')
  })

  it('複数値カテゴリ: 正規表現でOR', () => {
    const { query } = buildSimpleQuery(BBOX, 'food_drink', '')
    // 複数値 → 正規表現
    expect(query).toContain('amenity~')
    expect(query).toContain('cafe')
    expect(query).toContain('restaurant')
    expect(query).toContain('fast_food')
  })

  it('複数tagsカテゴリ(OR): unionブランチで分離', () => {
    const { query } = buildSimpleQuery(BBOX, 'convenience', '')
    // shop と amenity が別ブランチ（;で区切り）
    const cat = CATEGORIES.find(c => c.id === 'convenience')
    expect(cat.logic).toBe('or')
    // union内で shop フィルタと amenity フィルタが別ブランチにある
    expect(query).toContain('shop~')
    expect(query).toContain('amenity=convenience')
    // ; でブランチが区切られている
    const unionBody = query.split(';(\n')[1]?.split('\n);')[0] || ''
    expect(unionBody).toContain('shop~')
    expect(unionBody).toContain('amenity=')
  })

  it('ANDカテゴリ(ramen): 連結フィルタ', () => {
    const { query } = buildSimpleQuery(BBOX, 'ramen', '')
    const cat = CATEGORIES.find(c => c.id === 'ramen')
    expect(cat.logic).toBe('and')
    // cuisine と amenity が同じ node/way/relation に連結
    expect(query).toContain('cuisine=ramen')
    expect(query).toContain('amenity~')
    // 連結フィルタ: [cuisine=ramen][amenity~...]
    expect(query).toContain('[cuisine=ramen][amenity~')
  })
})

describe('buildAdvancedQuery', () => {
  it('単一条件(equals): 単純フィルタ', () => {
    const tags = [{ key: 'amenity', value: 'cafe', mode: 'equals' }]
    const { query } = buildAdvancedQuery(BBOX, tags, '', true)
    expect(query).toContain('[amenity=cafe]')
    expect(query).toContain('node[amenity=cafe]')
  })

  it('複数条件(AND): 連結フィルタ', () => {
    const tags = [
      { key: 'amenity', value: 'restaurant', mode: 'equals' },
      { key: 'cuisine', value: 'ramen', mode: 'equals' }
    ]
    const { query } = buildAdvancedQuery(BBOX, tags, '', true)
    // [amenity=restaurant][cuisine=ramen] の連結
    expect(query).toContain('[amenity=restaurant][cuisine=ramen]')
  })

  it('複数条件(OR): unionブランチ', () => {
    const tags = [
      { key: 'amenity', value: 'cafe', mode: 'equals' },
      { key: 'shop', value: 'supermarket', mode: 'equals' }
    ]
    const { query } = buildAdvancedQuery(BBOX, tags, '', false)
    // 各条件が別ブランチ（;区切り）
    expect(query).toContain('[amenity=cafe]')
    expect(query).toContain('[shop=supermarket]')
    // ; でブランチ区切り
    expect(query).toContain('node[amenity=cafe]')
    expect(query).toContain('node[shop=supermarket]')
  })

  it('existsモード', () => {
    const tags = [{ key: 'phone', value: '', mode: 'exists' }]
    const { query } = buildAdvancedQuery(BBOX, tags, '', true)
    expect(query).toContain('[phone=*]')
  })

  it('not_existsモード', () => {
    const tags = [{ key: 'website', value: '', mode: 'not_exists' }]
    const { query } = buildAdvancedQuery(BBOX, tags, '', true)
    expect(query).toContain('[!website]')
  })

  it('特殊文字を含む値: 引用符で囲む', () => {
    const tags = [{ key: 'name', value: 'Cafe, Bar', mode: 'equals' }]
    const { query } = buildAdvancedQuery(BBOX, tags, '', true)
    expect(query).toContain('[name="Cafe, Bar"]')
  })
})

describe('categoryToQueryFilter', () => {
  it('単一tags + 単一値 → unionFilters 1件', () => {
    const cat = CATEGORIES.find(c => c.id === 'cafe')
    const result = categoryToQueryFilter(cat)
    expect(result.unionFilters).toHaveLength(1)
    expect(result.unionFilters[0]).toBe('[amenity=cafe]')
    expect(result.andFilter).toBe('')
  })

  it('単一tags + 複数値 → 正規表現', () => {
    const cat = CATEGORIES.find(c => c.id === 'food_drink')
    const result = categoryToQueryFilter(cat)
    expect(result.unionFilters).toHaveLength(1)
    expect(result.unionFilters[0]).toContain('amenity~')
    expect(result.unionFilters[0]).toContain('cafe')
  })

  it('複数tags + logic=or → unionFilters N件', () => {
    const cat = CATEGORIES.find(c => c.id === 'convenience')
    const result = categoryToQueryFilter(cat)
    expect(result.unionFilters).toHaveLength(2)
    expect(result.andFilter).toBe('')
  })

  it('複数tags + logic=and → andFilter 連結', () => {
    const cat = CATEGORIES.find(c => c.id === 'ramen')
    const result = categoryToQueryFilter(cat)
    expect(result.unionFilters).toHaveLength(0)
    expect(result.andFilter).toContain('[cuisine=ramen]')
    expect(result.andFilter).toContain('[amenity~')
  })
})
