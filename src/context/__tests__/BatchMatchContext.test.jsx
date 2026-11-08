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

/** 特定行の詳細（confirmed/matchType/matched/selections）を出力するprobe（確定の形を検証用） */
function DetailProbe({ actions = [], index = 0 }) {
  const { state, dispatch } = useBatchMatch()
  useEffect(() => {
    actions.forEach((a) => dispatch(a))
  }, [])
  const row = state.matchResults?.find((r) => r.index === index)
  return (
    <pre data-testid="probe-detail">{JSON.stringify({
      confirmed: row?.confirmed ?? null,
      matchType: row?.matchType ?? null,
      matched: row?.matched ?? null,
      selections: state.selections,
    })}</pre>
  )
}

function renderDetailProbe(actions = [], index = 0) {
  return render(
    <BatchMatchProvider>
      <DetailProbe actions={actions} index={index} />
    </BatchMatchProvider>
  )
}

function readDetail() {
  return JSON.parse(screen.getByTestId('probe-detail').textContent)
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

/** 完全一致候補が2件ある行（曖昧: ユーザーが選ぶべきなので自動確定されない） */
const TWO_EXACT_ROW = {
  index: 1, inputName: '田中ラーメン', matchType: 'exact',
  candidates: [
    {
      result: { id: 101, type: 'node', name: '田中ラーメン', lat: 34.7, lon: 135.5 },
      match: { type: 'exact', tag: 'name', value: '田中ラーメン' }
    },
    {
      result: { id: 202, type: 'way', name: '田中ラーメン', lat: 34.8, lon: 135.6 },
      match: { type: 'exact', tag: 'name', value: '田中ラーメン' }
    }
  ],
  matched: {
    id: 101, type: 'node', name: '田中ラーメン', lat: 34.7, lon: 135.5,
    url: 'https://www.openstreetmap.org/node/101',
    matchType: 'exact', matchedTag: 'name', matchedValue: '田中ラーメン'
  },
  confirmed: false
}

/** 完全一致が0件の行（部分一致・類似のみ: ユーザーが選ぶべきなので自動確定されない） */
const NO_EXACT_ROW = {
  index: 1, inputName: '鈴木薬局', matchType: 'partial',
  candidates: [
    {
      result: { id: 303, type: 'node', name: '鈴木薬局（南口）', lat: 35.1, lon: 136.9 },
      match: { type: 'partial', tag: 'name', value: '鈴木薬局（南口）' }
    },
    {
      result: { id: 404, type: 'node', name: '鈴木ドラッグ', lat: 35.2, lon: 137.0 },
      match: { type: 'similar', tag: 'name', value: '鈴木ドラッグ', distance: 1 }
    }
  ],
  matched: {
    id: 303, type: 'node', name: '鈴木薬局（南口）', lat: 35.1, lon: 136.9,
    url: 'https://www.openstreetmap.org/node/303',
    matchType: 'partial', matchedTag: 'name', matchedValue: '鈴木薬局（南口）'
  },
  confirmed: false
}

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
  it('SET_MATCH_RESULTS: 完全一致が1件の行は自動確定される', () => {
    renderProbe([
      { type: 'SELECT_FACILITY', payload: 1 },
      { type: 'SET_MATCH_RESULTS', payload: MATCH_RESULTS },
    ])
    const s = readState()
    // 完全一致候補がちょうど1件 → 自動確定（confirmed: true）
    expect(s.matchResults).toEqual([{ index: 1, confirmed: true }])
    expect(s.selections).toEqual({ 1: 0 })
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

describe('BatchMatchContext: SET_MATCH_RESULTSでの自動確定（完全一致がちょうど1件）', () => {
  it('完全一致が1件だけの行は SET_MATCH_RESULTS 直後に confirmed: true になる（matched がその候補を指し、selections に記録される）', () => {
    renderDetailProbe([{ type: 'SET_MATCH_RESULTS', payload: MATCH_RESULTS }], 1)
    const s = readDetail()
    expect(s.confirmed).toBe(true)
    expect(s.matchType).toBe('exact')
    // matched は完全一致候補から構築される（手動確定 CONFIRM_CANDIDATE と同一の形）
    expect(s.matched).toEqual({
      id: 101,
      type: 'node',
      name: '田中ラーメン',
      lat: 34.7,
      lon: 135.5,
      url: 'https://www.openstreetmap.org/node/101',
      matchType: 'exact',
      matchedTag: 'name',
      matchedValue: '田中ラーメン',
    })
    // selections に完全一致候補のインデックスが記録される
    expect(s.selections).toEqual({ 1: 0 })
  })

  it('完全一致が2件ある行は未確定のままになる', () => {
    renderDetailProbe([{ type: 'SET_MATCH_RESULTS', payload: [TWO_EXACT_ROW] }], 1)
    const s = readDetail()
    // 未確定のまま（confirmed: false）、selections にもその行のインデックスは記録されない
    expect(s.confirmed).toBe(false)
    expect(s.selections).toEqual({})
    // 行は変更されない（matched は従来どおり先頭候補のまま）
    expect(s.matched).toEqual({
      id: 101, type: 'node', name: '田中ラーメン', lat: 34.7, lon: 135.5,
      url: 'https://www.openstreetmap.org/node/101',
      matchType: 'exact', matchedTag: 'name', matchedValue: '田中ラーメン'
    })
  })

  it('完全一致が0件の行は未確定のままになる', () => {
    renderDetailProbe([{ type: 'SET_MATCH_RESULTS', payload: [NO_EXACT_ROW] }], 1)
    const s = readDetail()
    // 未確定のまま（confirmed: false）、selections にもその行のインデックスは記録されない
    expect(s.confirmed).toBe(false)
    expect(s.selections).toEqual({})
    // 行は変更されない（matched は従来どおり先頭候補のまま）
    expect(s.matched).toEqual({
      id: 303, type: 'node', name: '鈴木薬局（南口）', lat: 35.1, lon: 136.9,
      url: 'https://www.openstreetmap.org/node/303',
      matchType: 'partial', matchedTag: 'name', matchedValue: '鈴木薬局（南口）'
    })
  })
})
