// @vitest-environment jsdom
/**
 * (#44) appReducer: データ取得後のカテゴリ・目的選択による絞り込みミラー
 *
 * 検索結果がロード済みのとき、アクティブな検索フォームの category/purpose を
 * resultFilters.catFilter / purposeFilter にミラーする（再検索せずにクライアント側で
 * 表示結果を絞り込む）。カテゴリ > 目的 の優先度を保つ。
 */
import { describe, it, expect } from 'vitest'
import { appReducer, createInitialState, activeSearchOf } from '../appReducer'

const cafeResult = { type: 'node', id: 1, tags: { amenity: 'cafe' } }
const parkResult = { type: 'node', id: 2, tags: { leisure: 'park' } }
const RESULTS = [cafeResult, parkResult]

// 結果をロード済み状態にする
function withResults(state, results = RESULTS) {
  return appReducer(state, { type: 'SET_RESULTS', payload: results })
}

describe('createInitialState', () => {
  it('resultFilters に purposeFilter が含まれる', () => {
    const s = createInitialState()
    expect(s.resultFilters.purposeFilter).toBe('')
    expect(s.simpleSearch.purpose).toBe('')
    expect(s.municipalitySearch.purpose).toBe('')
  })
})

describe('activeSearchOf', () => {
  it('searchSource が map のとき simpleSearch を返す', () => {
    const s = createInitialState()
    s.simpleSearch.category = 'cafe'
    expect(activeSearchOf(s)).toBe(s.simpleSearch)
  })
  it('searchSource が municipality のとき municipalitySearch を返す', () => {
    const s = appReducer(createInitialState(), { type: 'SET_SEARCH_SOURCE', payload: 'municipality' })
    s.municipalitySearch.category = 'park'
    expect(activeSearchOf(s)).toBe(s.municipalitySearch)
  })
})

