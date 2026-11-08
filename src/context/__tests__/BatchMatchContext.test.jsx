// @vitest-environment jsdom
/**
 * BatchMatchContext（reducer）のテスト
 *
 * reducer は export されていないため、BatchMatchProvider とprobeコンポーネントを
 * 用いて action の適用結果を state として検証する方式。
 *
 * 新規アクション（CSV取込関連）:
 * - SET_CSV_DATA: 全列・全行をcsvDataに保持。1列CSVは唯一の列を自動でキー列選択。
 *   同時に以前の照合結果（stale）を破棄する
 * - SET_CSV_KEY_COLS: 照合キー列の選択を更新
 * - CLEAR_CSV: csvData/csvKeyColsとstaleな照合結果をクリア
 *
 * 既存アクション（SET_MATCH_RESULTS / CONFIRM_CANDIDATE 等）の回帰も確認
 */
import React, { useEffect } from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BatchMatchProvider, useBatchMatch } from '../BatchMatchContext.jsx'

/** state を可読な要約に整形する */
function summarize(state) {
  return {
    inputText: state.inputText,
    csv: state.csvData
      ? { fileName: state.csvData.fileName, headers: state.csvData.headers, rowCount: state.csvData.rows.length }
      : null,
    csvKeyCols: state.csvKeyCols,
    matchResults: state.matchResults
      ? state.matchResults.map((r) => ({ index: r.index, confirmed: !!r.confirmed }))
      : null,
    matchRowAligned: state.matchRowAligned === true,
    selections: state.selections,
    activeIndex: state.activeIndex,
    preview: state.previewCandidate ? 'set' : null,
    processing: state.processing,
  }
}

/** action群を適用してstateを表示するprobe */
function Probe({ actions = [] }) {
  const { state, dispatch } = useBatchMatch()
  useEffect(() => {
    actions.forEach((a) => dispatch(a))
  }, [])
  return <pre data-testid="probe-state">{JSON.stringify(summarize(state))}</pre>
}

function renderProbe(actions = []) {
  return render(
    <BatchMatchProvider>
      <Probe actions={actions} />
    </BatchMatchProvider>
  )
}

