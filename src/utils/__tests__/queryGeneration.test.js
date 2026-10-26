/**
 * Overpass QL 生成の回帰テスト（Issue #18）
 * - 二重角括弧 [[ の検出
 * - 正規表現に余分な波括弧 { が混入していないこと
 * - 複数値OR → 正規表現 key~"^(v1|v2)$"
 * - 複数条件AND → 連結フィルタ [cond1][cond2]
 * - 複数条件OR → unionブランチ
 * - exists / not_exists シンタックス
 */
import { describe, it, expect } from 'vitest'
import { buildSimpleQuery, buildAdvancedQuery } from '../overpass'
import { CATEGORIES, categoryToQueryFilter } from '../../data/categories'

const BBOX = { south: 35.0, west: 139.0, north: 35.1, east: 139.1 }
const BBOX_STR = '35.000000,139.000000,35.100000,139.100000'

/**
 * 生成されたクエリがOverpass QLとして構文的に妥当であることを検証
 */
function assertValidOverpassQL(query) {
  // 二重角括弧 [[ が存在しない
  expect(query).not.toContain('[[')
  // 閉じ角括弧の二重 ]] が存在しない
  expect(query).not.toContain(']]')
  // 正規表現内に余分な波括弧 { } が存在しない
  // （~"..." の中に { や } が入ると正規表現の意味が変わる）
  const regexParts = query.match(/~"([^"]*)"/g) || []
  for (const part of regexParts) {
    const content = part.slice(2, -1) // ~" を除去
    expect(content).not.toContain('{')
    expect(content).not.toContain('}')
  }
}

describe('buildSimpleQuery', () => {
  it('カテゴリ指定なし: 全要素クエリ', () => {
    const { query } = buildSimpleQuery(BBOX, '', '')
    expect(query).toContain(`node(${BBOX_STR})`)
    expect(query).toContain(`way(${BBOX_STR})`)
    expect(query).toContain(`relation(${BBOX_STR})`)
    expect(query).toContain('[out:json][timeout:25]')
    assertValidOverpassQL(query)
  })

  it('単一値カテゴリ(cafe): 単純フィルタで有効なQL', () => {
    const { query } = buildSimpleQuery(BBOX, 'cafe', '')
    expect(query).toContain(`node[amenity=cafe](${BBOX_STR})`)
    expect(query).toContain(`way[amenity=cafe](${BBOX_STR})`)
    expect(query).toContain(`relation[amenity=cafe](${BBOX_STR})`)
    assertValidOverpassQL(query)
  })

  it('複数値カテゴリ(food_drink): 正規表現でOR、二重括弧なし', () => {
    const { query } = buildSimpleQuery(BBOX, 'food_drink', '')
    // 正規表現が ^(...) 形式で、余分な波括弧なし
    expect(query).toContain('amenity~"^(cafe|restaurant|fast_food|bar|pub|izakaya|sushi|food_court)$"')
    expect(query).toContain(`node[amenity~`)
    // 二重括弧がない
    assertValidOverpassQL(query)
    // 波括弧が正規表現内にない
    expect(query).not.toContain('^{')
  })

  it('複数tagsカテゴリ(OR): unionブランチ、各フィルタに角括弧1つ', () => {
    const { query } = buildSimpleQuery(BBOX, 'convenience', '')
    // shop と amenity が別ブランチ
    expect(query).toContain(`node[shop~"^(convenience|supermarket)$"](${BBOX_STR});`)
    expect(query).toContain(`node[amenity=convenience](${BBOX_STR});`)
    assertValidOverpassQL(query)
  })

  it('ANDカテゴリ(ramen): 連結フィルタ [f1][f2]', () => {
    const { query } = buildSimpleQuery(BBOX, 'ramen', '')
    // cuisine と amenity が同じ行に連結
    expect(query).toContain(`node[cuisine=ramen][amenity~"^(restaurant|fast_food)$"](${BBOX_STR});`)
    expect(query).toContain(`way[cuisine=ramen][amenity~"^(restaurant|fast_food)$"](${BBOX_STR});`)
    assertValidOverpassQL(query)
  })
})

