/**
 * Overpass API クエリ生成・実行・キャッシュ
 * UIからクエリ生成を分離したデータ取得層
 */
import { getOverpassUrl, getEndpointLabel, APP_CONFIG, FALLBACK_ENDPOINT_ORDER } from '../config'
import { getCategoryById, categoryToQueryFilter, isFoodCategory } from '../data/categories'

// ============================================================
// メモリキャッシュ
// ============================================================
const cache = new Map()
let cacheOrder = [] // LRU用

function cacheKey(query, endpoint) {
  // bbox座標はquery文字列内に埋め込まれているため、query文字列自体をキーにする。
  // 別エンドポイント（インスタンス）で結果を混同しないよう、エンドポイントIDもキーに含める。
  return `${endpoint}::${query}`
}

function getFromCache(key) {
  if (!APP_CONFIG.cacheEnabled) return null
  if (!cache.has(key)) return null
  const entry = cache.get(key)
  // キャッシュをLRU順序の先頭に移動
  cacheOrder = cacheOrder.filter((k) => k !== key)
  cacheOrder.unshift(key)
  return entry
}

function setToCache(key, data, meta) {
  if (!APP_CONFIG.cacheEnabled) return
  cache.set(key, { data, meta })
  cacheOrder.unshift(key)
  // 最大件数を超えたら古いものを削除
  while (cacheOrder.length > APP_CONFIG.cacheMaxEntries) {
    const oldKey = cacheOrder.pop()
    cache.delete(oldKey)
  }
}

export function clearCache() {
  cache.clear()
  cacheOrder = []
}

export function getCacheStats() {
  return { entries: cache.size, maxEntries: APP_CONFIG.cacheMaxEntries }
}

// ============================================================
// エラークラス
// ============================================================
export class OverpassError extends Error {
  constructor(message, type, suggestion) {
    super(message)
    this.type = type // 'timeout' | 'rate_limit' | 'server_error' | 'network' | 'empty' | 'invalid_query'
    this.suggestion = suggestion
  }
}

// ============================================================
// クエリ生成
// ============================================================

/**
 * カテゴリのタグ条件をOverpassクエリに組み込むためのフィルタ情報を変換
 */
function buildCategoryFilter(category) {
  if (!category) return null
  const cat = getCategoryById(category)
  if (!cat) return null
  return categoryToQueryFilter(cat)
}

/**
 * かんたん検索用クエリを生成
 * - カテゴリ指定時: categoryToQueryFilter の結果に基づいてunion/ANDを生成
 * - カテゴリなし: BBOX内全要素
 */
/**
 * (#54) cuisineフィルタのAND条件を生成（飲食カテゴリ指定時のみ有効）
 * 料理（cuisine）は施設の種類（カテゴリ）と直交する独立次元のため、
 * カテゴリフィルタに [cuisine=X] をANDで連結する。
 * 非飲食カテゴリ・カテゴリ未指定時は無効（UIでも非表示・自動クリアする）。
 */
function buildCuisineAndFilters(category, cuisine) {
  if (!cuisine || !category || !isFoodCategory(category)) return []
  return [`cuisine=${quoteValue(cuisine)}`]
}

export function buildSimpleQuery(bbox, category, keyword, cuisine = '') {
  const { south, west, north, east } = bbox
  const bboxStr = [south, west, north, east].map(n => n.toFixed(6)).join(',')

  const catFilter = buildCategoryFilter(category)
  const cuisineAnd = buildCuisineAndFilters(category, cuisine)

  let body
  if (catFilter && (catFilter.unionFilters.length > 0 || (catFilter.andFilters && catFilter.andFilters.length > 0))) {
    body = buildFilterBody(bboxStr, catFilter, cuisineAnd)
  } else {
    // カテゴリなし: 全要素
    body = `  node(${bboxStr});\n  way(${bboxStr});\n  relation(${bboxStr});`
  }

  const query = `[out:json][timeout:25];(\n${body}\n);\nout body center;\n`
  return { query, keyword }
}

/**
 * (#44) 自治体POI検索用クエリを生成
 * カテゴリ指定時: buildSimpleQuery と同じロジック
 * カテゴリ未指定: POI対象タグ（amenity/shop/tourism/leisure/office/healthcare/craft）に限定
 */