describe('データ取得後のカテゴリ・目的ミラー (#44)', () => {
  it('mapモード+結果ロード済み: カテゴリ選択でcatFilterがミラーされる', () => {
    let s = withResults(createInitialState())
    s = appReducer(s, { type: 'SET_SIMPLE_SEARCH', payload: { category: 'cafe' } })
    expect(s.resultFilters.catFilter).toBe('cafe')
    expect(s.simpleSearch.category).toBe('cafe')
  })

  it('結果が未ロードのときはミラーしない', () => {
    const s = appReducer(createInitialState(), { type: 'SET_SIMPLE_SEARCH', payload: { category: 'cafe' } })
    expect(s.resultFilters.catFilter).toBe('')
  })

  it('municipalityモードではSET_SIMPLE_SEARCHがミラーしない（非アクティブフォーム）', () => {
    let s = withResults(appReducer(createInitialState(), { type: 'SET_SEARCH_SOURCE', payload: 'municipality' }))
    s = appReducer(s, { type: 'SET_SIMPLE_SEARCH', payload: { category: 'cafe' } })
    expect(s.resultFilters.catFilter).toBe('')
    expect(s.simpleSearch.category).toBe('cafe') // state自体は更新される
  })

  it('municipalityモード: SET_MUNICIPALITY_SEARCHでミラーされる', () => {
    let s = withResults(appReducer(createInitialState(), { type: 'SET_SEARCH_SOURCE', payload: 'municipality' }))
    s = appReducer(s, { type: 'SET_MUNICIPALITY_SEARCH', payload: { category: 'park' } })
    expect(s.resultFilters.catFilter).toBe('park')
  })

  it('目的のみ選択: purposeFilterがミラーされる（catFilterは空）', () => {
    let s = withResults(createInitialState())
    s = appReducer(s, { type: 'SET_SIMPLE_SEARCH', payload: { purpose: '遊ぶ' } })
    expect(s.resultFilters.purposeFilter).toBe('遊ぶ')
    expect(s.resultFilters.catFilter).toBe('')
  })

  it('カテゴリ優先: 目的を設定してからカテゴリを選ぶとpurposeFilterは空になる', () => {
    let s = withResults(createInitialState())
    s = appReducer(s, { type: 'SET_SIMPLE_SEARCH', payload: { purpose: '遊ぶ' } })
    expect(s.resultFilters.purposeFilter).toBe('遊ぶ')
    s = appReducer(s, { type: 'SET_SIMPLE_SEARCH', payload: { category: 'park', purpose: '' } })
    expect(s.resultFilters.catFilter).toBe('park')
    expect(s.resultFilters.purposeFilter).toBe('')
  })

  it('目的を解除するとpurposeFilterも消える', () => {
    let s = withResults(createInitialState())
    s = appReducer(s, { type: 'SET_SIMPLE_SEARCH', payload: { purpose: '遊ぶ' } })
    s = appReducer(s, { type: 'SET_SIMPLE_SEARCH', payload: { purpose: '' } })
    expect(s.resultFilters.purposeFilter).toBe('')
  })

  it('SET_RESULTSで現在のフォームからミラーを再導出する', () => {
    // 1) カテゴリなしで検索 → 結果到着（ミラーは空）
    let s = withResults(createInitialState())
    expect(s.resultFilters.catFilter).toBe('')

    // 2) 結果ロード済みの状態でカテゴリ選択（ライブ絞り込み）
    s = appReducer(s, { type: 'SET_SIMPLE_SEARCH', payload: { category: 'cafe' } })
    expect(s.resultFilters.catFilter).toBe('cafe')

    // 3) カテゴリを外して再検索 → 新結果到着でミラーが空に戻る
    s = appReducer(s, { type: 'SET_SIMPLE_SEARCH', payload: { category: '' } })
    s = withResults(s, [cafeResult])
    expect(s.resultFilters.catFilter).toBe('')
  })

  it('モード切替でカテゴリを引き継いだあとミラーを再導出する', () => {
    // mapモードで目的を設定 → 結果ロード
    let s = createInitialState()
    s = appReducer(s, { type: 'SET_SIMPLE_SEARCH', payload: { purpose: '遊ぶ' } })
    s = withResults(s)
    expect(s.resultFilters.purposeFilter).toBe('遊ぶ')

    // municipalityモードへ切替（目的を引き継ぐ）→ ミラーも追随
    s = appReducer(s, { type: 'SET_SEARCH_SOURCE', payload: 'municipality' })
    expect(s.municipalitySearch.purpose).toBe('遊ぶ')
    expect(s.resultFilters.purposeFilter).toBe('遊ぶ')

    // 逆にmapへ切替
    s = appReducer(s, { type: 'SET_SEARCH_SOURCE', payload: 'map' })
    expect(s.simpleSearch.purpose).toBe('遊ぶ')
    expect(s.resultFilters.purposeFilter).toBe('遊ぶ')
  })

  it('高度モード切替でカテゴリ系フィルタを解除する', () => {
    let s = withResults(createInitialState())
    s = appReducer(s, { type: 'SET_SIMPLE_SEARCH', payload: { category: 'cafe' } })
    expect(s.resultFilters.catFilter).toBe('cafe')
    s = appReducer(s, { type: 'SET_SEARCH_MODE', payload: 'advanced' })
    expect(s.resultFilters.catFilter).toBe('')
    expect(s.resultFilters.purposeFilter).toBe('')
    // simpleに戻せば再ミラー
    s = appReducer(s, { type: 'SET_SEARCH_MODE', payload: 'simple' })
    expect(s.resultFilters.catFilter).toBe('cafe')
  })

  it('CLEAR_RESULTS後にフォームのカテゴリを外して再検索すると、SET_RESULTSで古いミラーが更新される', () => {
    let s = withResults(createInitialState())
    s = appReducer(s, { type: 'SET_SIMPLE_SEARCH', payload: { category: 'cafe' } })
    expect(s.resultFilters.catFilter).toBe('cafe')
    s = appReducer(s, { type: 'CLEAR_RESULTS' })
    // 結果が空の間はミラーの再導出対象外（catFilterは古い値のまま）
    s = appReducer(s, { type: 'SET_SIMPLE_SEARCH', payload: { category: '' } })
    s = withResults(s, [parkResult]) // カテゴリなしのフォームで再検索
    expect(s.resultFilters.catFilter).toBe('')
  })
})
