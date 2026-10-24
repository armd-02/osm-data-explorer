/**
 * 検索結果のエクスポート（CSV / GeoJSON）
 */

/**
 * CSV形式で検索結果を出力
 * - UTF-8 BOM付き（Excel対応）
 * - 数式注入対策（= + - @ 等の前置き）
 * - OSM型・ID・URL・座標・主要タグ
 */
export function toCSV(results, meta = {}) {
  const MAIN_TAGS = ['name', 'name:ja', 'cuisine', 'opening_hours', 'phone', 'website', 'email', 'addr:street', 'addr:housenumber', 'addr:city', 'addr:postcode']

  const headers = ['name', 'type', 'osm_id', 'osm_url', 'lat', 'lon', ...MAIN_TAGS.filter(t => t !== 'name')]

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
      r.lat?.toFixed(6) || '',
      r.lon?.toFixed(6) || '',
      ...activeTags.map(tag => csvEscape(r.tags?.[tag] || ''))
    ]
    lines.push(row.join(','))
  }

  // メタデータコメント
  const metaLines = [
    `# OSM Data Explorer export`,
    `# 取得日時: ${meta.fetchedAt || new Date().toISOString()}`,
    `# 出典: OpenStreetMap (ODbL) / Overpass API`,
    `# 件数: ${results.length}`,
    `# © OpenStreetMap contributors`
  ]

  // BOM + メタ + 本体
  return '\uFEFF' + metaLines.join('\n') + '\n' + lines.join('\n')
}

/**
 * CSV値のエスケープ
 * - 改行・カンマ・クォートを含む場合 → クォートで囲む
 * - 数式注入対策: = + - @ を前置き
 */
function csvEscape(value) {
  let str = String(value ?? '')
  
  // 数式注入対策
  if (/^[=+\-@]/.test(str)) {
    str = "'" + str
  }
  
  // クォートが必要か
  if (/[",\n\r]/.test(str)) {
    str = '"' + str.replace(/"/g, '""') + '"'
  }
  
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
