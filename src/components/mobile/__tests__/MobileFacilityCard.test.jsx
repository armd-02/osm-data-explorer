// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import MobileFacilityCard, { facilityName, formatAddress, safeWebsite } from '../MobileFacilityCard'
import { facilityTypeLabel } from '../../../utils/facilityLabels'

/**
 * (#59 / #44) モバイル施設カード
 * - 生活者目線UI: 施設名・日本語の施設タイプ・住所・電話・公式サイト・営業時間
 * - OSM生データ（node/way、amenity=cafe、OSM ID）はカードの主表示にしない
 * - 未登録の情報を捏造しない（行ごとに出さない）
 * - タップで onOpen(result)
 */

afterEach(() => cleanup())

const COFFEE = {
  type: 'node', id: 1001, lat: 34.85, lon: 135.5,
  name: 'テスト珈琲店',
  tags: {
    name: 'テスト珈琲店', amenity: 'cafe', cuisine: 'coffee',
    'addr:city': '大阪市', 'addr:suburb': '梅田', 'addr:street': '1-1', 'addr:housenumber': '12',
  },
}

describe('ユーティリティ関数（facilityLabels.js 経由の再エクスポート）', () => {
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

  it('safeWebsite: http(s) URL のみ返し、それ以外は空文字', () => {
    expect(safeWebsite({ website: 'https://example.com' })).toBe('https://example.com')
    expect(safeWebsite({ official_website: 'http://example.jp' })).toBe('http://example.jp')
    expect(safeWebsite({ website: 'example.com' })).toBe('')
    expect(safeWebsite({})).toBe('')
    expect(safeWebsite(null)).toBe('')
  })
})

describe('MobileFacilityCard（#44 生活者目線デザイン）', () => {
  it('名称・日本語の施設タイプ・住所を表示する', () => {
    render(<MobileFacilityCard result={COFFEE} onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: /テスト珈琲店/ })).toBeTruthy()
    // 施設タイプは日本語ラベル（amenity=cafe → カフェ）
    expect(screen.getByText('カフェ')).toBeTruthy()
    expect(screen.getByText(/大阪市 梅田 1-1 12/)).toBeTruthy()
  })

  it('OSM生データ（要素種別・生タグ値・OSM ID）はカードに出さない', () => {
    render(<MobileFacilityCard result={COFFEE} onOpen={vi.fn()} />)
    expect(screen.queryByText('node/1001')).toBeNull()
    expect(screen.queryByText(/^cafe$/)).toBeNull()
    expect(screen.queryByText(/^coffee$/)).toBeNull()
    expect(screen.queryByText('node')).toBeNull()
  })

  it('電話・公式サイト・営業時間が登録されていれば表示される', () => {
    const full = {
      type: 'way', id: 77, lat: 34.8, lon: 135.5,
      tags: {
        name: 'みらい公園', leisure: 'park',
        phone: '06-1234-5678',
        website: 'https://park.example.jp',
        opening_hours: '09:00-17:00',
        'addr:city': '高槻市',
      },
    }
    render(<MobileFacilityCard result={full} onOpen={vi.fn()} />)
    expect(screen.getByText('公園')).toBeTruthy()
    expect(screen.getByText(/06-1234-5678/)).toBeTruthy()
    expect(screen.getByText(/公式サイト/)).toBeTruthy()
    expect(screen.getByText(/09:00-17:00/)).toBeTruthy()
  })

  it('未登録の情報は表示されない（捏造しない）', () => {
    const bare = { type: 'node', id: 9, lat: 34.8, lon: 135.5, tags: { amenity: 'bench' } }
    render(<MobileFacilityCard result={bare} onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: /名前のない要素/ })).toBeTruthy()
    expect(screen.queryByText(/大阪市/)).toBeNull()
    expect(screen.queryByText(/公式サイト/)).toBeNull()
    expect(screen.queryByText(/📞/)).toBeNull()
  })

  it('タップで onOpen(result) が呼ばれる', () => {
    const onOpen = vi.fn()
    render(<MobileFacilityCard result={COFFEE} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: /テスト珈琲店/ }))
    expect(onOpen).toHaveBeenCalledWith(COFFEE)
  })
})

describe('facilityTypeLabel（日本語施設タイプ）', () => {
  it('主要タグ値を辞書で日本語化する', () => {
    expect(facilityTypeLabel({ tags: { amenity: 'cafe' } })).toBe('カフェ')
    expect(facilityTypeLabel({ tags: { shop: 'convenience' } })).toBe('コンビニエンスストア')
    expect(facilityTypeLabel({ tags: { leisure: 'park' } })).toBe('公園')
    expect(facilityTypeLabel({ tags: { railway: 'station' } })).toBe('駅')
    expect(facilityTypeLabel({ tags: { healthcare: 'dentist' } })).toBe('歯科')
  })

  it('辞書未登録値はカテゴリ照合でラベルを取得する', () => {
    // amenity=sushi は辞書なし → food_drink カテゴリに一致 → 「飲食店（すべて）」
    expect(facilityTypeLabel({ tags: { amenity: 'sushi' } })).toBe('飲食店（すべて）')
    // amenity=plaza は辞書なし → park カテゴリに一致 → 「公園・広場」
    expect(facilityTypeLabel({ tags: { amenity: 'plaza' } })).toBe('公園・広場')
  })

  it('何も一致しなければ「施設」となる', () => {
    expect(facilityTypeLabel({ tags: {} })).toBe('施設')
    expect(facilityTypeLabel({})).toBe('施設')
  })
})