export function buildPoiQuery(bbox, category, keyword, cuisine = '') {
  const { south, west, north, east } = bbox
  const bboxStr = [south, west, north, east].map(n => n.toFixed(6)).join(',')

  const catFilter = category ? buildCategoryFilter(category) : null
  const cuisineAnd = buildCuisineAndFilters(category, cuisine)

  let body
  if (catFilter && (catFilter.unionFilters.length > 0 || (catFilter.andFilters && catFilter.andFilters.length > 0))) {
    body = buildFilterBody(bboxStr, catFilter, cuisineAnd)
  } else {
    // (#44) カテゴリ未指定: POI対象タグに限定（道路・建物等を除外）
    const poiKeys = ['amenity', 'shop', 'tourism', 'leisure', 'office', 'healthcare', 'craft']
    const poiFilters = poiKeys.map(k => `node[${k}](${bboxStr});\n  way[${k}](${bboxStr});`)
    body = poiFilters.join('\n  ')
  }

  const query = `[out:json][timeout:25];(\n${body}\n);\nout body center;\n`
  return { query, keyword }
}

/**
 * 詳細検索用クエリを生成
 * - AND模式: 各条件を個別フィルタとして連結 [cond1][cond2]
 * - OR模式: 各条件をunionの別ブランチに分割
 */
export function buildAdvancedQuery(bbox, tags, keyword, useAnd) {
  const { south, west, north, east } = bbox
  const bboxStr = [south, west, north, east].map(n => n.toFixed(6)).join(',')

  // 各tagをOverpass QLフィルタに変換
  const filters = tags
    .map((tag) => {
      if (!tag.key) return null
      const safeKey = escapeStr(tag.key)
      if (tag.mode === 'equals') return `${safeKey}=${quoteValue(tag.value || '')}`
      if (tag.mode === 'exists') return safeKey
      if (tag.mode === 'not_exists') return `!${safeKey}`
      return null
    })
    .filter(Boolean)

  let body
  if (filters.length === 0) {
    // 条件なし: 全要素
    body = `  node(${bboxStr});\n  way(${bboxStr});\n  relation(${bboxStr});`
  } else if (useAnd) {
    // AND: 全フィルタを連結 [f1][f2][f3]
    const andFilter = filters.map(f => `[${f}]`).join('')
    body = `  node${andFilter}(${bboxStr});\n  way${andFilter}(${bboxStr});\n  relation${andFilter}(${bboxStr});`
  } else {
    // OR: 各フィルタをunionの別ブランチに
    body = filters
      .flatMap(f => `  node[${f}](${bboxStr});\n  way[${f}](${bboxStr});\n  relation[${f}](${bboxStr});`)
      .join('\n')
  }

  const query = `[out:json][timeout:25];(\n${body}\n);\nout body center;\n`
  return { query, keyword }
}

/**
 * カテゴリフィルタ情報からunion body文字列を生成
 * (#54) extraAnd: 追加のAND条件配列（cuisineフィルタ等）。
 *  - OR模式: 各unionブランチの末尾に連結 → (A OR B OR C) AND X
 *  - AND模式: 連結フィルタの末尾に追加 → A AND B AND X
 */
function buildFilterBody(bboxStr, catFilter, extraAnd = []) {
  const extra = extraAnd.map(f => `[${f}]`).join('')
  if (catFilter.unionFilters.length > 0) {
    // OR: 各フィルタをunionの別ブランチに（角括弧をここで追加）+ 追加AND条件
    return catFilter.unionFilters
      .flatMap(f => `  node[${f}]${extra}(${bboxStr});\n  way[${f}]${extra}(${bboxStr});\n  relation[${f}]${extra}(${bboxStr});`)
      .join('\n')
  }
  if (catFilter.andFilters && catFilter.andFilters.length > 0) {
    // AND: 全フィルタを連結 [f1][f2][f3] + 追加AND条件
    const chained = catFilter.andFilters.map(f => `[${f}]`).join('') + extra
    return `  node${chained}(${bboxStr});\n  way${chained}(${bboxStr});\n  relation${chained}(${bboxStr});`
  }
  if (extra) {
    return `  node${extra}(${bboxStr});\n  way${extra}(${bboxStr});\n  relation${extra}(${bboxStr});`
  }
  return `  node(${bboxStr});\n  way(${bboxStr});\n  relation(${bboxStr});`
}

