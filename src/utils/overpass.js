/**
 * Overpass API クエリ生成・実行・キャッシュ
 * UIからクエリ生成を分離したデータ取得層
 */
import { getOverpassUrl, APP_CONFIG } from '../config'
import { getCategoryById } from '../data/categories'

// ============================================================
// メモリキャッシュ
// ============================================================
const cache = new Map()
let cacheOrder = [] // LRU用

function cacheKey(query, bbox) {
  return `${bbox.south.toFixed(6)},${bbox.west.toFixed(6)},${bbox.north.toFixed(6)},${bbox.east.toFixed(6)}|${query}`
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
 * タグ条件をOverpassクエリ文字列に変換（エスケープ付き）
 */
function buildTagFilter(tags) {
  if (!tags || Object.keys(tags).length === 0) return ''
  return Object.entries(tags)
    .map(([key, value]) => {
      const safeKey = escapeStr(key)
      if (value === '*') return `${safeKey}=*`
      if (value.startsWith('!')) return `!${safeKey}`
      return `${safeKey}=${escapeStr(value)}`
    })
    .join(' ')
}

/**
 * かんたん検索用クエリを生成
 */
export function buildSimpleQuery(bbox, category, keyword) {
  const { south, west, north, east } = bbox
  const bboxStr = `${south},${west},${north},${east}`

  let tagFilter = ''
  if (category) {
    const cat = getCategoryById(category)
    if (cat) {
      tagFilter = buildTagFilter(cat.tags)
    }
  }

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
    endpoint = 'public',
    timeout = APP_CONFIG.timeoutMs,
    signal: externalSignal
  } = options

  const url = getOverpassUrl(endpoint)
  const cKey = cacheKey(query, null)

  // キャッシュチェック（bboxはqueryに含まれるので簡易キー）
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
 * キーワードで結果をフィルタ（日本語対応: 全角/半角正規化）
 */
export function filterByKeyword(results, keyword) {
  if (!keyword || keyword.trim() === '') return results
  const kw = normalizeKeyword(keyword)
  return results.filter((r) => {
    const name = normalizeKeyword(r.name || '')
    return name.includes(kw)
  })
}

/**
 * 日本語キーワード正規化
 * 全角→半角、大文字/小文字統一
 */
function normalizeKeyword(str) {
  return str
    .toLowerCase()
    .replace(/[\uFF10-\uFF19]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[\uFF21-\uFF3A]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[\uFF41-\uFF5A]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/\uFF5C/g, '|')
    .replace(/\u3000/g, ' ')
}
