/**
 * Overpass API クエリ生成・実行・キャッシュ
 * UIからクエリ生成を分離したデータ取得層
 */
import { getOverpassUrl, getEndpointLabel, APP_CONFIG } from '../config'
import { getCategoryById, categoryToQueryFilter } from '../data/categories'

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
 * カテゴリのタグ条件をOverpassクエリ文字列に変換
 */
function buildCategoryFilter(category) {
  if (!category) return ''
  const cat = getCategoryById(category)
  return categoryToQueryFilter(cat)
}

/**
 * かんたん検索用クエリを生成
 */
export function buildSimpleQuery(bbox, category, keyword) {
  const { south, west, north, east } = bbox
  const bboxStr = `${south},${west},${north},${east}`

  const tagFilter = buildCategoryFilter(category)

  let query
  if (tagFilter) {
    query = `[out:json][timeout:25];(\n  node[${tagFilter}](${bboxStr});\n  way[${tagFilter}](${bboxStr});\n  relation[${tagFilter}](${bboxStr});\n);\nout body center;\n`
  } else {
    // カテゴリなし: 全要素
    query = `[out:json][timeout:25];(\n  node(${bboxStr});\n  way(${bboxStr});\n  relation(${bboxStr});\n);\nout body center;\n`
  }

  return { query, keyword }
}

/**
 * 詳細検索用クエリを生成
 */
export function buildAdvancedQuery(bbox, tags, keyword, useAnd) {
  const { south, west, north, east } = bbox
  const bboxStr = `${south},${west},${north},${east}`

  const conditions = tags
    .map((tag) => {
      if (!tag.key) return null
      const safeKey = escapeStr(tag.key)
      if (tag.mode === 'equals') return `${safeKey}=${escapeStr(tag.value || '')}`
      if (tag.mode === 'exists') return `${safeKey}=*`
      if (tag.mode === 'not_exists') return `!${safeKey}`
      return null
    })
    .filter(Boolean)

  const tagFilter = conditions.join(' ')
  const filter = tagFilter ? `[${tagFilter}]` : ''

  const query = `[out:json][timeout:25];(\n  node${filter}(${bboxStr});\n  way${filter}(${bboxStr});\n  relation${filter}(${bboxStr});\n);\nout body center;\n`

  return { query, keyword }
}

/**
 * 文字列エスケープ（Overpassクエリ内）
 */
function escapeStr(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
}

// ============================================================
// Overpass API 実行
// ============================================================

/**
 * Overpass API にクエリを実行
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

  const url = getOverpassUrl(endpoint)
  const cKey = cacheKey(query, endpoint)

  // キャッシュチェック（キーは query＋エンドポイントID）
  const cached = getFromCache(cKey)
  if (cached) {
    return {
      results: cached.data,
      meta: { ...cached.meta, cached: true }
    }
  }

  // キャンセルサポート
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  // 外部シグナル連携
  if (externalSignal) {
    externalSignal.addEventListener('abort', () => controller.abort())
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal
    })

    // 429: レート制限 → 再試行
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10)
      throw new OverpassError(
        `Overpass APIのレート制限に達しました（${retryAfter}秒待ってから再試行）`,
        'rate_limit',
        `${retryAfter}秒待ってから再実行してください。`
      )
    }

    // 5xx: サーバーエラー → 再試行提案
    if (response.status >= 500) {
      throw new OverpassError(
        `Overpass APIに問題があります（${response.status}）`,
        'server_error',
        '数分待ってから再試行してください。または別インスタンスに切り替えてください。'
      )
    }

    if (!response.ok) {
      throw new OverpassError(
        `Overpass APIエラー（${response.status}）`,
        'server_error',
        'クエリ内容を確認して再試行してください。'
      )
    }

    const data = await response.json()

    // Overpassの内部エラーチェック
    if (data.remark && /error/i.test(data.remark)) {
      throw new OverpassError(
        `クエリエラー: ${data.remark}`,
        'invalid_query',
        '検索条件を確認して再試行してください。'
      )
    }

    const results = parseOverpassResponse(data)
    const meta = {
      fetchedAt: new Date().toISOString(),
      endpoint: getEndpointLabel(endpoint),
      elementCount: data.elements ? data.elements.length : 0,
      cached: false
    }

    // キャッシュに格納
    setToCache(cKey, results, meta)

    // 結果が空の場合
    if (results.length === 0) {
      return { results: [], meta: { ...meta, empty: true } }
    }

    return { results, meta }
  } catch (error) {
    if (error.name === 'AbortError') {
      // タイムアウト or 手動キャンセル
      const isTimeout = !externalSignal || !externalSignal.aborted
      if (isTimeout) {
        throw new OverpassError(
          'タイムアウトしました（30秒）',
          'timeout',
          '検索範囲を狭めて再試行してください。'
        )
      }
      throw new OverpassError(
        '検索がキャンセルされました',
        'network',
        null
      )
    }
    if (error instanceof OverpassError) {
      throw error
    }
    // ネットワークエラー
    throw new OverpassError(
      `接続に失敗しました: ${error.message}`,
      'network',
      'ネットワーク接続を確認して再試行してください。'
    )
  } finally {
    clearTimeout(timeoutId)
    if (externalSignal) {
      externalSignal.removeEventListener('abort', () => controller.abort())
    }
  }
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

  // 記号・空白を除去
  text = text.replace(/[\s\-_.~\^\/\\|@#$%&*+<>[\]{}()]/g, '')

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