function readState() {
  return JSON.parse(screen.getByTestId('probe-state').textContent)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const ONE_COL_CSV = { fileName: 'names.csv', headers: ['col_1'], rows: [{ col_1: '田中ラーメン' }, { col_1: '山本カフェ' }] }
const TWO_COL_CSV = { fileName: 'shops.csv', headers: ['name', 'addr'], rows: [{ name: '田中ラーメン', addr: '大阪市' }, { name: '山本カフェ', addr: '神戸市' }] }

const MATCH_RESULTS = [
  {
    index: 1, inputName: '田中ラーメン', matchType: 'exact',
    candidates: [
      {
        result: { id: 101, type: 'node', name: '田中ラーメン', lat: 34.7, lon: 135.5 },
        match: { type: 'exact', tag: 'name', value: '田中ラーメン' }
      }
    ],
    matched: null, confirmed: false
  }
]

describe('BatchMatchContext: 初期状態', () => {
  it('csvDataはnull、csvKeyColsは空配列', () => {
    renderProbe()
    const s = readState()
    expect(s.csv).toBeNull()
    expect(s.csvKeyCols).toEqual([])
  })
})

describe('BatchMatchContext: SET_CSV_DATA', () => {
  it('1列CSV: 全列・全行をcsvDataに保持し、唯一の列を自動でキー列選択する', () => {
    renderProbe([{ type: 'SET_CSV_DATA', payload: ONE_COL_CSV }])
    const s = readState()
    expect(s.csv).toEqual({ fileName: 'names.csv', headers: ['col_1'], rowCount: 2 })
    expect(s.csvKeyCols).toEqual(['col_1'])
  })

  it('多列CSV: csvDataは保持するがキー列は未選択（csvKeyColsが空）', () => {
    renderProbe([{ type: 'SET_CSV_DATA', payload: TWO_COL_CSV }])
    const s = readState()
    expect(s.csv).toEqual({ fileName: 'shops.csv', headers: ['name', 'addr'], rowCount: 2 })
    expect(s.csvKeyCols).toEqual([])
  })

  it('それ以前の照合結果（stale）を破棄する', () => {
    renderProbe([
      { type: 'SET_MATCH_RESULTS', payload: MATCH_RESULTS },
      { type: 'SELECT_FACILITY', payload: 1 },
      { type: 'SET_PREVIEW', payload: { index: 1, candidateIdx: 0 } },
      { type: 'SET_CSV_DATA', payload: TWO_COL_CSV },
    ])
    const s = readState()
    expect(s.matchResults).toBeNull()
    expect(s.selections).toEqual({})
    expect(s.activeIndex).toBeNull()
    expect(s.preview).toBeNull()
    expect(s.csv).toEqual({ fileName: 'shops.csv', headers: ['name', 'addr'], rowCount: 2 })
  })

  it('連続した取込では新しいCSVに置き換わる', () => {
    renderProbe([
      { type: 'SET_CSV_DATA', payload: ONE_COL_CSV },
      { type: 'SET_CSV_DATA', payload: TWO_COL_CSV },
    ])
    const s = readState()
    expect(s.csv).toEqual({ fileName: 'shops.csv', headers: ['name', 'addr'], rowCount: 2 })
    expect(s.csvKeyCols).toEqual([])
  })
})

describe('BatchMatchContext: SET_CSV_KEY_COLS', () => {
  it('選択中のキー列を更新する（csvDataはそのまま）', () => {
    renderProbe([
      { type: 'SET_CSV_DATA', payload: TWO_COL_CSV },
      { type: 'SET_CSV_KEY_COLS', payload: ['addr', 'name'] },
    ])
    const s = readState()
    expect(s.csvKeyCols).toEqual(['addr', 'name'])
    expect(s.csv.fileName).toBe('shops.csv')
  })

  it('csvDataがない場合は選択を空にする', () => {
    renderProbe([{ type: 'SET_CSV_KEY_COLS', payload: ['name'] }])
    expect(readState().csvKeyCols).toEqual(['name'])
  })
})

describe('BatchMatchContext: CLEAR_CSV', () => {
  it('csvData/csvKeyColsをクリアし、staleな照合結果も破棄する', () => {
    renderProbe([
      { type: 'SET_CSV_DATA', payload: TWO_COL_CSV },
      { type: 'SET_CSV_KEY_COLS', payload: ['name'] },
      { type: 'SET_MATCH_RESULTS', payload: MATCH_RESULTS },
      { type: 'SELECT_FACILITY', payload: 1 },
      { type: 'CLEAR_CSV' },
    ])
    const s = readState()
    expect(s.csv).toBeNull()
    expect(s.csvKeyCols).toEqual([])
    expect(s.matchResults).toBeNull()
    expect(s.selections).toEqual({})
    expect(s.activeIndex).toBeNull()
  })
})

describe('BatchMatchContext: 行揃え結果（matchRowAligned）', () => {
  it('SET_MATCH_RESULTS: rowAligned: true を記録する（batchMatchCsvRows の行揃え結果）', () => {
    renderProbe([
      { type: 'SET_CSV_DATA', payload: TWO_COL_CSV },
      { type: 'SET_CSV_KEY_COLS', payload: ['name'] },
      { type: 'SET_MATCH_RESULTS', payload: MATCH_RESULTS, rowAligned: true },
    ])
    expect(readState().matchRowAligned).toBe(true)
  })

  it('SET_MATCH_RESULTS: rowAligned なしでは false（batchMatch のリスト結果）', () => {
    renderProbe([{ type: 'SET_MATCH_RESULTS', payload: MATCH_RESULTS }])
    expect(readState().matchRowAligned).toBe(false)
  })

  it('SET_CSV_KEY_COLS: キー列変更で以前の照合結果（stale）とフラグを破棄する', () => {
    renderProbe([
      { type: 'SET_CSV_DATA', payload: TWO_COL_CSV },
      { type: 'SET_CSV_KEY_COLS', payload: ['name'] },
      { type: 'SET_MATCH_RESULTS', payload: MATCH_RESULTS, rowAligned: true },
      { type: 'SET_CSV_KEY_COLS', payload: ['addr', 'name'] },
    ])
    const s = readState()
    expect(s.matchResults).toBeNull()
    expect(s.matchRowAligned).toBe(false)
    expect(s.csvKeyCols).toEqual(['addr', 'name'])
  })

  it('CLEAR_CSV: フラグをfalseに戻す', () => {
    renderProbe([
      { type: 'SET_CSV_DATA', payload: TWO_COL_CSV },
      { type: 'SET_CSV_KEY_COLS', payload: ['name'] },
      { type: 'SET_MATCH_RESULTS', payload: MATCH_RESULTS, rowAligned: true },
      { type: 'CLEAR_CSV' },
    ])
    const s = readState()
    expect(s.matchResults).toBeNull()
    expect(s.matchRowAligned).toBe(false)
  })
})

describe('BatchMatchContext: 既存アクションの回帰', () => {
  it('SET_MATCH_RESULTS: 結果を設定し、selections/activeIndexをリセットする', () => {
    renderProbe([
      { type: 'SELECT_FACILITY', payload: 1 },
      { type: 'SET_MATCH_RESULTS', payload: MATCH_RESULTS },
    ])
    const s = readState()
    expect(s.matchResults).toEqual([{ index: 1, confirmed: false }])
    expect(s.selections).toEqual({})
    expect(s.activeIndex).toBeNull()
  })

  it('CONFIRM_CANDIDATE: confirmed=trueにし、selectionsに候補を記録する', () => {
    renderProbe([
      { type: 'SET_MATCH_RESULTS', payload: MATCH_RESULTS },
      { type: 'CONFIRM_CANDIDATE', payload: { index: 1, candidateIdx: 0 } },
    ])
    const s = readState()
    expect(s.matchResults).toEqual([{ index: 1, confirmed: true }])
    expect(s.selections).toEqual({ 1: 0 })
  })

  it('UNCONFIRM: confirmed=falseに戻す（selectionsは保持される）', () => {
    renderProbe([
      { type: 'SET_MATCH_RESULTS', payload: MATCH_RESULTS },
      { type: 'CONFIRM_CANDIDATE', payload: { index: 1, candidateIdx: 0 } },
      { type: 'UNCONFIRM', payload: 1 },
    ])
    const s = readState()
    expect(s.matchResults).toEqual([{ index: 1, confirmed: false }])
    expect(s.selections).toEqual({ 1: 0 })
  })

  it('RESET: 全stateが初期状態に戻る', () => {
    renderProbe([
      { type: 'SET_INPUT_TEXT', payload: '田中ラーメン' },
      { type: 'SET_CSV_DATA', payload: TWO_COL_CSV },
      { type: 'SET_MATCH_RESULTS', payload: MATCH_RESULTS },
      { type: 'RESET' },
    ])
    const s = readState()
    expect(s.inputText).toBe('')
    expect(s.csv).toBeNull()
    expect(s.csvKeyCols).toEqual([])
    expect(s.matchResults).toBeNull()
  })
})