/**
 * 文字列エスケープ（Overpassクエリ内）
 */
function escapeStr(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * 値を適切に引用符で囲む（特殊文字を含む場合のみ）
 */
function quoteValue(str) {
  const s = String(str)
  if (/[",\\\s[\](){}]/.test(s)) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return s
}

// ============================================================
// Overpass API 実行
// ============================================================

/**
 * 1回だけのクエリ実行（fetch＋応答分類）
 * 成功時はOverpassの生JSONを返す。失敗時は retryable フラグ付き OverpassError を送出。
 *  - 429 / 5xx / その他4xx / ネットワークエラー / タイムアウト → retryable=true（別インスタンスで試す価値がある）
 *  - クエリエラー(invalid_query) / 手動キャンセル → retryable=false（どのインスタンスでも同じ結果）
 */
async function attemptQuery(url, query, controller) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
    signal: controller.signal
  })

  // 429: レート制限（インスタンスごとに独立した制限 → 別インスタンスへフォールバック可）
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10)
    const err = new OverpassError(
      `Overpass APIのレート制限に達しました（${retryAfter}秒待ってから再試行）`,
      'rate_limit',
      `${retryAfter}秒待ってから再実行してください。`
    )
    err.retryable = true
    throw err
  }

  // 5xx: サーバーエラー → 次インスタンスへ
  if (response.status >= 500) {
    const err = new OverpassError(
      `Overpass APIに問題があります（${response.status}）`,
      'server_error',
      '数分待ってから再試行してください。'
    )
    err.retryable = true
    throw err
  }

  // その他の4xx（406 ブロック、403 など）→ 次インスタンスへ
  if (!response.ok) {
    const err = new OverpassError(
      `Overpass APIエラー（${response.status}）`,
      'server_error',
      'クエリ内容を確認して再試行してください。'
    )
    err.retryable = true
    throw err
  }

  const data = await response.json()

  // Overpassのクエリエラー: どのインスタンスでも同じ結果になるためフォールバックしない
  if (data.remark && /error/i.test(data.remark)) {
    const err = new OverpassError(
      `クエリエラー: ${data.remark}`,
      'invalid_query',
      '検索条件を確認して再試行してください。'
    )
    err.retryable = false
    throw err
  }

  return data
}

/**
 * Overpass API にクエリを実行
 * 失敗時は自動で次のインスタンスにフォールバックする（#52）。
 * 試行チェーン: 指定endpoint → FALLBACK_ENDPOINT_ORDER 順（重複除去）。
 * クエリエラー(invalid_query)と手動キャンセルはフォールバックしない。
 * @param {string} query - Overpass QLクエリ
 * @param {object} options - { endpoint, timeout, signal }
 * @returns {Promise<{results: Array, meta: object}>}
 */
