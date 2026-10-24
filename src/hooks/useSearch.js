import { useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { buildSimpleQuery, buildAdvancedQuery, executeOverpassQuery, filterByKeyword } from '../utils/overpass'
import { checkBboxSize } from '../utils/geo'
import { getCategoryById } from '../data/categories'

/**
 * 検索実行のフック
 */
export function useSearch() {
  const { state, dispatch } = useApp()

  const search = useCallback(async () => {
    if (!state.bbox) {
      dispatch({ type: 'SET_STATUS', payload: 'error' })
      dispatch({ type: 'SET_ERROR', payload: '検索範囲が設定されていません。地図を移動して範囲を指定してください。' })
      return
    }

    // 範囲が大きすぎる場合のチェック
    const sizeCheck = checkBboxSize(state.bbox)
    if (sizeCheck.areaKm2 > 40000) {
      dispatch({ type: 'SET_STATUS', payload: 'error' })
      dispatch({ type: 'SET_ERROR', payload: sizeCheck.message })
      return
    }

    dispatch({ type: 'SET_STATUS', payload: 'loading' })
    dispatch({ type: 'SET_ERROR', payload: null })

    try {
      let query, keyword

      if (state.searchMode === 'simple') {
        const { category, keyword: kw } = state.simpleSearch
        const cat = category ? getCategoryById(category) : null
        const categoryTags = cat ? cat.tags : null

        // If no category and no keyword, search all
        if (!categoryTags && !kw) {
          query = `\n[out:json][timeout:25];\n(\n  node(${state.bbox.south},${state.bbox.west},${state.bbox.north},${state.bbox.east});\n  way(${state.bbox.south},${state.bbox.west},${state.bbox.north},${state.bbox.east});\n  relation(${state.bbox.south},${state.bbox.west},${state.bbox.north},${state.bbox.east});\n);\nout body center;\n`
          keyword = kw
        } else {
          ;({ query, keyword } = buildSimpleQuery(state.bbox, categoryTags, kw))
        }
      } else {
        const { tags, keyword: kw, useAnd } = state.advancedSearch
        if (tags.length === 0 && !kw) {
          dispatch({ type: 'SET_STATUS', payload: 'error' })
          dispatch({ type: 'SET_ERROR', payload: '検索条件を指定してください。' })
          return
        }
        ;({ query, keyword } = buildAdvancedQuery(state.bbox, tags, kw, useAnd))
      }

      const results = await executeOverpassQuery(query)
      const filtered = filterByKeyword(results, keyword)

      dispatch({ type: 'SET_RESULTS', payload: filtered })
      dispatch({ type: 'SET_STATUS', payload: 'success' })
    } catch (error) {
      dispatch({ type: 'SET_STATUS', payload: 'error' })
      dispatch({ type: 'SET_ERROR', payload: error.message })
    }
  }, [state, dispatch])

  const reset = useCallback(() => {
    dispatch({ type: 'CLEAR_RESULTS' })
  }, [dispatch])

  return { search, reset }
}
