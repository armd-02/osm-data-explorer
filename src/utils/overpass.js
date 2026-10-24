/**
 * Overpass API クエリ生成と実行
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const TIMEOUT_MS = 30000

/**
 * かんたん検索用クエリを生成
 * @param {object} bbox - { south, west, north, east }
 * @param {object|null} categoryTags - カテゴリから解決したタグオブジェクト (例: {amenity: 'cafe'})
 * @param {string} keyword - キーワード（後フィルタ用）
 */
export function buildSimpleQuery(bbox, categoryTags, keyword) {
  const { south, west, north, east } = bbox

  // Build tag filter from resolved category tags
  let tagFilter = ''
  if (categoryTags) {
    tagFilter = Object.entries(categoryTags)
      .map(([k, v]) => escapeOverpassString(`${k}=${v}`))
      .join(' ')
  }

  const bboxStr = `${south},${west},${north},${east}`
  const query = `
[out:json][timeout:25];
(
  node[${tagFilter}](${bboxStr});
  way[${tagFilter}](${bboxStr});
  relation[${tagFilter}](${bboxStr});
);
out body center;
`

  return { query, keyword }
}

/**
 * 詳細検索用クエリを生成
 */
export function buildAdvancedQuery(bbox, tags, keyword, useAnd) {
  const { south, west, north, east } = bbox
  const conditions = tags.map((tag) => {
    if (tag.mode === 'equals') {
      return escapeOverpassString(`${tag.key}=${tag.value}`)
    } else if (tag.mode === 'exists') {
      return escapeOverpassString(`${tag.key}=*`)
    } else if (tag.mode === 'not_exists') {
      return escapeOverpassString(`!${tag.key}`)
    }
    return ''
  }).filter(Boolean)

  const joiner = useAnd ? ' ' : ' '  // In Overpass, multiple tags in [] are AND by default
  const tagFilter = conditions.join(' ')
  const bboxStr = `${south},${west},${north},${east}`

  const query = `
[out:json][timeout:25];
(
  node[${tagFilter}](${bboxStr});
  way[${tagFilter}](${bboxStr});
  relation[${tagFilter}](${bboxStr});
);
out body center;
`

  return { query, keyword }
}

/**
 * Overpassクエリ文字列のエスケープ
 */
function escapeOverpassString(str) {
  return str.replace(/['\\]/g, '\\$&')
}

/**
 * Overpass API にクエリを実行
 */
export async function executeOverpassQuery(query) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal
    })

    if (response.status === 429) {
      throw new Error('Overpass APIのレート制限に達しました。1〜2分おいて再試行してください。')
    }
    if (response.status >= 500) {
      throw new Error('Overpass APIに問題があります。時間をおいて再試行してください。')
    }
    if (!response.ok) {
      throw new Error(`Overpass APIエラー (${response.status})`)
    }

    const data = await response.json()
    return parseOverpassResponse(data)
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('タイムアウトしました。検索範囲を狭めて再試行してください。')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Overpass APIのレスポンスを標準形式に変換
 */
function parseOverpassResponse(data) {
  if (!data.elements) return []

  return data.elements.map((el) => {
    const result = {
      id: el.id,
      type: el.type, // 'node' | 'way' | 'relation'
      tags: el.tags || {},
      lat: null,
      lon: null
    }

    // Get coordinates
    if (el.type === 'node') {
      result.lat = el.lat
      result.lon = el.lon
    } else if (el.center) {
      result.lat = el.center.lat
      result.lon = el.center.lon
    } else if (el.type === 'way' && el.nodes && el.nodes.length > 0) {
      // For ways without center, we don't have coordinates in "out body"
      // Use center if available
      if (el.center) {
        result.lat = el.center.lat
        result.lon = el.center.lon
      }
    }

    // Extract name
    if (el.tags && el.tags.name) {
      result.name = el.tags.name
    }

    return result
  }).filter((r) => r.lat !== null && r.lon !== null)
}

/**
 * キーワードで結果をフィルタ
 */
export function filterByKeyword(results, keyword) {
  if (!keyword || keyword.trim() === '') return results
  const kw = keyword.trim().toLowerCase()
  return results.filter((r) => {
    const name = (r.name || '').toLowerCase()
    return name.includes(kw)
  })
}
