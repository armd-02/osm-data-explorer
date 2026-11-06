/**
 * 検索結果の集計・分類・属性欠損分析
 */
import { safeWebsite, formatAddress } from './facilityLabels'

/**
 * 集計データを計算
 */
export function computeStatistics(results, meta = {}) {
  const stats = {
    total: results.length,
    byType: {},
    byTag: {},
    missingAttributes: {},
    topNames: [],
    fetchedAt: meta.fetchedAt || null,
    endpoint: meta.endpoint || null,
    cached: meta.cached || false
  }

  // 型別集計
  for (const r of results) {
    stats.byType[r.type] = (stats.byType[r.type] || 0) + 1
  }

  // タグ値別集計（主要タグ）
  const ANALYZE_TAGS = ['amenity', 'shop', 'cuisine', 'building', 'leisure', 'tourism', 'highway', 'sport', 'healthcare']
  for (const tag of ANALYZE_TAGS) {
    const values = {}
    let present = 0
    for (const r of results) {
      const val = r.tags?.[tag]
      if (val) {
        present++
        values[val] = (values[val] || 0) + 1
      }
    }
    if (present > 0) {
      stats.byTag[tag] = { total: present, values: sortDesc(values) }
    }
  }

  // 属性欠損分析
  const CHECK_TAGS = ['phone', 'website', 'opening_hours', 'email', 'addr:street', 'addr:city', 'addr:postcode']
  for (const tag of CHECK_TAGS) {
    let present = 0
    for (const r of results) {
      if (r.tags?.[tag]) present++
    }
    const rate = results.length > 0 ? (present / results.length * 100) : 0
    stats.missingAttributes[tag] = {
      present,
      missing: results.length - present,
      rate: Math.round(rate * 10) / 10
    }
  }

  // 名前がある/ない
  stats.hasName = results.filter(r => r.name).length
  stats.noName = results.length - stats.hasName

  return stats
}

/**
 * (B1) 結果画面で表示する主要属性の定義
 * 一覧・カードで実際に表示される値（facilityLabels の同一ロジック）と揃えている。
 */
export const DISPLAY_ATTRIBUTES = [
  { key: 'phone', label: '電話', icon: '📞',
    has: (tags) => !!(tags?.phone || tags?.['contact:phone']) },
  { key: 'opening_hours', label: '営業時間', icon: '🕒',
    has: (tags) => !!tags?.opening_hours },
  { key: 'website', label: 'Webサイト', icon: '🌐',
    has: (tags) => !!safeWebsite(tags) },
  { key: 'address', label: '住所', icon: '📍',
    has: (tags) => !!formatAddress(tags) }
]

/**
 * (B1) 属性の充足率を計算（#9 の属性欠損分析の同一方式）
 * @param {Array} results 対象とする結果（表示中の結果を渡すと絞り込み後に追従する）
 * @param {Array} attributes 判定定義（既定: DISPLAY_ATTRIBUTES）
 * @returns {Object} { [key]: { present, total } }
 */
/**
 * (B2) 属性キー → 日本語ラベル の対応表
 */
export const ATTRIBUTE_LABELS = Object.fromEntries(
  DISPLAY_ATTRIBUTES.map((a) => [a.key, a.label])
)

/**
 * (B2) 1つの結果が欠けている属性のキー配列を返す
 * @param {object} result - Overpass result
 * @returns {string[]} 例: ['opening_hours', 'website']
 */
export function missingAttributesOf(result) {
  const tags = result?.tags
  return DISPLAY_ATTRIBUTES.filter((a) => !a.has(tags)).map((a) => a.key)
}

export function computeAttributeCompleteness(results, attributes = DISPLAY_ATTRIBUTES) {
  const list = results || []
  const total = list.length
  const out = {}
  for (const attr of attributes) {
    let present = 0
    for (const r of list) {
      if (attr.has(r?.tags)) present++
    }
    out[attr.key] = { present, total }
  }
  return out
}

/**
 * 値の集計を降順にソート
 */
function sortDesc(obj) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
}

/**
 * 集計をCSVで出力
 */
export function statsToCSV(stats) {
  const lines = []
  
  // 基本情報
  lines.push(['# まちデータ帳 集計結果'])
  lines.push(['# 取得日時', stats.fetchedAt || ''])
  lines.push(['# 総件数', String(stats.total)])
  lines.push([])

  // 型別
  lines.push(['# 型別集計'])
  lines.push(['type', 'count'])
  for (const [type, count] of Object.entries(stats.byType)) {
    lines.push([type, String(count)])
  }
  lines.push([])

  // タグ別
  for (const [tag, data] of Object.entries(stats.byTag)) {
    lines.push([`# ${tag} 値別集計 (存在: ${data.total}件)`])
    lines.push(['value', 'count'])
    for (const [val, count] of data.values.slice(0, 20)) {
      lines.push([val, String(count)])
    }
    lines.push([])
  }

  // 欠損率
  lines.push(['# 属性欠損率'])
  lines.push(['attribute', 'present', 'missing', 'present_rate(%)'])
  for (const [tag, data] of Object.entries(stats.missingAttributes)) {
    lines.push([tag, String(data.present), String(data.missing), String(data.rate)])
  }

  return lines.map(l => l.map(v => String(v ?? '')).join(',')).join('\n')
}
