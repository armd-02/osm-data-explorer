/**
 * 検索条件のURLエンコード/デコード
 * 
 * URL query parameterに検索状態をエンコードし、
 * 他のブラウザで開いた際に状態を復元する。
 * 
 * タグ条件はJSON + percent-encodingで表現する。
 * 旧形式（;と:区切り）のURLは後方互換でデコードを試みる。
 * (#54) 料理フィルタは cu パラメータ。旧 c=ramen URL は「レストラン + cuisine=ramen」にマッピング。
 */
import { getCategoryById } from '../data/categories'

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
  mun: 'mun',        // (#44) municipality code
  cuisine: 'cu',     // (#54) cuisine value (cuisine filter, food categories only)
  purpose: 'p',      // (#44) purpose scope (食べる・遊ぶなど、カテゴリ未選択時の絞り込み)
  // (A2) 一覧フィルタ（結果表示の絞り込み・並び替え）
  // 注: catFilter/purposeFilter は検索フォームのミラーであり（reducerが
  // syncCategoryFilters で再導出する）、ユーザーが直接設定できない。
  // URLにエンコードしても再検索時にフォーム値で上書きされるため対象外。
  nameFilter: 'nf',  // 施設名の部分一致
  typeFilter: 'tf',  // OSM要素種別 (node/way/relation)
  websiteOnly: 'wo', // 公式サイトありのみ (1)
  missingFilter: 'mf', // (B2) 未登録属性絞り込み
  sortDir: 'sd'      // 施設名並び替え (asc/desc)
}

// (A2) 復元時に許可する値
const VALID_TYPES = ['node', 'way', 'relation']
const VALID_MISSING = ['any', 'phone', 'opening_hours', 'website', 'address']

/**
 * (A2) 一覧フィルタをURLパラメータにエンコード
 * デフォルト値は省略する（既存パラメータと同じ方針）。
 */
function appendResultFilters(params, rf) {
  if (!rf) return
  if ((rf.nameFilter || '').trim()) params.set(PARAM_KEYS.nameFilter, rf.nameFilter.trim())
  if (rf.typeFilter && rf.typeFilter !== 'all') params.set(PARAM_KEYS.typeFilter, rf.typeFilter)
  if (rf.websiteOnly) params.set(PARAM_KEYS.websiteOnly, '1')
  if (rf.missingFilter && rf.missingFilter !== 'none') params.set(PARAM_KEYS.missingFilter, rf.missingFilter)
  if (rf.sortDir && rf.sortDir !== 'none') params.set(PARAM_KEYS.sortDir, rf.sortDir)
}

/**
 * (A2) URLパラメータから一覧フィルタを復元（無効値は無視）
 * @returns {object} 存在するフィルタのみを含む部分オブジェクト（何もなければ {}）
 */
function readResultFilters(params) {
  const rf = {}
  const nf = (params.get(PARAM_KEYS.nameFilter) || '').trim()
  if (nf) rf.nameFilter = nf
  const tf = params.get(PARAM_KEYS.typeFilter)
  if (tf && tf !== 'all' && VALID_TYPES.includes(tf)) rf.typeFilter = tf
  if (params.get(PARAM_KEYS.websiteOnly) === '1') rf.websiteOnly = true
  const mf = params.get(PARAM_KEYS.missingFilter)
  if (mf && mf !== 'none' && VALID_MISSING.includes(mf)) rf.missingFilter = mf
  const sd = params.get(PARAM_KEYS.sortDir)
  if (sd === 'asc' || sd === 'desc') rf.sortDir = sd
  return rf
}

/**
 * (#54) カテゴリIDとcuisine値の解決
 * - 旧ラーメンカテゴリ(c=ramen)の共有URL → レストラン + cuisine=ramen に自動マッピング
 *   （cuが明示指定されていればそれを優先）
 * - 未知のカテゴリID → 未指定として無視
 */
function resolveCategoryAndCuisine(cat, cu) {
  if (cat === 'ramen') return { category: 'restaurant', cuisine: cu || 'ramen' }
  if (cat && !getCategoryById(cat)) return { category: '', cuisine: '' }
  return { category: cat || '', cuisine: cu || '' }
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
      if (ms.cuisine) params.set(PARAM_KEYS.cuisine, ms.cuisine)
      if (ms.purpose) params.set(PARAM_KEYS.purpose, ms.purpose)
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
      if (state.simpleSearch.cuisine) params.set(PARAM_KEYS.cuisine, state.simpleSearch.cuisine)
      if (state.simpleSearch.purpose) params.set(PARAM_KEYS.purpose, state.simpleSearch.purpose)
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
  
  // (A2) 一覧フィルタ（自治体モード・マップモードの両方に適用）
  appendResultFilters(params, state.resultFilters)

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
    // (#54) cuisine + 旧 c=ramen の自動マッピング
    const resolved = resolveCategoryAndCuisine(params.get(PARAM_KEYS.cat), params.get(PARAM_KEYS.cuisine))
    const munPurpose = params.get(PARAM_KEYS.purpose) || ''
    state.municipalitySearch = {
      category: resolved.category,
      keyword: params.get(PARAM_KEYS.kw) || '',
      cuisine: resolved.cuisine,
      purpose: munPurpose
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
    // (#54) cuisine + 旧 c=ramen の自動マッピング
    const resolved = resolveCategoryAndCuisine(params.get(PARAM_KEYS.cat), params.get(PARAM_KEYS.cuisine))
    const kw = params.get(PARAM_KEYS.kw)
    const loc = params.get(PARAM_KEYS.loc)
    const purpose = params.get(PARAM_KEYS.purpose) || ''
    if (resolved.category || resolved.cuisine || kw || loc || purpose) {
      state.simpleSearch = { category: resolved.category, keyword: kw || '', location: loc || '', cuisine: resolved.cuisine, purpose }
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

  // (A2) 一覧フィルタ
  const resultFilters = readResultFilters(params)
  if (Object.keys(resultFilters).length > 0) {
    state.resultFilters = resultFilters
    hasData = true
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
