// @vitest-environment jsdom
/**
 * (#44) MobileListTab:
 * - カテゴリドロップダウンの操作が検索フォームにdispatchされる（地図/自治体モード両方）
 * - 「フィルタをリセット」で検索フォームのカテゴリ・目的も一緒に解除される
 * - 公式サイトがあればカードに🌐アイコン行が表示される
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { AppContext } from '../../../context/AppContext'
import { appReducer, createInitialState } from '../../../state/appReducer'
import MobileListTab from '../MobileListTab'

// 実際のOverpass正規化と同様に tags.name → 顶层name にコピーする
const cafeWithWeb = { type: 'node', id: 1, name: 'カフェA', tags: { amenity: 'cafe', website: 'https://cafe.example.jp', name: 'カフェA' } }
const park = { type: 'node', id: 2, name: '中央公園', tags: { leisure: 'park', name: '中央公園' } }

function Harness({ preActions = [], log = [], children }) {
  const [state, rawDispatch] = React.useReducer(
    appReducer,
    preActions,
    (acts) => acts.reduce((s, a) => appReducer(s, a), createInitialState())
  )
  const dispatch = (a) => {
    log.push(a)
    rawDispatch(a)
  }
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children || <MobileListTab onOpenDetail={vi.fn()} />}
    </AppContext.Provider>
  )
}

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => cleanup())

describe('MobileListTab: カテゴリ選択=検索フォームと同期 (#44)', () => {
  it('地図モード: ドロップダウンでカテゴリを選ぶとSET_SIMPLE_SEARCHにdispatchされparkが絞られる', () => {
    const log = []
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: [cafeWithWeb, park] }, { type: 'SET_STATUS', payload: 'success' }]} log={log} />)

    expect(screen.getByText('中央公園')).toBeTruthy()
    const select = screen.getByRole('combobox', { name: 'カテゴリで絞り込む' })
    fireEvent.change(select, { target: { value: 'cafe' } })

    expect(log.some(a => a.type === 'SET_SIMPLE_SEARCH' && a.payload.category === 'cafe')).toBe(true)
    expect(screen.queryByText('中央公園')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'カテゴリで絞り込む' }).value).toBe('cafe')
  })

  it('自治体モード: ドロップダウンの操作はSET_MUNICIPALITY_SEARCHにdispatchされる', () => {
    const log = []
    render(<Harness
      preActions={[
        { type: 'SET_SEARCH_SOURCE', payload: 'municipality' },
        { type: 'SET_RESULTS', payload: [cafeWithWeb, park] },
        { type: 'SET_STATUS', payload: 'success' }
      ]}
      log={log}
    />)
    const select = screen.getByRole('combobox', { name: 'カテゴリで絞り込む' })
    fireEvent.change(select, { target: { value: 'park' } })

    expect(log.some(a => a.type === 'SET_MUNICIPALITY_SEARCH' && a.payload.category === 'park')).toBe(true)
    expect(log.some(a => a.type === 'SET_SIMPLE_SEARCH')).toBe(false)
    expect(screen.getByRole('combobox', { name: 'カテゴリで絞り込む' }).value).toBe('park')
  })

  it('「フィルタをリセット」で検索フォームのカテゴリ・目的も解除される', async () => {
    const log = []
    render(<Harness
      preActions={[
        { type: 'SET_RESULTS', payload: [cafeWithWeb, park] },
        { type: 'SET_STATUS', payload: 'success' },
        { type: 'SET_SIMPLE_SEARCH', payload: { category: 'cafe' } },
        { type: 'SET_RESULT_FILTERS', payload: { nameFilter: '存在しない名' } }
      ]}
      log={log}
    />)

    // 条件に一致する施設なし → リセットボタン表示
    expect(screen.getByText(/現在の絞り込み条件に一致する施設はありません/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'フィルタをリセット' }))

    expect(log.some(a => a.type === 'SET_SIMPLE_SEARCH' && a.payload.category === '' && a.payload.purpose === '')).toBe(true)
    expect(log.some(a => a.type === 'SET_RESULT_FILTERS' && a.payload.nameFilter === '' && a.payload.catFilter === '' && a.payload.purposeFilter === '')).toBe(true)

    // 両方（cafe+park）が再び表示される
    await waitFor(() => {
      expect(screen.getByText('カフェA')).toBeTruthy()
      expect(screen.getByText('中央公園')).toBeTruthy()
    })
  })
})

describe('MobileListTab: 公式サイトアイコン', () => {
  it('websiteタグがある施設カードに🌐アイコン行が表示される', () => {
    const log = []
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: [cafeWithWeb, park] }, { type: 'SET_STATUS', payload: 'success' }]} log={log} />)
    expect(screen.getByText(/公式サイト/)).toBeTruthy()
    // parkカードには出ない
    expect(screen.getAllByText(/公式サイト/)).toHaveLength(1)
  })
})

describe('MobileListTab: カテゴリ選択肢は取得データに基づいて絞り込まれる (#44)', () => {
  it('結果に出現したカテゴリのみを件数付きで表示する', () => {
    render(<Harness preActions={[
      { type: 'SET_RESULTS', payload: [cafeWithWeb, park] },
      { type: 'SET_STATUS', payload: 'success' }
    ]} />)
    const select = screen.getByRole('combobox', { name: 'カテゴリで絞り込む' })
    const optTexts = [...select.options].map((o) => o.textContent)
    expect(optTexts).toContain('カテゴリ: すべて（2件）')
    expect(optTexts).toContain('カフェ（1件）')
    expect(optTexts).toContain('公園・広場（1件）')
    expect(optTexts.some((t) => t.startsWith('レストラン'))).toBe(false)
  })

  it('結果なしときはカテゴリセレクト自体が表示されない（フィルタバー非表示）', () => {
    render(<Harness />)
    expect(screen.queryByRole('combobox', { name: 'カテゴリで絞り込む' })).toBeNull()
  })
})
