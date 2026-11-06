// @vitest-environment jsdom
/**
 * (集計表) カテゴリ別集計テーブルの表示テスト
 */
import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import CategorySummaryTable from '../CategorySummaryTable'

const SUMMARY = [
  {
    id: 'cafe', label: 'カフェ', icon: '☕', count: 4,
    breakdown: [
      { name: 'ファミリーマート', count: 2 },
      { name: '山本カフェ', count: 1 },
      { name: 'テスト店A', count: 1 }
    ]
  },
  { id: 'convenience', label: 'コンビニ・スーパー', icon: '🏪', count: 1,
    breakdown: [{ name: 'ファミリーマート', count: 1 }] }
]

beforeEach(() => cleanup())

describe('CategorySummaryTable', () => {
  it('カテゴリラベル・件数・brand内訳を表示する', () => {
    render(<CategorySummaryTable summary={SUMMARY} />)
    expect(screen.getByText('カフェ')).toBeTruthy()
    expect(screen.getByText('4件')).toBeTruthy()
    expect(screen.getByText('コンビニ・スーパー')).toBeTruthy()
    expect(screen.getByText('1件')).toBeTruthy()
    // brand内訳（カフェとコンビニの両方に出る）
    expect(screen.getAllByText('ファミリーマート')).toHaveLength(2)
    expect(screen.getByText('山本カフェ')).toBeTruthy()
  })

  it('内訳が6件を超える場合は上位6件+残件数を表示する', () => {
    const many = {
      id: 'retail', label: '小売店', icon: '🛍️', count: 10,
      breakdown: Array.from({ length: 10 }, (_, i) => ({ name: `店${i + 1}`, count: 1 }))
    }
    render(<CategorySummaryTable summary={[many]} />)
    expect(screen.getByText('店1')).toBeTruthy()
    expect(screen.getByText('店6')).toBeTruthy()
    expect(screen.queryByText('店7')).toBeNull()
    expect(screen.getByText('+ 4件')).toBeTruthy()
  })

  it('空のsummaryは「カテゴリに分類できる結果がありません」を表示する', () => {
    render(<CategorySummaryTable summary={[]} />)
    expect(screen.getByText(/カテゴリに分類できる結果がありません/)).toBeTruthy()
    expect(screen.queryByTestId('category-summary-table')).toBeNull()
  })

  it('summaryがundefinedでもエラーにならない', () => {
    render(<CategorySummaryTable />)
    expect(screen.getByText(/カテゴリに分類できる結果がありません/)).toBeTruthy()
  })
})
