/**
 * 検索結果の集計・分類・属性欠損分析
 */
import { safeWebsite, formatAddress } from './facilityLabels'
import { CATEGORIES } from '../data/categories'
import { categoryMatchesElement } from './categoryMatch'
import { profileFor } from './categoryProfiles'

/**
 * 集計データを計算
 */
export function computeStatistics(results, meta = {}) {
  const m = meta || {}
  const list = Array.isArray(results) ? results : []
  const stats = {
    total: list.length,
    byType: {},
    byTag: {},
    missingAttributes: {},
    topNames: [],
    fetchedAt: m.fetchedAt || null,
    endpoint: m.endpoint || null,
    cached: m.cached || false
  }

  // 型別集計
  for (const r of list) {
    stats.byType[r.type] = (stats.byType[r.type] || 0) + 1
  }

  // タグ値別集計（主要タグ）
  const ANALYZE_TAGS = ['amenity', 'shop', 'cuisine', 'building', 'leisure', 'tourism', 'highway', 'sport', 'healthcare']
  for (const tag of ANALYZE_TAGS) {
    const values = {}
    let present = 0
    for (const r of list) {
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
    for (const r of list) {
      if (r.tags?.[tag]) present++
    }
    const rate = list.length > 0 ? (present / list.length * 100) : 0
    stats.missingAttributes[tag] = {
      present,
      missing: list.length - present,
      rate: Math.round(rate * 10) / 10
    }
  }

  // 名前がある/ない
  stats.hasName = list.filter(r => r.name).length
  stats.noName = list.length - stats.hasName

  // (集計表) カテゴリ別集計（アプリのカテゴリ体系に基づく）
  stats.categorySummary = computeCategorySummary(list)

  return stats
}

/**
 * (集計表) カテゴリ別集計を計算
 *
 * - カテゴリ判定は categoryMatchesElement（アプリのカテゴリ体系、#44 の
 *   カテゴリ絞り込みと同じロジック）を使用する。生のOSMタグ値（amenity=cafe など）
 *   ではなく、CATEGORIES の日本語ラベル（「カフェ」など）で集計する。
 * - 1つの要素が複数のカテゴリに属する場合は、各カテゴリに計上する
 *   （例: amenity=cafe は「カフェ」と「飲食店（すべて）」の両方に含まれる）。
 * - brand 内訳: brand タグをキーに集計し、brand が無い場合は名称
 *   （r.name / tags.name）にフォールバックする。名称も無い要素は
 *   件数には計上されるが内訳には含まれない。
 *
 * @param {Array<object>} results Overpass正規化済みの要素
 * @returns {Array<{id, label, icon, count, breakdown: Array<{name, count}>}>}
 *   件数が多いカテゴリ順
 */
export function computeCategorySummary(results) {
  const list = Array.isArray(results) ? results : []
  const counts = {}
  const brandCounts = {}

  for (const r of list) {
    if (!r || !r.tags) continue
    const brandKey = r.tags.brand || r.name || r.tags.name || ''
    for (const c of CATEGORIES) {
      if (!categoryMatchesElement(c.id, r)) continue
      counts[c.id] = (counts[c.id] || 0) + 1
      if (brandKey) {
        if (!brandCounts[c.id]) brandCounts[c.id] = {}
        brandCounts[c.id][brandKey] = (brandCounts[c.id][brandKey] || 0) + 1
      }
    }
  }

  return Object.entries(counts).map(([id, count]) => {
    const cat = CATEGORIES.find((c) => c.id === id)
    const profile = profileFor(id)
    return {
      id,
      label: cat ? cat.label : id,
      icon: (profile && profile.icon) || '📍',
      count,
      breakdown: Object.entries(brandCounts[id] || {})
        .sort((a, b) => b[1] - a[1])
        .map(([name, n]) => ({ name, count: n }))
    }
  }).sort((a, b) => b.count - a.count)
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

  // (集計表) カテゴリ別集計（アプリのカテゴリ体系のラベル）
  const categorySummary = stats.categorySummary || []
  if (categorySummary.length > 0) {
    lines.push([])
    lines.push(['# カテゴリ別集計'])
    lines.push(['category', 'count'])
    for (const c of categorySummary) {
      lines.push([c.label, String(c.count)])
    }

    lines.push([])
    lines.push(['# カテゴリ別ブランド内訳 (brandタグ、名称にフォールバック)'])
    lines.push(['category', 'name', 'count'])
    for (const c of categorySummary) {
      for (const b of c.breakdown.slice(0, 50)) {
        lines.push([c.label, b.name, String(b.count)])
      }
    }
  }

  return lines.map(l => l.map(v => String(v ?? '')).join(',')).join('\n')
}
