/**
 * 検索条件のURLエンコード/デコード
 * 
 * URL query parameterに検索状態をエンコードし、
 * 他のブラウザで開いた際に状態を復元する。
 */

const PARAM_KEYS = {
  mode: 'm',         // search mode: s(imple) / a(dvanced)
  cat: 'c',          // category ID
  kw: 'k',           // keyword
  loc: 'l',          // location (for geocoding)
  lat: 'lat',        // center lat
  lon: 'lon',        // center lon
  zoom: 'z',         // zoom level
  bbox: 'b',         // bbox (s,w,n,e encoded)
  tags: 't',         // tag conditions (encoded)
  and: 'and',        // AND/OR: 1/0
  advKw: 'ak',       // advanced keyword
  tab: 'tab'         // right panel tab
}

/**
 * 検索状態をURL query stringにエンコード
 * @returns {string} query string (without leading ?)
 */
export function encodeStateToURL(state) {
  const params = new URLSearchParams()
  
  // Search mode
  if (state.searchMode === 'advanced') {
    params.set(PARAM_KEYS.mode, 'a')
  }
  
  // Simple search
  if (state.searchMode === 'simple') {
    if (state.simpleSearch.category) params.set(PARAM_KEYS.cat, state.simpleSearch.category)
    if (state.simpleSearch.keyword) params.set(PARAM_KEYS.kw, state.simpleSearch.keyword)
    if (state.simpleSearch.location) params.set(PARAM_KEYS.loc, state.simpleSearch.location)
  }
  
  // Advanced search
  if (state.searchMode === 'advanced') {
    if (state.advancedSearch.tags.length > 0) {
      params.set(PARAM_KEYS.tags, encodeTags(state.advancedSearch.tags))
    }
    if (state.advancedSearch.keyword) params.set(PARAM_KEYS.advKw, state.advancedSearch.keyword)
    params.set(PARAM_KEYS.and, state.advancedSearch.useAnd ? '1' : '0')
  }
  
  // Map state
  if (state.bbox) {
    const b = state.bbox
    params.set(PARAM_KEYS.bbox, [b.south, b.west, b.north, b.east].map(n => n.toFixed(6)).join(','))
  }
  
  return params.toString()
}

/**
 * URL query stringから検索状態を復元
 * @returns {object|null} 復元された状態（何もなければnull）
 */
export function decodeURLToState(searchParams) {
  if (!searchParams) return null
  
  const params = new URLSearchParams(searchParams)
  const state = {}
  let hasData = false

  // Search mode
  const mode = params.get(PARAM_KEYS.mode)
  if (mode === 'a') {
    state.searchMode = 'advanced'
    hasData = true
  } else {
    state.searchMode = 'simple'
  }

  // Simple search
  const cat = params.get(PARAM_KEYS.cat)
  const kw = params.get(PARAM_KEYS.kw)
  const loc = params.get(PARAM_KEYS.loc)
  if (cat || kw || loc) {
    state.simpleSearch = { category: cat || '', keyword: kw || '', location: loc || '' }
    hasData = true
  }

  // Advanced search
  const tags = params.get(PARAM_KEYS.tags)
  const advKw = params.get(PARAM_KEYS.advKw)
  const and = params.get(PARAM_KEYS.and)
  if (tags || advKw) {
    state.advancedSearch = {
      tags: tags ? decodeTags(tags) : [],
      keyword: advKw || '',
      useAnd: and === '1' || (and === null && true)
    }
    hasData = true
  }

  // BBOX
  const bbox = params.get(PARAM_KEYS.bbox)
  if (bbox) {
    const parts = bbox.split(',').map(Number)
    if (parts.length === 4 && parts.every(n => !isNaN(n))) {
      state.bbox = { south: parts[0], west: parts[1], north: parts[2], east: parts[3] }
      hasData = true
    }
  }

  return hasData ? state : null
}

/**
 * タグ条件をエンコード
 * 形式: key=value|mode 形式を ; で区切り
 * 例: "amenity=cafe:eq;shop=supermarket:ex;phone:::ne"
 */
function encodeTags(tags) {
  return tags.map(tag => {
    const modeChar = tag.mode === 'equals' ? 'eq' : tag.mode === 'exists' ? 'ex' : 'ne'
    const value = tag.mode === 'equals' ? (tag.value || '') : ''
    return `${tag.key}:${value}:${modeChar}`
  }).join(';')
}

/**
 * エンコードされたタグ条件をデコード
 */
function decodeTags(str) {
  return str.split(';')
    .filter(Boolean)
    .map(part => {
      const [key, value, modeChar] = part.split(':')
      const mode = modeChar === 'eq' ? 'equals' : modeChar === 'ex' ? 'exists' : 'not_exists'
      return { key, value: value || '', mode }
    })
    .filter(t => t.key)
}

/**
 * 共有URLを生成
 */
export function generateShareURL(state) {
  const qs = encodeStateToURL(state)
  const base = window.location.origin + window.location.pathname
  return qs ? `${base}?${qs}` : base
}

/**
 * 現在のURLから状態を復元してdispatch
 */
export function applyStateFromURL(state, dispatch) {
  const urlState = decodeURLToState(window.location.search)
  if (!urlState) return false

  // 各状態を設定
  if (urlState.searchMode) {
    dispatch({ type: 'SET_SEARCH_MODE', payload: urlState.searchMode })
  }
  if (urlState.simpleSearch) {
    dispatch({ type: 'SET_SIMPLE_SEARCH', payload: urlState.simpleSearch })
  }
  if (urlState.advancedSearch) {
    dispatch({ type: 'SET_ADVANCED_SEARCH', payload: urlState.advancedSearch })
  }
  if (urlState.bbox) {
    dispatch({ type: 'SET_BBOX', payload: urlState.bbox })
  }

  return true
}
