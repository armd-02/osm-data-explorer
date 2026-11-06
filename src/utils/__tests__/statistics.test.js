/**
 * (B1) 属性の充足率計算のテスト
 * computeAttributeCompleteness / DISPLAY_ATTRIBUTES
 */
import { describe, it, expect } from 'vitest'
import {
  computeAttributeCompleteness,
  missingAttributesOf,
  DISPLAY_ATTRIBUTES,
  computeStatistics
} from '../statistics'

const mk = (id, tags = {}, name) => ({
  type: 'node',
  id,
  name: name || `施設${id}`,
  tags: { ...(tags || {}), name: name || `施設${id}` }
})

describe('computeAttributeCompleteness (B1)', () => {
  it('電話: phone と contact:phone の両方をカウントする', () => {
    const results = [
      mk(1, { phone: '06-1111-1111' }),
      mk(2, { 'contact:phone': '06-2222-2222' }),
      mk(3, {})
    ]
    expect(computeAttributeCompleteness(results).phone).toEqual({ present: 2, total: 3 })
  })

  it('営業時間: opening_hours が登録されていればカウントする', () => {
    const results = [
      mk(1, { opening_hours: 'Mo-Fr 09:00-17:00' }),
      mk(2, {})
    ]
    expect(computeAttributeCompleteness(results).opening_hours).toEqual({ present: 1, total: 2 })
  })

  it('Webサイト: scheme付きhttp(s)URLのみ有効（safeWebsite基準）', () => {
    const results = [
      mk(1, { website: 'https://a.example' }),
      mk(2, { official_website: 'http://b.example' }),
      mk(3, { website: 'example.com' }), // schemeなし → 一覧でも表示されないため未登録扱い
      mk(4, {})
    ]
    expect(computeAttributeCompleteness(results).website).toEqual({ present: 2, total: 4 })
  })

  it('住所: formatAddress基準（addr:city/street/suburb/housenumber）でカウントする', () => {
    const results = [
      mk(1, { 'addr:street': '梅田1-1', 'addr:housenumber': '2' }),
      mk(2, { 'addr:city': '大阪市' }),
      mk(3, { 'addr:postcode': '530-0001' }), // 一覧の住所欄には出ないため未登録扱い
      mk(4, {})
    ]
    expect(computeAttributeCompleteness(results).address).toEqual({ present: 2, total: 4 })
  })

  it('空の結果は全属性 total 0 を返す', () => {
    const c = computeAttributeCompleteness([])
    for (const attr of DISPLAY_ATTRIBUTES) {
      expect(c[attr.key]).toEqual({ present: 0, total: 0 })
    }
  })

  it('tagsが未設定の結果でもエラーにならない', () => {
    const results = [{ type: 'node', id: 1, name: 'タグなし' }, mk(2, { phone: '06-1' })]
    const c = computeAttributeCompleteness(results)
    expect(c.phone).toEqual({ present: 1, total: 2 })
  })
})

describe('missingAttributesOf (B2)', () => {
  it('未登録の主要属性のキー配列を返す', () => {
    const r = { type: 'node', id: 1, name: 'カフェ', tags: { amenity: 'cafe', name: 'カフェ', phone: '06-1111-1111' } }
    // 電話のみ登録 → 営業時間・Webサイト・住所が欠落
    expect(missingAttributesOf(r)).toEqual(['opening_hours', 'website', 'address'])
  })

  it('全属性登録済みなら空配列', () => {
    const r = { type: 'node', id: 2, name: '完全', tags: { amenity: 'cafe', name: '完全', phone: '06-1', opening_hours: 'Mo-Fr 09:00', website: 'https://a.example', 'addr:street': 'x' } }
    expect(missingAttributesOf(r)).toEqual([])
  })

  it('tagsなしの結果は全属性欠落', () => {
    expect(missingAttributesOf({ type: 'node', id: 3, name: 'タグなし' })).toHaveLength(4)
  })
})

describe('computeStatistics（#9 既存の欠損分析）との整合', () => {
  it('missingAttributes の phone 件数は B1 の phone 充足数と一致する', () => {
    const results = [
      mk(1, { phone: '06-1111-1111', amenity: 'cafe' }),
      mk(2, { 'contact:phone': '06-2222-2222', amenity: 'cafe' }),
      mk(3, { amenity: 'cafe' })
    ]
    const stats = computeStatistics(results)
    const completeness = computeAttributeCompleteness(results)
    // #9 の CHECK_TAGS は phone のみ判定（contact:phone は集計対象外）のため、
    // B1 の充足数（両方カウント）の方が大きくなることを確認する
    expect(stats.missingAttributes.phone.present).toBe(1)
    expect(completeness.phone.present).toBe(2)
  })
})
