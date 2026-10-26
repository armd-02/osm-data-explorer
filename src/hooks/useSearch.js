import { useCallback, useRef } from 'react'
import { useApp } from '../context/AppContext'
import {
  buildSimpleQuery,
  buildPoiQuery,
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

  /**
   * 検索実行
   * @param {object|null} bboxOverride - 明示的なBBOX ({south,west,north,east})。
   *   指定があればそれを優先し、無ければ state.bbox を使用する。
   *   (#41) 「検索する」押下時に地図の表示範囲を渡す設計。
   */
  const search = useCallback(async (bboxOverride = null) => {
    // 前回のリクエストをキャンセル
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }

    // 使用するBBOXを確定 (#41: 明示的引数 > state.bbox)
    const bbox = bboxOverride || state.bbox

    if (!bbox) {
      dispatch({ type: 'SET_STATUS', payload: 'error' })
      dispatch({
        type: 'SET_ERROR',
        payload: '検索範囲が設定されていません。',
        errorType: 'network',
        errorSuggestion: '地図を移動・拡大して検索したい範囲を表示し、「検索する」を押してください。'
      })
      return
    }

    // 範囲が大きすぎる場合のチェック
    const sizeCheck = checkBboxSize(bbox)
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

    // 使用したBBOXをstateに反映（共有URL・前回範囲表示用）
    if (bboxOverride) {
      dispatch({ type: 'SET_BBOX', payload: bboxOverride })
    }

    // キャンセルシグナル
    const controller = new AbortController()
    abortRef.current = controller

    try {
      let query, keyword

      if (state.searchSource === 'municipality') {
        // (#44) 自治体モード: POI限定クエリ
        ;({ query, keyword } = buildPoiQuery(bbox, state.simpleSearch.category, state.simpleSearch.keyword))
      } else if (state.searchMode === 'simple') {
        ;({ query, keyword } = buildSimpleQuery(bbox, state.simpleSearch.category, state.simpleSearch.keyword))
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
        ;({ query, keyword } = buildAdvancedQuery(bbox, tags, kw, useAnd))
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
