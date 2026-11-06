/**
 * (A3) カテゴリ別情報設計のテスト
 *
 * カテゴリごとに「意味のある属性」のプロファイルを持ち、
 * 登録済みの情報のみ・カテゴリ相応の属性のみを返すことを確認する。
 */
import { describe, it, expect } from 'vitest'
import { keyInfoFor, profileFor } from '../categoryProfiles'

describe('keyInfoFor (A3)', () => {
  it('カフェ: プロファイル順に登録済み属性を返す（cuisineを含む）', () => {
    const ki = keyInfoFor({
      type: 'node', id: 1,
      tags: {
        amenity: 'cafe', name: 'カフェA',
        cuisine: 'japanese', opening_hours: 'Mo-Fr 09:00-17:00',
        phone: '06-1111-1111', 'addr:city': '大阪市'
      }
    })
    expect(ki.categoryId).toBe('cafe')
    expect(ki.icon).toBe('☕')
    expect(ki.items.map((i) => i.key)).toEqual(['address', 'phone', 'opening_hours', 'cuisine'])
    expect(ki.items.find((i) => i.key === 'cuisine').text).toBe('🍴 japanese')
  })

  it('未登録の属性は返さない（捏造しない）', () => {
    const ki = keyInfoFor({ type: 'node', id: 2, tags: { amenity: 'pharmacy' } })
    expect(ki.categoryId).toBe('pharmacy')
    expect(ki.items).toEqual([])
  })

  it('公共トイレ: 電話・Web・営業時間は意味がないため対象外', () => {
    const ki = keyInfoFor({
      type: 'node', id: 3,
      tags: {
        amenity: 'toilets',
        phone: '06-2222-2222', website: 'https://toilet.example',
        opening_hours: '24/7', 'addr:city': '北区'
      }
    })
    expect(ki.categoryId).toBe('toilets')
    const keys = ki.items.map((i) => i.key)
    expect(keys).toEqual(['address'])
  })

  it('交通（駅）: 営業時間は対象外属性', () => {
    const ki = keyInfoFor({
      type: 'node', id: 4,
      tags: { railway: 'station', opening_hours: '05:00-24:00' }
    })
    expect(ki.categoryId).toBe('transport')
    expect(ki.items.map((i) => i.key)).not.toContain('opening_hours')
  })

  it('公共施設: wheelchairをハイライト属性として含む', () => {
    const ki = keyInfoFor({
      type: 'node', id: 5,
      tags: { amenity: 'library', opening_hours: 'Mo-Su 09:00-18:00', wheelchair: 'yes' }
    })
    expect(ki.categoryId).toBe('public_facility')
    const wc = ki.items.find((i) => i.key === 'wheelchair')
    expect(wc).toBeTruthy()
    expect(wc.text).toBe('♿ 車椅子対応')
  })

  it('どのカテゴリにも該当しなければDEFAULTプロファイルを使う', () => {
    const ki = keyInfoFor({ type: 'node', id: 6, tags: { amenity: 'bench', phone: '06-3333-3333' } })
    expect(ki.categoryId).toBeNull()
    expect(ki.icon).toBe('📍')
    expect(ki.items.map((i) => i.key)).toEqual(['phone'])
  })
})

describe('profileFor (A3)', () => {
  it('既知カテゴリは該当プロファイル、未知カテゴリはDEFAULT', () => {
    expect(profileFor('cafe').icon).toBe('☕')
    expect(profileFor('museum').icon).toBe('🖼️')
    expect(profileFor('unknown_category').icon).toBe('📍')
    expect(profileFor(null).icon).toBe('📍')
  })
})
