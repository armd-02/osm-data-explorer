import { useCallback, useRef, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import {
  buildSimpleQuery,
  buildPoiQuery,
  buildAdvancedQuery,
  executeOverpassQuery,
  filterByKeyword,
  OverpassError
} from '../utils/overpass'
import { buildBarrierFreeQuery } from '../utils/barrierFree'
import { parseBarrierFreeResponse, isBarrierFreeCriteria } from '../utils/barrierFreeResults'
import { checkBboxSize } from '../utils/geo'
import { isValidBbox } from '../utils/searchBbox'

/**
 * 検索実行のフック
 * キャンセル・キャッシュ・エラー提案をサポート
 */
export function useSearch() {
  const { state, dispatch } = useApp()
  const abortRef = useRef(null)

  // (#47) 最新のstateを常に読むためのref（クローズドオーバーの旧stateを防ぐ）
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  })

  /**
   * 検索実行
   * @param {object|null} criteria - 「検索する」押下時点の検索条件スナップショット。
   *   buildSearchCriteria() の戻り値（{ ok, bbox, searchSource, searchMode, query, keyword }）。
   *   query が含まれる場合、そのクエリをそのまま実行する（dispatch との競合を排除 #47）。
   *   後方互換: 裸のBBOXオブジェクト（{south,west,north,east}）を渡した場合、
   *   最新のstateからクエリを生成する（#41 方式のlegacy）。
   */
  const search = useCallback(async (criteria = null) => {
    // 前回のリクエストをキャンセル
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }

    // BBOXを確定
    // legacy（裸BBOX）の場合、bboxOverride とみなして最新のstate.bboxにフォールバック
    const isLegacyBbox = criteria && typeof criteria === 'object' && !criteria.query && criteria.south !== undefined
    const bbox = isLegacyBbox
      ? (criteria && Object.keys(criteria).length > 0 ? criteria : stateRef.current.bbox)
      : (criteria ? criteria.bbox : null)

    // 縮退・逆順BBOX（Overpassが"bbox order must be [south, west, north, east]"
    // で拒否する形状、例: 非表示地図コンテナからのgetBounds()）を検証する
    if (!bbox || !isValidBbox(bbox)) {
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
    dispatch({ type: 'SET_BBOX', payload: bbox })

    // キャンセルシグナル
    const controller = new AbortController()
    abortRef.current = controller

    try {
      let query, keyword, queryKind = 'poi'

      if (criteria && criteria.query) {
        // (#47) クリック時点のスナップショットのクエリをそのまま実行
        query = criteria.query
        keyword = criteria.keyword || ''
        // (#62) buildSearchCriteria が決定したクエリ種別（'poi' | 'barrier_free'）
        queryKind = criteria.queryKind === 'barrier_free' ? 'barrier_free' : 'poi'
      } else {
        // legacy: 最新のstateからクエリを生成
        const s = stateRef.current
        if (s.searchSource === 'municipality') {
          const ms = s.municipalitySearch || s.simpleSearch
          // (#62) バリアフリー（カテゴリまたは目的）: 専用のバリアフリークエリ
          if (isBarrierFreeCriteria(ms.category, ms.purpose)) {
            queryKind = 'barrier_free'
            query = buildBarrierFreeQuery(bbox)
            keyword = ms.keyword || ''
          } else {
            ;({ query, keyword } = buildPoiQuery(bbox, ms.category, ms.keyword))
          }
        } else if (s.searchMode === 'simple') {
          const ss = s.simpleSearch
          // (#62) バリアフリー（カテゴリまたは目的）: 専用のバリアフリークエリ
          if (isBarrierFreeCriteria(ss.category, ss.purpose)) {
            queryKind = 'barrier_free'
            query = buildBarrierFreeQuery(bbox)
            keyword = ss.keyword || ''
          } else {
            ;({ query, keyword } = buildSimpleQuery(bbox, ss.category, ss.keyword))
          }
        } else {
          const { tags, keyword: kw, useAnd } = s.advancedSearch
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
      }

      const { results, meta } = await executeOverpassQuery(query, {
        signal: controller.signal,
        // (#62) バリアフリー検索: 要素をバリアフリー形式→共通結果形状にパース
        ...(queryKind === 'barrier_free' ? { parse: parseBarrierFreeResponse } : {})
      })

      // (#62) バリアフリー検索: キーワード絞り込みを適用しない
      // （歩道・縁石・音声案内ノードは name が無いことが多く、絞り込むと結果が消える）
      const filtered = queryKind === 'barrier_free' ? results : filterByKeyword(results, keyword)

      dispatch({ type: 'SET_RESULTS', payload: filtered })
      dispatch({ type: 'SET_RESULT_KIND', payload: queryKind })
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
  }, [dispatch])

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
