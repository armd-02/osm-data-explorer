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
import { CATEGORIES, categoryToQueryFilter, getCategoriesForPurpose, getPurposeUnionFilters } from '../../data/categories'

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
  it('カテゴリ指定なし: POI対象タグに限定（#44: 道路・建物等の全地物取得をしない）', () => {
    const { query } = buildSimpleQuery(BBOX, '', '')
    expect(query).toContain(`node[amenity](${BBOX_STR});`)
    expect(query).toContain(`way[shop](${BBOX_STR});`)
    expect(query).toContain(`way[healthcare](${BBOX_STR});`)
    expect(query).not.toContain(`node(${BBOX_STR})`)
    expect(query).not.toContain(`relation[amenity]`)
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

  it('(#54) 旧ラーメンカテゴリIDは未知カテゴリとして扱い、cuisineフィルタと併せて無視される', () => {
    // 旧URL c=ramen は urlState 層で restaurant+cu=ramen にマッピングされる。
    // 万一 'ramen' が直接渡されても（未知ID）、クエリ生成は安全に退化する。
    // (#44) カテゴリ未指定と同様にPOI対象に限定される。
    const { query } = buildSimpleQuery(BBOX, 'ramen', '', 'ramen')
    expect(query).not.toContain('cuisine')
    expect(query).toContain(`node[amenity](${BBOX_STR});`)
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
    // (#54) 旧ramenカテゴリは削除されたため、合成カテゴリでANDパスを検証
    const cat = {
      tags: [
        { key: 'cuisine', values: ['ramen'] },
        { key: 'amenity', values: ['restaurant', 'fast_food'] }
      ],
      logic: 'and'
    }
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

describe('categoryToQueryFilter — 教育施設サブカテゴリ (#44)', () => {
  const filterOf = (id) => categoryToQueryFilter(CATEGORIES.find(c => c.id === id))

  it('幼稚園: amenity/education/school の kindergarten を union 化', () => {
    const r = filterOf('kindergarten')
    expect(r.unionFilters.sort()).toEqual([
      'amenity=kindergarten',
      'education=kindergarten',
      'school=kindergarten'
    ])
    expect(r.andFilters).toHaveLength(0)
  })

  it('小学校: school=primary 等の厳密条件のみ', () => {
    const r = filterOf('primary_school')
    expect(r.unionFilters.sort()).toEqual([
      'amenity=primary_school',
      'education=primary_school',
      'school=primary'
    ])
  })

  it('大学・短大: amenity/education の複数値が正規表現にまとまる', () => {
    const r = filterOf('university')
    expect(r.unionFilters).toContain('amenity~"^(university|college)$"')
    expect(r.unionFilters).toContain('education~"^(university|college)$"')
    expect(r.unionFilters).toContain('university~"^(yes|faculty)$"')
    expect(r.unionFilters).toHaveLength(3)
  })

  it('予備校・塾: prep_school・language_school・office=educational_institution', () => {
    const r = filterOf('prep_school')
    expect(r.unionFilters).toContain('amenity~"^(prep_school|language_school)$"')
    expect(r.unionFilters).toContain('education~"^(prep_school|language_school)$"')
    expect(r.unionFilters).toContain('office=educational_institution')
    expect(r.unionFilters).toHaveLength(3)
  })

  it('学校・教育施設（汎用）: 幼稚園・大学等の条件を含まない', () => {
    const r = filterOf('school')
    expect(r.unionFilters.sort()).toEqual([
      'amenity=school',
      'education=school',
      'leisure=common',
      'school~"^(middle|high|yes)$"'
    ])
    for (const f of r.unionFilters) {
      expect(f).not.toContain('kindergarten')
      expect(f).not.toContain('university')
      expect(f).not.toContain('prep_school')
    }
  })

  it('学ぶ目的のunionに全5カテゴリの条件が重複除去されて含まれる', () => {
    const cats = getCategoriesForPurpose('学ぶ')
    expect(cats).toHaveLength(5)
    const filters = getPurposeUnionFilters('学ぶ')
    expect(filters).toContain('amenity=kindergarten')
    expect(filters).toContain('school=primary')
    expect(filters).toContain('amenity~"^(university|college)$"')
    expect(filters).toContain('amenity~"^(prep_school|language_school)$"')
    expect(filters).toContain('amenity=school')
    // 重複除去: amenity=school は1回のみ
    expect(filters.filter((f) => f === 'amenity=school')).toHaveLength(1)
  })
})
