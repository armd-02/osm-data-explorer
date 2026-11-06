// @vitest-environment jsdom
/**
 * (集計表) 集計・出力タブのStatisticsPanelに「カテゴリ別」タブが統合されるテスト
 *
 * - カテゴリ別タブをクリックするとカテゴリ集計テーブルが表示される
 * - 既存の「タグ別」タブ（生のOSMタグ分析）は残る（詳細用）
 * - 結果が空ならパネルは表示されない
 */
import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { AppContext } from '../../context/AppContext'
import { createInitialState } from '../../state/appReducer'
import StatisticsPanel from '../StatisticsPanel'

const RESULTS = [
  { type: 'node', id: 1, name: 'ファミマコーヒー', tags: { amenity: 'cafe', name: 'ファミマコーヒー', brand: 'ファミリーマート' } },
  { type: 'node', id: 2, name: '山本カフェ', tags: { amenity: 'cafe', name: '山本カフェ' } },
  { type: 'node', id: 3, name: 'ファミリーマート 北浜店', tags: { shop: 'convenience', name: 'ファミリーマート 北浜店', brand: 'ファミリーマート' } }
]

function makeState(overrides = {}) {
  return { ...createInitialState(), ...overrides }
}

function renderPanel(stateOverrides = { results: RESULTS, fetchMeta: { fetchedAt: '2025-01-01T00:00:00Z' } }) {
  const state = makeState(stateOverrides)
  return render(
    <AppContext.Provider value={{ state, dispatch: () => {} }}>
      <StatisticsPanel />
    </AppContext.Provider>
  )
}

beforeEach(() => cleanup())

describe('StatisticsPanel: カテゴリ別タブ', () => {
  it('「カテゴリ別」タブがあり、クリックするとカテゴリ集計テーブルが表示される', () => {
    renderPanel()
    const tab = screen.getByRole('button', { name: 'カテゴリ別' })
    fireEvent.click(tab)
    expect(screen.getByTestId('category-summary-table')).toBeTruthy()
    // カテゴリラベル（CATEGORIESの日本語ラベル）と件数
    expect(screen.getByText('カフェ')).toBeTruthy()
    // カフェ2件＋飲食店（すべて）2件
    expect(screen.getAllByText('2件')).toHaveLength(2)
    // brand内訳（カフェ・飲食店・コンビニ・小売店の各内訳に出る）
    expect(screen.getAllByText('ファミリーマート')).toHaveLength(4)
  })

  it('「タグ別」タブ（生のOSMタグ分析）も引き続き表示される（詳細用）', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'タグ別' }))
    // amenityタグの値別集計が出る
    expect(screen.getByText(/amenity/)).toBeTruthy()
  })

  it('結果が空ならパネル自体を表示しない', () => {
    const { container } = renderPanel({ results: [] })
    expect(container.innerHTML).toBe('')
  })
})
