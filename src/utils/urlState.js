/**
 * 検索条件のURLエンコード/デコード
 * 
 * URL query parameterに検索状態をエンコードし、
 * 他のブラウザで開いた際に状態を復元する。
 * 
 * タグ条件はJSON + percent-encodingで表現する。
 * 旧形式（;と:区切り）のURLは後方互換でデコードを試みる。
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
  tags: 't',         // tag conditions (JSON encoded)
  and: 'and',        // AND/OR: 1/0
  advKw: 'ak',       // advanced keyword
  tab: 'tab',        // right panel tab
  src: 'src',        // (#44) search source: m(unicipality) / m(ap)
  mun: 'mun'         // (#44) municipality code
}

/**
 * 検索状態をURL query stringにエンコード
 * @returns {string} query string (without leading ?)
 */
export function encodeStateToURL(state) {
  const params = new URLSearchParams()
  
  // (#44) Search source
  if (state.searchSource === 'municipality') {
    params.set(PARAM_KEYS.src, 'm')
    if (state.selectedMunicipality) {
      params.set(PARAM_KEYS.mun, state.selectedMunicipality.code)
      // (#47) 自治体モードのカテゴリ・キーワードはmunicipalitySearchから
      const ms = state.municipalitySearch || state.simpleSearch
      if (ms.category) params.set(PARAM_KEYS.cat, ms.category)
      if (ms.keyword) params.set(PARAM_KEYS.kw, ms.keyword)
    }
  } else {
    // Map mode (default)
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
  }
  
  // Map state (BBOX)
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

  // (#44) Search source: municipality or map
  const src = params.get(PARAM_KEYS.src)
  const munCode = params.get(PARAM_KEYS.mun)

  if (src === 'm' && munCode) {
    // Municipality mode
    state.searchSource = 'municipality'
    state.selectedMunicipality = { code: munCode, name: '', bbox: null }
    state.searchMode = 'simple'
    // (#47) 自治体モード用のカテゴリ・キーワード
    state.municipalitySearch = {
      category: params.get(PARAM_KEYS.cat) || '',
      keyword: params.get(PARAM_KEYS.kw) || ''
    }
    hasData = true
  } else {
    // Map mode (default)
    state.searchSource = 'map'
    
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
  }

  // BBOX (with validation)
  const bbox = params.get(PARAM_KEYS.bbox)
  if (bbox) {
    const parts = bbox.split(',').map(Number)
    if (parts.length === 4 && parts.every(n => !isNaN(n))) {
      const [south, west, north, east] = parts
      if (isBboxValid(south, west, north, east)) {
        state.bbox = { south, west, north, east }
        // (#44) 自治体モードではBBOXをselectedMunicipalityにも設定
        if (state.selectedMunicipality && !state.selectedMunicipality.bbox) {
          state.selectedMunicipality.bbox = { south, west, north, east }
        }
        hasData = true
      }
    }
  }

  return hasData ? state : null
}

/**
 * BBOXの妥当性を検証
 * - 緯度: -90 ≤ lat ≤ 90
 * - 経度: -180 ≤ lon ≤ 180
 * - south < north, west < east
 */
function isBboxValid(south, west, north, east) {
  if (south < -90 || south > 90) return false
  if (north < -90 || north > 90) return false
  if (west < -180 || west > 180) return false
  if (east < -180 || east > 180) return false
  if (south >= north) return false
  if (west >= east) return false
  return true
}

/**
 * タグ条件をJSONでエンコード
 * URLSearchParamsが自動的にpercent-encodeする。
 * 
 * 例: [{"key":"amenity","value":"cafe","mode":"equals"},{"key":"addr:street","value":"","mode":"exists"}]
 */
function encodeTags(tags) {
  return JSON.stringify(tags)
}

/**
 * エンコードされたタグ条件をデコード
 * - 新形式: JSON（percent-decode済み）
 * - 旧形式: ;と:区切り（後方互換）
 */
function decodeTags(str) {
  // 新形式 (JSON) の尝试
  if (str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str)
      if (Array.isArray(parsed)) {
        return parsed
          .filter(t => t && t.key)
          .map(t => ({
            key: String(t.key),
            value: t.value ? String(t.value) : '',
            mode: t.mode === 'exists' ? 'exists' : t.mode === 'not_exists' ? 'not_exists' : 'equals'
          }))
      }
    } catch {
      // JSON解析失敗 → 旧形式にフォールバック
    }
  }

  // 旧形式 (key:value:mode;...) のデコード
  // 注意: addr:street のようなコロン含むキーは旧形式では正しくデコードできない
  // この場合、最後の:でmodeを分離し、残りの:でkey/valueを分離する
  return str.split(';')
    .filter(Boolean)
    .map(part => {
      // 最後の:でmodeを分離
      const lastColon = part.lastIndexOf(':')
      if (lastColon === -1) return null
      const modeChar = part.slice(lastColon + 1)
      const mode = modeChar === 'eq' ? 'equals' : modeChar === 'ex' ? 'exists' : 'ne' === modeChar ? 'not_exists' : 'equals'
      
      const keyVal = part.slice(0, lastColon)
      // key/valueの分離: 最初のコロンで分割（旧形式ではkeyにコロンを含まない想定）
      // 新形式ではJSONを使うので、ここは旧形式のフォールバックのみ
      const firstColon = keyVal.indexOf(':')
      if (firstColon === -1) {
        // keyのみ（exists/not_exists）
        return { key: keyVal, value: '', mode }
      }
      const key = keyVal.slice(0, firstColon)
      const value = keyVal.slice(firstColon + 1)
      if (!key) return null
      return { key, value, mode }
    })
    .filter(Boolean)
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

  // (#44) 検索ソース
  if (urlState.searchSource) {
    dispatch({ type: 'SET_SEARCH_SOURCE', payload: urlState.searchSource })
  }
  if (urlState.selectedMunicipality) {
    dispatch({ type: 'SET_MUNICIPALITY', payload: urlState.selectedMunicipality })
  }
  if (urlState.municipalitySearch) {
    dispatch({ type: 'SET_MUNICIPALITY_SEARCH', payload: urlState.municipalitySearch })
  }
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
