// @vitest-environment jsdom
/**
 * (#44) ResultsPanel:
 * - 公式サイト（website/official_website）がある行に🔗アイコンを表示
 * - カテゴリドロップダウンの操作が検索フォームにdispatchされ、reducerのミラーで
 *   resultFilters.catFilter が同期される（データ取得後の絞り込み）
 * - 「クリア」で検索フォームのカテゴリ・目的も一緒に解除される
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { AppContext } from '../../context/AppContext'
import { appReducer, createInitialState } from '../../state/appReducer'
import ResultsPanel from '../ResultsPanel'

// 実際のOverpass正規化と同様に tags.name → 顶层name にコピーする
const withWebsite = { type: 'node', id: 1, name: 'カフェA', tags: { amenity: 'cafe', website: 'https://cafe.example.jp', name: 'カフェA' } }
const withoutWebsite = { type: 'node', id: 2, name: 'カフェB', tags: { amenity: 'cafe', name: 'カフェB' } }

function Harness({ preActions = [], log = [] }) {
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
      <ResultsPanel />
    </AppContext.Provider>
  )
}

const RESULTS = [withWebsite, withoutWebsite]

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => cleanup())

describe('ResultsPanel: 公式サイトアイコン', () => {
  it('websiteタグがある行の名前に🔗アイコン（リンク）が表示される', () => {
    const log = []
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: RESULTS }]} log={log} />)
    const link = screen.getByRole('link', { name: '公式サイトがあります' })
    expect(link.getAttribute('href')).toBe('https://cafe.example.jp')
  })

  it('websiteタグのない行にはアイコンが出ない', () => {
    const log = []
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: [withoutWebsite] }]} log={log} />)
    expect(screen.queryByRole('link', { name: '公式サイトがあります' })).toBeNull()
  })
})

describe('ResultsPanel: カテゴリ選択=検索フォームと同期 (#44)', () => {
  it('ドロップダウンでカテゴリを選ぶと検索フォームにdispatchされcatFilterがミラーされる', () => {
    const log = []
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: RESULTS }]} log={log} />)

    const select = screen.getByRole('combobox', { name: '施設の種類で絞る' })
    fireEvent.change(select, { target: { value: 'cafe' } })

    expect(log.some(a => a.type === 'SET_SIMPLE_SEARCH' && a.payload.category === 'cafe')).toBe(true)
    // reducerのミラーでcatFilterがcafeになり、selectの値も検索フォームに同期される
    expect(screen.getByRole('combobox', { name: '施設の種類で絞る' }).value).toBe('cafe')
  })

  it('結果にparkが混ざっているとき、ドロップダウンでcafeを選ぶとpark行が絞られる', () => {
    const log = []
    const park = { type: 'node', id: 3, name: '中央公園', tags: { leisure: 'park', name: '中央公園' } }
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: [...RESULTS, park] }]} log={log} />)

    expect(screen.getByText('中央公園')).toBeTruthy()
    const select = screen.getByRole('combobox', { name: '施設の種類で絞る' })
    fireEvent.change(select, { target: { value: 'cafe' } })

    // park行が絞り込まれて消え、件数表示も更新される
    expect(screen.queryByText('中央公園')).toBeNull()
    // 絞り込みが有効であることを示すインジケータが表示される
    expect(screen.getByText(/表示は絞り込み済みです/)).toBeTruthy()
  })

  it('「クリア」で検索フォームのカテゴリ・目的も解除される', () => {
    const log = []
    render(<Harness
      preActions={[
        { type: 'SET_RESULTS', payload: RESULTS },
        { type: 'SET_SIMPLE_SEARCH', payload: { category: 'cafe', purpose: '' } }
      ]}
      log={log}
    />)
    const select = screen.getByRole('combobox', { name: '施設の種類で絞る' })
    expect(select.value).toBe('cafe')

    fireEvent.click(screen.getByRole('button', { name: 'クリア' }))

    expect(log.some(a => a.type === 'SET_SIMPLE_SEARCH' && a.payload.category === '' && a.payload.purpose === '')).toBe(true)
    expect(log.some(a => a.type === 'SET_RESULT_FILTERS')).toBe(true)
    expect(screen.getByRole('combobox', { name: '施設の種類で絞る' }).value).toBe('')
  })

  it('目的スコープが設定されていて結果が実際に絞られているときは「絞り込み済み」表示が出る', () => {
    const log = []
    const park = { type: 'node', id: 3, name: 'テスト公園', tags: { leisure: 'park', name: 'テスト公園' } }
    render(<Harness
      preActions={[
        { type: 'SET_RESULTS', payload: [...RESULTS, park] },
        { type: 'SET_SIMPLE_SEARCH', payload: { purpose: '食べる' } }
      ]}
      log={log}
    />)
    expect(screen.getByText(/表示は絞り込み済みです/)).toBeTruthy()
  })

  it('フィルタ条件にすべての結果が一致する場合は「絞り込み済み」表示が出ない', () => {
    render(<Harness
      preActions={[
        { type: 'SET_RESULTS', payload: RESULTS },
        { type: 'SET_SIMPLE_SEARCH', payload: { purpose: '食べる' } }
      ]}
    />)
    // すべてカフェ（食べる）→ 件数は変わらないため、絞込みマーカーは出さない
    expect(screen.queryByText(/表示は絞り込み済みです/)).toBeNull()
  })
})

describe('ResultsPanel: カテゴリ選択肢は取得データに基づいて絞り込まれる (#44)', () => {
  const park = { type: 'node', id: 3, name: '中央公園', tags: { leisure: 'park', name: '中央公園' } }

  it('結果に出現したカテゴリのみを件数付きで表示する', () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: [...RESULTS, park] }]} />)
    const select = screen.getByRole('combobox', { name: '施設の種類で絞る' })
    const optTexts = [...select.options].map((o) => o.textContent)
    expect(optTexts).toContain('すべての種類（3件）')
    expect(optTexts).toContain('カフェ（2件）')
    expect(optTexts).toContain('公園・広場（1件）')
    // 結果に出現しないカテゴリ（レストラン等）は選択肢にない
    expect(optTexts.some((t) => t.startsWith('レストラン'))).toBe(false)
    expect(optTexts.some((t) => t.startsWith('薬局'))).toBe(false)
  })

  it('検索前（結果なし）は従来どおり全カテゴリ一覧を表示する', () => {
    render(<Harness />)
    const select = screen.getByRole('combobox', { name: '施設の種類で絞る' })
    const optTexts = [...select.options].map((o) => o.textContent)
    expect(optTexts).toContain('すべての種類')
    expect(optTexts).toContain('薬局・ドラッグストア')
    expect(optTexts.every((t) => !t.includes('件）'))).toBe(true)
  })

  it('選択中カテゴリは出現していなくても選択肢に残る（count 0）', () => {
    render(<Harness
      preActions={[
        { type: 'SET_RESULTS', payload: RESULTS },
        { type: 'SET_SIMPLE_SEARCH', payload: { category: 'hospital', purpose: '' } }
      ]}
    />)
    const select = screen.getByRole('combobox', { name: '施設の種類で絞る' })
    expect(select.value).toBe('hospital')
    const optTexts = [...select.options].map((o) => o.textContent)
    expect(optTexts).toContain('病院・クリニック（0件）')
  })
})
