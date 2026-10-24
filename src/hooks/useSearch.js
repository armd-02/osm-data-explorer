import { useCallback, useRef } from 'react'
import { useApp } from '../context/AppContext'
import {
  buildSimpleQuery,
  buildAdvancedQuery,
  executeOverpassQuery,
  filterByKeyword,
  OverpassError
} from '../utils/overpass'
import { checkBboxSize } from '../utils/geo'

/**
 * 検索実行のフック
 * キャンセル・キャッシュ・エラー提案をサポート
 */
export function useSearch() {
  const { state, dispatch } = useApp()
  const abortRef = useRef(null)

  const search = useCallback(async () => {
    // 前回のリクエストをキャンセル
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }

    if (!state.bbox) {
      dispatch({ type: 'SET_STATUS', payload: 'error' })
      dispatch({
        type: 'SET_ERROR',
        payload: '検索範囲が設定されていません。地図を移動して範囲を指定してください。',
        errorType: 'network',
        errorSuggestion: '地図を移動するか、矩形描画で範囲を指定してください。'
      })
      return
    }

    // 範囲が大きすぎる場合のチェック
    const sizeCheck = checkBboxSize(state.bbox)
    if (sizeCheck.areaKm2 > 40000) {
      dispatch({ type: 'SET_STATUS', payload: 'error' })
      dispatch({
        type: 'SET_ERROR',
        payload: sizeCheck.message,
        errorType: 'network',
        errorSuggestion: '地図をズームインして範囲を狭めてください。'
      })
      return
    }

    dispatch({ type: 'SET_STATUS', payload: 'loading' })
    dispatch({ type: 'SET_ERROR', payload: null })

    // キャンセルシグナル
    const controller = new AbortController()
    abortRef.current = controller

    try {
      let query, keyword

      if (state.searchMode === 'simple') {
        ;({ query, keyword } = buildSimpleQuery(state.bbox, state.simpleSearch.category, state.simpleSearch.keyword))
      } else {
        const { tags, keyword: kw, useAnd } = state.advancedSearch
        if (tags.length === 0 && !kw) {
          dispatch({ type: 'SET_STATUS', payload: 'error' })
          dispatch({
            type: 'SET_ERROR',
            payload: '検索条件を指定してください。',
            errorType: 'invalid_query',
            errorSuggestion: 'OSMタグ条件を1つ以上追加するか、キーワードを入力してください。'
          })
          return
        }
        ;({ query, keyword } = buildAdvancedQuery(state.bbox, tags, kw, useAnd))
      }

      const { results, meta } = await executeOverpassQuery(query, {
        signal: controller.signal
      })

      const filtered = filterByKeyword(results, keyword)

      dispatch({ type: 'SET_RESULTS', payload: filtered })
      dispatch({ type: 'SET_FETCH_META', payload: meta })
      dispatch({ type: 'SET_STATUS', payload: 'success' })
    } catch (error) {
      // キャンセルの場合はエラー表示しない
      if (error.name === 'AbortError' || (error instanceof OverpassError && error.type === 'network' && error.message.includes('キャンセル'))) {
        dispatch({ type: 'SET_STATUS', payload: 'idle' })
        return
      }

      dispatch({ type: 'SET_STATUS', payload: 'error' })

      if (error instanceof OverpassError) {
        dispatch({
          type: 'SET_ERROR',
          payload: error.message,
          errorType: error.type,
          errorSuggestion: error.suggestion
        })
      } else {
        dispatch({
          type: 'SET_ERROR',
          payload: error.message || '不明なエラーが発生しました',
          errorType: 'network',
          errorSuggestion: '時間をおいて再試行してください。'
        })
      }
    } finally {
      abortRef.current = null
    }
  }, [state, dispatch])

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    dispatch({ type: 'SET_STATUS', payload: 'idle' })
  }, [dispatch])

  const reset = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    dispatch({ type: 'CLEAR_RESULTS' })
  }, [dispatch])

  return { search, cancel, reset }
}