export async function executeOverpassQuery(query, options = {}) {
  const {
    endpoint = APP_CONFIG.overpassEndpoint,
    timeout = APP_CONFIG.timeoutMs,
    signal: externalSignal
  } = options

  // 試行チェーン: 一次エンドポイント + フォールバック順（重複除去）
  const chain = [endpoint, ...FALLBACK_ENDPOINT_ORDER.filter((ep) => ep !== endpoint)]

  const startedAt = Date.now()
  let lastError = null

  for (let i = 0; i < chain.length; i++) {
    const ep = chain[i]

    // すでにキャンセル済みの場合は即終了
    if (externalSignal && externalSignal.aborted) {
      throw new OverpassError('検索がキャンセルされました', 'network', null)
    }

    const url = getOverpassUrl(ep)
    const cKey = cacheKey(query, ep)

    // キャッシュチェック（キーは query＋エンドポイントID）
    const cached = getFromCache(cKey)
    if (cached) {
      return {
        results: cached.data,
        meta: { ...cached.meta, cached: true, endpoint: getEndpointLabel(ep) }
      }
    }

    // キャンセルサポート＋タイムアウト（全体予算を共有: 前回の所要時間を差し引いて縮小）
    const elapsed = Date.now() - startedAt
    const attemptTimeout = Math.max(1, timeout - elapsed)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), attemptTimeout)

    // 外部シグナル連携
    if (externalSignal) {
      externalSignal.addEventListener('abort', () => controller.abort())
    }

    try {
      const data = await attemptQuery(url, query, controller)

      const results = parseOverpassResponse(data)
      const meta = {
        fetchedAt: new Date().toISOString(),
        endpoint: getEndpointLabel(ep),
        elementCount: data.elements ? data.elements.length : 0,
        cached: false,
        fallback: i > 0
      }

      // キャッシュに格納
      setToCache(cKey, results, meta)

      // 結果が空の場合
      if (results.length === 0) {
        return { results: [], meta: { ...meta, empty: true } }
      }

      return { results, meta }
    } catch (error) {
      // 手動キャンセル（外部シグナル）→ キャンセルとして終了（フォールバックしない）
      if (error.name === 'AbortError' && externalSignal && externalSignal.aborted) {
        throw new OverpassError('検索がキャンセルされました', 'network', null)
      }

      // タイムアウト（内部abort）→ 別インスタンスで再試行
      if (error.name === 'AbortError') {
        const err = new OverpassError(
          `タイムアウトしました（${attemptTimeout}ミリ秒）`,
          'timeout',
          '検索範囲を狭めて再試行してください。'
        )
        err.retryable = true
        lastError = err
        continue
      }

      if (error instanceof OverpassError) {
        if (!error.retryable) throw error // invalid_query など
        lastError = error
        continue
      }

      // ネットワークエラー → 別インスタンスで再試行
      const err = new OverpassError(
        `接続に失敗しました: ${error.message}`,
        'network',
        'ネットワーク接続を確認して再試行してください。'
      )
      err.retryable = true
      lastError = err
    } finally {
      clearTimeout(timeoutId)
      if (externalSignal) {
        externalSignal.removeEventListener('abort', () => controller.abort())
      }
    }
  }

  // 全インスタンスが失敗
  throw new OverpassError(
    `Overpass API の全インスタンスで失敗しました。最後のエラー: ${lastError ? lastError.message : '不明'}`,
    lastError ? lastError.type : 'network',
    '数分待ってから再試行してください。続く場合はネットワーク接続を確認してください。'
  )
}

/**
 * Overpass APIのレスポンスを標準形式に変換
 * node / way / relationの型とIDを保持
 */
export function parseOverpassResponse(data) {
  if (!data.elements) return []

  return data.elements
    .map((el) => {
      const result = {
        id: el.id,
        type: el.type, // 'node' | 'way' | 'relation'
        tags: el.tags || {},
        lat: null,
        lon: null
      }

      // 座標取得
      if (el.type === 'node') {
        result.lat = el.lat
        result.lon = el.lon
      } else if (el.center) {
        result.lat = el.center.lat
        result.lon = el.center.lon
      }

      // 名前抽出
      if (el.tags && el.tags.name) {
        result.name = el.tags.name
      }

      return result
    })
    .filter((r) => r.lat !== null && r.lon !== null)
    // Wayを構成するタグ無しノード（匿名ノード）を除外
    .filter((r) => !(r.type === 'node' && Object.keys(r.tags).length === 0))
}

/**
 * 名前キーワードで結果をフィルタ
 * 複数名称タグ（name, name:ja, official_name, alt_name）を検索
 * 表記揺れ（全角/半角、大文字小文字、空白、Unicode）を吸収
 * 
 * @returns {Array} マッチした結果配列（matchTypeフィールド付き）
 */
export function filterByKeyword(results, keyword) {
  if (!keyword || keyword.trim() === '') return results

  const NAME_TAGS = ['name', 'name:ja', 'official_name', 'alt_name', 'name:en']

  const matched = []
  for (const result of results) {
    let matchType = null
    let matchedTag = null

    for (const tag of NAME_TAGS) {
      const value = result.tags?.[tag]
      if (!value) continue

      const match = textsMatch(null, value, keyword)
      if (match) {
        if (match === 'exact') {
          matchType = 'exact'
          matchedTag = tag
          break
        }
        if (match === 'partial' && matchType !== 'exact') {
          matchType = 'partial'
          matchedTag = tag
        }
      }
    }

    if (matchType) {
      matched.push({ ...result, matchType, matchedTag })
    }
  }

  // 完全一致を優先表示
  matched.sort((a, b) => {
    if (a.matchType === 'exact' && b.matchType !== 'exact') return -1
    if (a.matchType !== 'exact' && b.matchType === 'exact') return 1
    return 0
  })

  return matched
}

