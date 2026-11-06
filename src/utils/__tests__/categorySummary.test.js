// @vitest-environment jsdom
/**
 * (集計表) カテゴリ別集計 computeCategorySummary のテスト
 *
 * - カテゴリラベルはアプリのカテゴリ体系（CATEGORIES）のものを使う
 *   （生のOSMタグ値 amenity=cafe などではなく「カフェ」）
 * - 1つの要素が複数のカテゴリに属する場合は各カテゴリに計上
 * - brand タグをキーに内訳を集計し、brand が無い場合は名称にフォールバック
 */
import { describe, it, expect } from 'vitest'
import { computeCategorySummary, computeStatistics, statsToCSV } from '../statistics'

const cafeA = { type: 'node', id: 1, name: 'ファミマコーヒー', tags: { amenity: 'cafe', name: 'ファミマコーヒー', brand: 'ファミリーマート' } }
const cafeB = { type: 'node', id: 2, name: 'ファミマコーヒー', tags: { amenity: 'cafe', name: 'ファミマコーヒー', brand: 'ファミリーマート' } }
const cafeC = { type: 'node', id: 3, name: '山本カフェ', tags: { amenity: 'cafe', name: '山本カフェ' } }
const noName = { type: 'node', id: 4, tags: { amenity: 'cafe' } }
const konbini = { type: 'node', id: 5, name: 'ファミリーマート 北浜店', tags: { shop: 'convenience', name: 'ファミリーマート 北浜店', brand: 'ファミリーマート' } }

const ALL = [cafeA, cafeB, cafeC, noName, konbini]

describe('computeCategorySummary', () => {
  it('カテゴリラベルはCATEGORIESの日本語ラベル（生タグ値ではない）で返す', () => {
    const summary = computeCategorySummary([cafeA])
    const cafe = summary.find(c => c.id === 'cafe')
    expect(cafe.label).toBe('カフェ')
    expect(summary.every(c => !c.label.includes('=') && c.label !== c.id)).toBe(true)
  })

  it('1つの要素が複数のカテゴリに属する場合は各カテゴリに計上する', () => {
    const summary = computeCategorySummary([cafeA])
    // amenity=cafe は「カフェ」と「飲食店（すべて）」の両方に一致
    expect(summary.find(c => c.id === 'cafe').count).toBe(1)
    expect(summary.find(c => c.id === 'food_drink').count).toBe(1)
  })

  it('カテゴリ別件数を件数順に並べる', () => {
    const summary = computeCategorySummary(ALL)
    const ids = summary.map(c => c.id)
    expect(ids[0]).toBe('cafe') // 4件
    expect(summary.find(c => c.id === 'cafe').count).toBe(4)
    expect(summary.find(c => c.id === 'food_drink').count).toBe(4)
    expect(summary.find(c => c.id === 'convenience').count).toBe(1)
    // 降順
    const counts = summary.map(c => c.count)
    expect([...counts].sort((a, b) => b - a)).toEqual(counts)
  })

  it('内訳はbrandタグをキーに集計し、brandが無い場合は名称にフォールバックする', () => {
    const summary = computeCategorySummary(ALL)
    const cafe = summary.find(c => c.id === 'cafe')
    expect(cafe.breakdown).toEqual([
      { name: 'ファミリーマート', count: 2 }, // brand
      { name: '山本カフェ', count: 1 }        // 名称フォールバック
    ])
    // 名称もbrandも無い要素（noName）は件数には入るが内訳には含まれない
    expect(cafe.count).toBe(4)
    expect(cafe.breakdown.reduce((s, b) => s + b.count, 0)).toBe(3)
  })

  it('空の結果・tagsなしの結果は空配列を返す', () => {
    expect(computeCategorySummary([])).toEqual([])
    expect(computeCategorySummary(null)).toEqual([])
    expect(computeCategorySummary([{ type: 'node', id: 9, tags: { name: '謎' } }])).toEqual([])
  })
})

describe('computeStatistics / statsToCSV との連携', () => {
  it('computeStatistics の結果に categorySummary が含まれる', () => {
    const stats = computeStatistics(ALL)
    expect(Array.isArray(stats.categorySummary)).toBe(true)
    expect(stats.categorySummary.find(c => c.id === 'cafe').count).toBe(4)
  })

  it('statsToCSV にカテゴリ別集計・ブランド内訳セクションが含まれる', () => {
    const csv = statsToCSV(computeStatistics(ALL))
    expect(csv).toContain('# カテゴリ別集計')
    expect(csv).toContain('category,count')
    expect(csv).toContain('カフェ,4')
    expect(csv).toContain('# カテゴリ別ブランド内訳 (brandタグ、名称にフォールバック)')
    expect(csv).toContain('category,name,count')
    expect(csv).toContain('カフェ,ファミリーマート,2')
    expect(csv).toContain('カフェ,山本カフェ,1')
  })

  it('カテゴリに分類できない結果のみならCSVに集計表セクションは含めない', () => {
    const csv = statsToCSV(computeStatistics([{ type: 'node', id: 9, tags: { building: 'house' } }]))
    expect(csv).not.toContain('# カテゴリ別集計')
  })
})
