/**
 * 検索結果のエクスポート（CSV / GeoJSON）
 */

/**
 * CSV形式で検索結果を出力
 * - UTF-8 BOM付き（Excel対応）
 * - 数式注入対策（= + - @ 等の前置き）
 * - 全フィールドにエスケープを適用
 * - ヘッダーが最初の行にあり、メタデータは末尾に配置
 */
export function toCSV(results, meta = {}) {
  const MAIN_TAGS = ['name', 'name:ja', 'cuisine', 'opening_hours', 'phone', 'website', 'email', 'addr:street', 'addr:housenumber', 'addr:city', 'addr:postcode']

  // どのタグ列を含むか（結果中出现したもののみ）
  const activeTags = MAIN_TAGS.filter(tag => tag !== 'name' && results.some(r => r.tags?.[tag]))
  const allHeaders = ['name', 'type', 'osm_id', 'osm_url', 'lat', 'lon', ...activeTags]

  const lines = [allHeaders.map(h => csvEscape(h)).join(',')]

  for (const r of results) {
    const row = [
      r.name || '',
      r.type,
      String(r.id),
      `https://www.openstreetmap.org/${r.type}/${r.id}`,
      r.lat != null ? r.lat.toFixed(6) : '',
      r.lon != null ? r.lon.toFixed(6) : '',
      ...activeTags.map(tag => r.tags?.[tag] || '')
    ]
    // 全フィールドにエスケープを適用
    lines.push(row.map(csvEscape).join(','))
  }

  // メタデータは末尾に配置（標準CSVリーダーがヘッダーを正常に認識できるように）
  const metaLines = [
    `# OSM Data Explorer export`,
    `# 取得日時: ${meta.fetchedAt || new Date().toISOString()}`,
    `# 出典: OpenStreetMap (ODbL) / Overpass API`,
    `# 件数: ${results.length}`,
    `# © OpenStreetMap contributors`
  ]

  // BOM + ヘッダー+データ + メタ（末尾）
  return '\uFEFF' + lines.join('\n') + '\n' + metaLines.join('\n') + '\n'
}

/**
 * CSV値のエスケープ
 * - 改行・カンマ・クォートを含む場合 → クォートで囲む
 * - 数式注入対策: = + - @ を前置き
 */
function csvEscape(value) {
  const str = String(value ?? '')
  const needsQuote = /[",\n\r]/.test(str)
  const needsGuard = /^[=+\-@]/.test(str)

  if (needsQuote) {
    // クォート内で ' を前置き（両方適用）
    const inner = needsGuard ? "'" + str : str
    return '"' + inner.replace(/"/g, '""') + '"'
  }
  if (needsGuard) return "'" + str
  return str
}

/**
 * GeoJSON形式で検索結果を出力
 * - node → Point
 * - way/relation → Point（中心座標）+ propertiesに型情報
 * - 形状が取得できない場合は明示
 */
export function toGeoJSON(results, meta = {}) {
  const features = results.map(r => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [r.lon, r.lat]
    },
    properties: {
      osm_type: r.type,
      osm_id: r.id,
      name: r.name || null,
      url: `https://www.openstreetmap.org/${r.type}/${r.id}`,
      tags: r.tags || {},
      match_type: r.matchType || null,
      // way/relationは形状が未取得であることを明示
      geometry_note: r.type !== 'node' ? 'center point only (full geometry not fetched)' : null
    }
  }))

  return JSON.stringify({
    type: 'FeatureCollection',
    metadata: {
      source: 'OpenStreetMap / Overpass API',
      license: 'ODbL',
      attribution: '© OpenStreetMap contributors',
      fetched_at: meta.fetchedAt || new Date().toISOString(),
      endpoint: meta.endpoint || null,
      count: results.length,
      note: 'way/relation are represented as center points. Full geometry requires separate Overpass query.'
    },
    features
  }, null, 2)
}

/**
 * ファイルダウンロードを実行
 */
export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * 結果をCSVとしてダウンロード
 */
export function downloadCSV(results, meta) {
  const csv = toCSV(results, meta)
  const dateStr = new Date().toISOString().slice(0, 10)
  downloadFile(csv, `osm-results-${dateStr}.csv`, 'text/csv;charset=utf-8')
}

/**
 * 結果をGeoJSONとしてダウンロード
 */
export function downloadGeoJSON(results, meta) {
  const geojson = toGeoJSON(results, meta)
  const dateStr = new Date().toISOString().slice(0, 10)
  downloadFile(geojson, `osm-results-${dateStr}.geojson`, 'application/geo+json')
}
