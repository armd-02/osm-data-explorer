// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import MobileFacilityCard, { facilityName, formatAddress, safeWebsite } from '../MobileFacilityCard'

/**
 * (#59) モバイル施設カード
 * - 名称・タイプバッジ・主要タグ（最大3）・住所・OSM ID
 * - 未登録の情報を捏造しない
 * - タップで onOpen(result)
 */

afterEach(() => cleanup())

const COFFEE = {
  type: 'node', id: 1001, lat: 34.85, lon: 135.5,
  name: 'テスト珈琲店', // overpass.js が tags.name を上位に正規化した結果を模す
  tags: {
    name: 'テスト珈琲店', amenity: 'cafe', cuisine: 'coffee',
    'addr:city': '大阪市', 'addr:suburb': '梅田', 'addr:street': '1-1', 'addr:housenumber': '12',
  },
}

describe('ユーティリティ関数', () => {
  it('facilityName: name → name:ja → フォールバックの順で解決する', () => {
    expect(facilityName(COFFEE)).toBe('テスト珈琲店')
    expect(facilityName({ tags: { 'name:ja': '日本語名' } })).toBe('日本語名')
    expect(facilityName({})).toBe('名前のない要素')
  })

  it('formatAddress: city→suburb→street→housenumber の順に連結する', () => {
    expect(formatAddress(COFFEE.tags)).toBe('大阪市 梅田 1-1 12')
    expect(formatAddress({ 'addr:street': '番地なし' })).toBe('番地なし')
    expect(formatAddress({})).toBe('')
    expect(formatAddress(null)).toBe('')
  })

  it('safeWebsite: http(s) URL のみ返し、それ以外はnull', () => {
    expect(safeWebsite({ website: 'https://example.com' })).toBe('https://example.com')
    expect(safeWebsite({ official_website: 'http://example.jp' })).toBe('http://example.jp')
    expect(safeWebsite({ website: 'example.com' })).toBeNull()
    expect(safeWebsite({})).toBeNull()
    expect(safeWebsite(null)).toBeNull()
  })
})

describe('MobileFacilityCard', () => {
  it('名称・住所・OSM ID・主要タグが表示される', () => {
    render(<MobileFacilityCard result={COFFEE} onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: /テスト珈琲店/ })).toBeTruthy()
    expect(screen.getByText(/大阪市 梅田 1-1 12/)).toBeTruthy()
    expect(screen.getByText('node/1001')).toBeTruthy()
    // 主要タグは値で表示される（amenity=cafe, cuisine=coffee）
    expect(screen.getByText('cafe')).toBeTruthy()
    expect(screen.getByText('coffee')).toBeTruthy()
  })

  it('主要タグは最大3件まで表示される', () => {
    const many = {
      type: 'node', id: 1, lat: 0, lon: 0,
      tags: {
        name: '多タグ施設', amenity: 'cafe', shop: 'bakery', tourism: 'museum',
        leisure: 'park', sport: 'swimming', office: 'company', building: 'yes', cuisine: 'coffee',
      },
    }
    render(<MobileFacilityCard result={many} onOpen={vi.fn()} />)
    // KEY_TAG_ORDER 先頭3つ（amenity/shop/tourism）の値のみ表示
    expect(screen.getByText('cafe')).toBeTruthy()
    expect(screen.getByText('bakery')).toBeTruthy()
    expect(screen.getByText('museum')).toBeTruthy()
    // 4つ目以降（leisure/sport/…）は表示されない
    expect(screen.queryByText('park')).toBeNull()
    expect(screen.queryByText('swimming')).toBeNull()
    expect(screen.queryByText('coffee')).toBeNull()
  })

  it('未登録の情報は表示されない（捏造しない）', () => {
    const bare = { type: 'node', id: 9, lat: 34.8, lon: 135.5, tags: { amenity: 'bench' } }
    render(<MobileFacilityCard result={bare} onOpen={vi.fn()} />)
    // 名称はフォールバック、住所は非表示
    expect(screen.getByRole('button', { name: /名前のない要素/ })).toBeTruthy()
    expect(screen.queryByText(/大阪市/)).toBeNull()
  })

  it('タップで onOpen(result) が呼ばれる', () => {
    const onOpen = vi.fn()
    render(<MobileFacilityCard result={COFFEE} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: /テスト珈琲店/ }))
    expect(onOpen).toHaveBeenCalledWith(COFFEE)
  })
})