/**
 * テキスト正規化（日本語表記揺れ対応）
 * - Unicode NFKC正規化（全角→半角、合成文字の分解）
 * - 大文字/小文字統一
 * - 全角スペース→半角
 * - 記号・空白の除去
 * - かな→ローマ字の簡易変換（両方のパスで比較）
 * 
 * @returns {string} 正規化後のテキスト
 */
export function normalizeText(str) {
  if (!str) return ''
  let text = String(str)

  // Unicode NFKC正規化
  text = text.normalize('NFKC')

  // 大文字/小文字統一
  text = text.toLowerCase()

  // 全角スペース→半角
  text = text.replace(/\u3000/g, ' ')

  // 全角英数字→半角
  text = text.replace(/[\uFF10-\uFF19]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
  text = text.replace(/[\uFF21-\uFF3A]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
  text = text.replace(/[\uFF41-\uFF5A]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))

  // 記号・空白を除去（中黒「・」も包含）
  text = text.replace(/[\s\-_.~\^\/\\|@#$%&*+<>[\]{}()\u30FB\u00B7\u2027]/g, '')

  return text.trim()
}

/**
 * かな→ローマ字変換（簡易）
 * 表記揺れ吸収のため、かな表記とローマ字表記の両方でマッチング
 */
const KANA_TO_ROMAJI = {
  'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
  'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
  'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
  'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
  'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
  'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
  'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
  'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
  'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
  'わ': 'wa', 'を': 'wo', 'ん': 'n',
  'ア': 'a', 'イ': 'i', 'ウ': 'u', 'エ': 'e', 'オ': 'o',
  'カ': 'ka', 'キ': 'ki', 'ク': 'ku', 'ケ': 'ke', 'コ': 'ko',
  'サ': 'sa', 'シ': 'shi', 'ス': 'su', 'セ': 'se', 'ソ': 'so',
  'タ': 'ta', 'チ': 'chi', 'ツ': 'tsu', 'テ': 'te', 'ト': 'to',
  'ナ': 'na', 'ニ': 'ni', 'ヌ': 'nu', 'ネ': 'ne', 'ノ': 'no',
  'ハ': 'ha', 'ヒ': 'hi', 'フ': 'fu', 'ヘ': 'he', 'ホ': 'ho',
  'マ': 'ma', 'ミ': 'mi', 'ム': 'mu', 'メ': 'me', 'モ': 'mo',
  'ヤ': 'ya', 'ユ': 'yu', 'ヨ': 'yo',
  'ラ': 'ra', 'リ': 'ri', 'ル': 'ru', 'レ': 're', 'ロ': 'ro',
  'ワ': 'wa', 'ヲ': 'wo', 'ン': 'n'
}

/**
 * かな→ローマ字に変換したテキストを返す
 */
export function romanizeText(str) {
  if (!str) return ''
  let result = ''
  for (const char of str) {
    result += KANA_TO_ROMAJI[char] || char
  }
  return result.replace(/[\s\-_.~\^\/\\|@#$%&*+<>[\]{}()]/g, '').trim()
}

/**
 * 2つの正規化テキストがマッチするか判定
 * 直接比較 + ローマ字変換比較の両方を行う
 */
export function textsMatch(textA, textB, keyword) {
  const normA = normalizeText(textA)
  const normB = normalizeText(textB)
  const normKw = normalizeText(keyword)

  // 直接比較
  if (normB === normKw) return 'exact'
  if (normB.includes(normKw)) return 'partial'

  // ローマ字変換比較（かな→ローマ字）
  const romB = romanizeText(textB)
  const romKw = romanizeText(keyword)
  if (romB && romKw) {
    if (romB === romKw) return 'exact'
    if (romB.includes(romKw)) return 'partial'
  }

  return null
}
