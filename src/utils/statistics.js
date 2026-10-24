/**
 * 検索結果の集計・分類・属性欠損分析
 */

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
  lines.push(['# OSM Data Explorer 集計結果'])
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
