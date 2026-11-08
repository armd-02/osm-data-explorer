import React, { createContext, useContext, useReducer } from 'react'
import { parseNameList, batchMatch } from '../utils/batchMatch'

/**
 * 一括照合の状態管理コンテキスト
 * (#31) タブ切替で状態が消えないように、コンポーネント外部に状態を保持
 */

const initialState = {
  inputText: '',
  csvData: null,       // 取込CSVの構造化データ { fileName, headers, rows } | null
  csvKeyCols: [],      // 照合キーとして選択中の列名配列
  matchResults: null,   // batchMatch()/batchMatchCsvRows()の戻り値
  matchRowAligned: false, // true: matchResultsが取込CSVの行順に揃ったもの（batchMatchCsvRows）
  selections: {},       // { index: candidateIdx }
  activeIndex: null,    // 現在選択中の対象施設index
  previewCandidate: null, // { index, candidateIdx } — 地図プレビュー対象
  processing: false,
}

function batchMatchReducer(state, action) {
  switch (action.type) {
    case 'SET_INPUT_TEXT':
      return { ...state, inputText: action.payload }
    case 'SET_CSV_DATA': {
      const { fileName, headers, rows } = action.payload
      // 取込CSVが新しい入力になるため、それ以前の照合結果は stale として破棄
      // 1列CSVは唯一の列を自動的にキー列として選択
      return {
        ...state,
        csvData: { fileName, headers, rows },
        csvKeyCols: headers.length === 1 ? [headers[0]] : [],
        matchResults: null,
        matchRowAligned: false,
        selections: {},
        activeIndex: null,
        previewCandidate: null,
      }
    }
    case 'SET_CSV_KEY_COLS':
      // キー列が変わると導出される店名が変わるため、以前の照合結果は stale として破棄
      return {
        ...state,
        csvKeyCols: action.payload,
        matchResults: null,
        matchRowAligned: false,
        selections: {},
        activeIndex: null,
        previewCandidate: null,
      }
    case 'CLEAR_CSV':
      return {
        ...state,
        csvData: null,
        csvKeyCols: [],
        matchResults: null,
        matchRowAligned: false,
        selections: {},
        activeIndex: null,
        previewCandidate: null,
      }
    case 'SET_MATCH_RESULTS':
      return { ...state, matchResults: action.payload, matchRowAligned: !!action.rowAligned, selections: {}, activeIndex: null }
    case 'SET_PROCESSING':
      return { ...state, processing: action.payload }
    case 'SELECT_FACILITY':
      return { ...state, activeIndex: action.payload, previewCandidate: null }
    case 'SET_PREVIEW':
      return { ...state, previewCandidate: action.payload }
    case 'CONFIRM_CANDIDATE': {
      const { index, candidateIdx } = action.payload
      if (!state.matchResults) return state
      const row = state.matchResults.find(r => r.index === index)
      if (!row || !row.candidates[candidateIdx]) return state

      const candidate = row.candidates[candidateIdx]
      const updated = {
        ...row,
        matchType: candidate.match.type,
        confirmed: true,
        matched: {
          id: candidate.result.id,
          type: candidate.result.type,
          name: candidate.result.name,
          lat: candidate.result.lat,
          lon: candidate.result.lon,
          url: `https://www.openstreetmap.org/${candidate.result.type}/${candidate.result.id}`,
          matchType: candidate.match.type,
          matchedTag: candidate.match.tag,
          matchedValue: candidate.match.value
        }
      }
      const newResults = state.matchResults.map(r => r.index === index ? updated : r)
      return {
        ...state,
        matchResults: newResults,
        selections: { ...state.selections, [index]: candidateIdx }
      }
    }
    case 'UNCONFIRM': {
      if (!state.matchResults) return state
      const newResults = state.matchResults.map(r =>
        r.index === action.payload ? { ...r, confirmed: false } : r
      )
      return { ...state, matchResults: newResults }
    }
    case 'CLEAR_PREVIEW':
      return { ...state, previewCandidate: null }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

const BatchMatchContext = createContext(null)

export function BatchMatchProvider({ children }) {
  const [state, dispatch] = useReducer(batchMatchReducer, initialState)
  return (
    <BatchMatchContext.Provider value={{ state, dispatch }}>
      {children}
    </BatchMatchContext.Provider>
  )
}

export function useBatchMatch() {
  const context = useContext(BatchMatchContext)
  if (!context) throw new Error('useBatchMatch must be used within BatchMatchProvider')
  return context
}