describe('buildAdvancedQuery', () => {
  it('単一条件(equals): node[amenity=cafe]', () => {
    const tags = [{ key: 'amenity', value: 'cafe', mode: 'equals' }]
    const { query } = buildAdvancedQuery(BBOX, tags, '', true)
    expect(query).toContain(`node[amenity=cafe](${BBOX_STR})`)
    assertValidOverpassQL(query)
  })

  it('複数条件(AND): [f1][f2] 連結', () => {
    const tags = [
      { key: 'amenity', value: 'restaurant', mode: 'equals' },
      { key: 'cuisine', value: 'ramen', mode: 'equals' }
    ]
    const { query } = buildAdvancedQuery(BBOX, tags, '', true)
    expect(query).toContain(`node[amenity=restaurant][cuisine=ramen](${BBOX_STR})`)
    assertValidOverpassQL(query)
  })

  it('複数条件(OR): 別ブランチ', () => {
    const tags = [
      { key: 'amenity', value: 'cafe', mode: 'equals' },
      { key: 'shop', value: 'supermarket', mode: 'equals' }
    ]
    const { query } = buildAdvancedQuery(BBOX, tags, '', false)
    expect(query).toContain(`node[amenity=cafe](${BBOX_STR});`)
    expect(query).toContain(`node[shop=supermarket](${BBOX_STR});`)
    assertValidOverpassQL(query)
  })

  it('existsモード: [phone]', () => {
    const tags = [{ key: 'phone', value: '', mode: 'exists' }]
    const { query } = buildAdvancedQuery(BBOX, tags, '', true)
    expect(query).toContain(`node[phone](${BBOX_STR})`)
    assertValidOverpassQL(query)
  })

  it('not_existsモード: [!website]', () => {
    const tags = [{ key: 'website', value: '', mode: 'not_exists' }]
    const { query } = buildAdvancedQuery(BBOX, tags, '', true)
    expect(query).toContain(`node[!website](${BBOX_STR})`)
    assertValidOverpassQL(query)
  })

  it('特殊文字を含む値: 引用符で囲む', () => {
    const tags = [{ key: 'name', value: 'Cafe, Bar', mode: 'equals' }]
    const { query } = buildAdvancedQuery(BBOX, tags, '', true)
    expect(query).toContain(`node[name="Cafe, Bar"](${BBOX_STR})`)
    assertValidOverpassQL(query)
  })

  it('コロン含むキー: 安全にエスケープ', () => {
    const tags = [{ key: 'addr:street', value: '十三1-1', mode: 'equals' }]
    const { query } = buildAdvancedQuery(BBOX, tags, '', true)
    expect(query).toContain(`node[addr:street=十三1-1](${BBOX_STR})`)
    assertValidOverpassQL(query)
  })

  it('スペース含む値: 引用符で囲む', () => {
    const tags = [{ key: 'name', value: 'Cafe ABC', mode: 'equals' }]
    const { query } = buildAdvancedQuery(BBOX, tags, '', true)
    expect(query).toContain(`node[name="Cafe ABC"](${BBOX_STR})`)
    assertValidOverpassQL(query)
  })
})

describe('categoryToQueryFilter', () => {
  it('単一tags + 単一値 → unionFilters 1件（括弧なし）', () => {
    const cat = CATEGORIES.find(c => c.id === 'cafe')
    const result = categoryToQueryFilter(cat)
    expect(result.unionFilters).toHaveLength(1)
    expect(result.unionFilters[0]).toBe('amenity=cafe')
    // 括弧を含まない
    expect(result.unionFilters[0]).not.toContain('[')
    expect(result.andFilters).toHaveLength(0)
  })

  it('単一tags + 複数値 → 正規表現（余分な波括弧なし）', () => {
    const cat = CATEGORIES.find(c => c.id === 'food_drink')
    const result = categoryToQueryFilter(cat)
    expect(result.unionFilters).toHaveLength(1)
    // 正規表現が ^(v1|v2|...)$ 形式
    expect(result.unionFilters[0]).toBe('amenity~"^(cafe|restaurant|fast_food|bar|pub|izakaya|sushi|food_court)$"')
    // 波括弧を含まない
    expect(result.unionFilters[0]).not.toContain('{')
  })

  it('複数tags + logic=or → unionFilters N件（括弧なし）', () => {
    const cat = CATEGORIES.find(c => c.id === 'convenience')
    const result = categoryToQueryFilter(cat)
    expect(result.unionFilters).toHaveLength(2)
    expect(result.unionFilters[0]).toContain('shop~')
    expect(result.unionFilters[1]).toBe('amenity=convenience')
    // 括弧を含まない
    for (const f of result.unionFilters) {
      expect(f).not.toContain('[')
    }
    expect(result.andFilters).toHaveLength(0)
  })

  it('複数tags + logic=and → andFilters 配列（括弧なし）', () => {
    const cat = CATEGORIES.find(c => c.id === 'ramen')
    const result = categoryToQueryFilter(cat)
    expect(result.unionFilters).toHaveLength(0)
    expect(result.andFilters).toHaveLength(2)
    expect(result.andFilters[0]).toBe('cuisine=ramen')
    expect(result.andFilters[1]).toContain('amenity~')
    // 括弧を含まない
    for (const f of result.andFilters) {
      expect(f).not.toContain('[')
    }
  })

  it('全カテゴリで二重括弧・余分な波括弧を生成しない', () => {
    for (const cat of CATEGORIES) {
      const result = categoryToQueryFilter(cat)
      const allFilters = [...result.unionFilters, ...result.andFilters]
      for (const f of allFilters) {
        // 角括弧を含まない（クエリ生成側が追加する）
        expect(f, `${cat.id}: ${f}`).not.toContain('[')
        expect(f, `${cat.id}: ${f}`).not.toContain(']')
        // 正規表現内に波括弧がない
        if (f.includes('~')) {
          const regexMatch = f.match(/~"([^"]*)"/)
          if (regexMatch) {
            expect(regexMatch[1], `${cat.id}: regex content`).not.toContain('{')
            expect(regexMatch[1], `${cat.id}: regex content`).not.toContain('}')
          }
        }
      }
    }
  })
})
