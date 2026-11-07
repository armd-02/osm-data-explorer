// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { beforeEach } from 'vitest'
import BatchMatchMap from '../BatchMatchMap'

/**
 * BatchMatchMap（一括照合ミニ地図）— MapLibre版の検証
 * - プレビュー候補: 赤マーカー+panTo（[経度, 緯度]順）
 * - 確定済みの場合のみ緑マーカー
 * - (#39) 対象がなくなるとマーカーが削除される（残存防止）
 * - (#38) ポップアップはsetText（プレーンテキスト）
 */

const mockState = vi.hoisted(() => ({ api: null }))
vi.mock('maplibre-gl', async () => {
  const mod = await import('../../test/maplibreMock')
  mockState.api = mod.createMapLibreMock({ autoLoad: false })
  return { default: mockState.api }
})

beforeEach(() => {
  if (mockState.api) mockState.api.resetState()
})

afterEach(() => {
  cleanup()
})

// BatchMatchContextのmatchResults形状:
// { index, name, confirmed(ブール), matched(OSM要素|null), candidates: [{result, ...}] }
const ROWS = [
  {
    index: 0, name: '喫茶ひでじま', confirmed: true,
    matched: { name: '喫茶ひでじま', lat: 34.701, lon: 135.481 },
    candidates: [
      { result: { name: '喫茶ひでじま', lat: 34.701, lon: 135.481 } },
      { result: { name: '別の喫茶店', lat: 34.702, lon: 135.482 } }
    ]
  },
  {
    index: 1, name: 'ラーメン一番', confirmed: false, matched: null,
    candidates: [{ result: { name: 'ラーメン屋A', lat: 34.71, lon: 135.49 } }]
  },
  { index: 2, name: 'パンスペシャル', confirmed: false, matched: null, candidates: [] }
]

function getMap() {
  return mockState.api._state.maps.at(-1)
}
const markersOf = () => mockState.api._state.markers

describe('BatchMatchMap (MapLibre)', () => {
  it('プレビュー候補を赤マーカーで表示し、panToする', () => {
    render(<BatchMatchMap matchResults={ROWS} previewCandidate={{ index: 0, candidateIdx: 0 }} activeRow={ROWS[0]} />)
    const map = getMap()

    const marker = markersOf().at(-1)
    expect(marker._element.className).toBe('batch-map-marker')
    // jsdomはhexをrgb()表記に正規化する
    expect(marker._element.style.background).toBe('rgb(220, 38, 38)') // プレビュー=赤(#dc2626)
    expect(marker._lngLat).toEqual([135.481, 34.701])
    expect(map._calls.some((c) => c.name === 'panTo' && c.args[0][0] === 135.481)).toBe(true)

    // (#38) プレーンテキストポップアップ（setText）
    expect(marker._popup._text).toBe('喫茶ひでじま')
    expect(marker._popup._element).toBeNull()
  })

  it('プレビューなしで確定済みの場合、緑マーカーで表示する', () => {
    render(<BatchMatchMap matchResults={ROWS} previewCandidate={null} activeRow={ROWS[0]} />)
    const marker = markersOf().at(-1)
    expect(marker._element.style.background).toBe('rgb(5, 150, 105)') // 確定=緑(#059669)
    expect(marker._lngLat).toEqual([135.481, 34.701])
    expect(marker._popup._text).toBe('喫茶ひでじま')
  })

  it('#39: 対象がなくなると既存マーカーが削除される（残存防止）', () => {
    const { rerender } = render(
      <BatchMatchMap matchResults={ROWS} previewCandidate={null} activeRow={ROWS[0]} />
    )
    const map = getMap()
    const marker = markersOf().at(-1)
    expect(marker._removed).toBe(false)
    expect(map._markers).toHaveLength(1)

    // 選択中の施設が「候補なし」に変更 → マーカー削除
    rerender(
      <BatchMatchMap matchResults={ROWS} previewCandidate={null} activeRow={ROWS[2]} />
    )
    expect(marker._removed).toBe(true)
    expect(map._markers).toHaveLength(0)
  })

  it('#39: プレビュー取消時もマーカーが削除される', () => {
    const { rerender } = render(
      <BatchMatchMap matchResults={ROWS} previewCandidate={{ index: 0, candidateIdx: 0 }} activeRow={ROWS[0]} />
    )
    const map = getMap()
    expect(map._markers).toHaveLength(1)

    rerender(
      <BatchMatchMap matchResults={ROWS} previewCandidate={null} activeRow={ROWS[2]} />
    )
    expect(map._markers).toHaveLength(0)
  })

  it('matchResultsがない間は地図のみが表示され、マーカーは作成されない', () => {
    render(<BatchMatchMap matchResults={null} previewCandidate={null} activeRow={null} />)
    expect(getMap()).toBeTruthy()
    expect(markersOf()).toHaveLength(0)
  })
})
