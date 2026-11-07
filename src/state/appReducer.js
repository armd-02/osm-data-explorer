/**
 * (#44) Appの状態reducer
 *
 * App.jsx の useReducer から抽出し、単体テスト可能にする。
 *
 * 追加仕様（#44: データ取得後のカテゴリ選択で絞り込み）:
 *   検索結果がロード済み（results.length > 0）のとき、**アクティブな検索フォーム**
 *   （searchSource が map → simpleSearch / municipality → municipalitySearch）の
 *   category・purpose を resultFilters.catFilter / purposeFilter にミラーする。
 *   これにより、取得後に検索フォームでカテゴリ（または目的）を選択すると、
 *   再検索せずにクライアント側で表示結果が絞り込まれる。
 *
 *   - カテゴリ > 目的 の優先度を保つ: category が設定されていれば
 *     purposeFilter は空にする（クエリ生成の優先度と一致させる）。
 *   - ミラーは SET_SIMPLE_SEARCH / SET_MUNICIPALITY_SEARCH（アクティブモードのみ）、
 *     SET_RESULTS、SET_SEARCH_SOURCE、SET_SEARCH_MODE で再導出する。
 */

export function createInitialState() {
  return {
    searchMode: 'simple',
    simpleSearch: { category: '', keyword: '', location: '', cuisine: '', purpose: '' },
    advancedSearch: { tags: [], keyword: '', useAnd: true },
    bbox: null,
    // (Task 2) bboxの来源: 'url'（URL復元）| 'search'（検索実行）| null
    // MapViewは 'url' の場合のみカメラfitを行う（検索後はカメラを動かさない）
    bboxSource: null,
    status: 'idle',
    results: [],
    error: null,
    errorType: null,
    errorSuggestion: null,
    fetchMeta: null,
    activeResultId: null,
    searchSource: 'map',
    selectedMunicipality: null,
    municipalitySearch: { category: '', keyword: '', cuisine: '', purpose: '' },
    resultFilters: { nameFilter: '', typeFilter: 'all', catFilter: '', purposeFilter: '', websiteOnly: false, sortDir: 'none', missingFilter: 'none' }
  }
}

/**
 * アクティブな検索フォーム（mode依存）を返す
 */
export function activeSearchOf(state) {
  return state.searchSource === 'municipality'
    ? state.municipalitySearch
    : state.simpleSearch
}

/**
 * 結果ロード済みのとき、アクティブ検索フォームの category/purpose を
 * resultFilters にミラーする（クライアント側絞り込み用）。
 * 結果が空の場合は何もしない（no-op）。
 */
export function syncCategoryFilters(state) {
  if (!Array.isArray(state.results) || state.results.length === 0) return state
  const act = activeSearchOf(state) || {}
  const cat = act.category || ''
  return {
    ...state,
    resultFilters: {
      ...state.resultFilters,
      catFilter: cat,
      // カテゴリが選ばれている間は目的スコープのミラーは使わない（カテゴリ優先）
      purposeFilter: cat ? '' : (act.purpose || '')
    }
  }
}

export function appReducer(state, action) {
  switch (action.type) {
    case 'SET_SEARCH_MODE': {
      const next = { ...state, searchMode: action.payload }
      if (!Array.isArray(state.results) || state.results.length === 0) return next
      if (action.payload === 'advanced') {
        // 高度モードはカテゴリ選択UIがないため、カテゴリ系フィルタを解除
        return {
          ...next,
          resultFilters: { ...next.resultFilters, catFilter: '', purposeFilter: '' }
        }
      }
      return syncCategoryFilters(next)
    }
    case 'SET_SIMPLE_SEARCH': {
      const next = { ...state, simpleSearch: { ...state.simpleSearch, ...action.payload } }
      // アクティブモードが map のときのみミラーする（municipalityモードでは非アクティブ）
      return state.searchSource === 'map' ? syncCategoryFilters(next) : next
    }
    case 'SET_ADVANCED_SEARCH':
      return { ...state, advancedSearch: { ...state.advancedSearch, ...action.payload } }
    case 'SET_BBOX': {
      // payloadが {south,west,north,east,source:'url'} の場合、sourceを
      // bbox本体から切り離して bboxSource として保持する。
      // 素のBBOX（検索）の場合は bboxSource='search'。
      const payload = action.payload
      if (!payload || typeof payload !== 'object') {
        return { ...state, bbox: null, bboxSource: null }
      }
      const { source, ...bboxFields } = payload
      return {
        ...state,
        bbox: bboxFields.south !== undefined ? bboxFields : null,
        bboxSource: source || 'search'
      }
    }
    case 'SET_STATUS':
      return { ...state, status: action.payload }
    case 'SET_RESULTS':
      // 新規検索時はアクティブ結果のハイライトをリセット（旧結果へのパンを防ぐ）
      return syncCategoryFilters({ ...state, results: action.payload, activeResultId: null })
    case 'SET_FETCH_META':
      return { ...state, fetchMeta: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload, errorType: action.errorType || null, errorSuggestion: action.errorSuggestion || null }
    case 'CLEAR_RESULTS':
      return { ...state, results: [], error: null, errorType: null, errorSuggestion: null, status: 'idle', fetchMeta: null }
    case 'SET_ACTIVE_RESULT':
      return { ...state, activeResultId: action.payload }
    case 'SET_SEARCH_SOURCE': {
      // (#49 改訂) モード切替時のカテゴリ・キーワード引き継ぎ（last-wins）
      // 切り元の値を切り先に**常に**引き継ぐ。両モードのカテゴリは共有の
      // 単一値として振る舞い、「カテゴリを変えたのにモード切替で古い値に
      // 戻る（カテゴリが変わってない）」問題を解消する。
      const src = action.payload
      const ms = state.municipalitySearch || { category: '', keyword: '', cuisine: '', purpose: '' }
      const ss = state.simpleSearch || { category: '', keyword: '', location: '', cuisine: '', purpose: '' }
      let next
      if (src === 'municipality') {
        next = {
          ...state,
          searchSource: src,
          municipalitySearch: {
            ...ms,
            category: ss.category,
            keyword: ss.keyword,
            cuisine: ss.cuisine,
            purpose: ss.purpose || ''
          }
        }
      } else if (src === 'map') {
        next = {
          ...state,
          searchSource: src,
          simpleSearch: {
            ...ss,
            category: ms.category,
            keyword: ms.keyword,
            cuisine: ms.cuisine,
            purpose: ms.purpose || ''
          }
        }
      } else {
        next = { ...state, searchSource: src }
      }
      return syncCategoryFilters(next)
    }
    case 'SET_MUNICIPALITY':
      return { ...state, selectedMunicipality: action.payload }
    case 'SET_MUNICIPALITY_SEARCH': {
      const next = { ...state, municipalitySearch: { ...state.municipalitySearch, ...action.payload } }
      // アクティブモードが municipality のときのみミラーする
      return state.searchSource === 'municipality' ? syncCategoryFilters(next) : next
    }
    case 'SET_RESULT_FILTERS':
      return { ...state, resultFilters: { ...state.resultFilters, ...action.payload } }
    default:
      return state
  }
}
