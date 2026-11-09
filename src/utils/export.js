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
  const MAIN_TAGS = ['name', 'name:ja', 'amenity', 'shop', 'tourism', 'leisure', 'office', 'healthcare', 'craft', 'cuisine', 'opening_hours', 'phone', 'website', 'email', 'addr:street', 'addr:housenumber', 'addr:city', 'addr:postcode']

  // どのタグ列を含むか（結果中出现したもののみ）
  const activeTags = MAIN_TAGS.filter(tag => tag !== 'name' && results.some(r => r.tags?.[tag]))
  // (#62 第5ピース) バリアフリー項目がある場合のみ専用列を追加（lon の直後）。
  // 施設結果のみではヘッダーが従来と完全に一致する（列構成を壊さない）。
  // 既存列の対応: osmId→osm_id（type/id形式）、lat/lon/name は既存列をそのまま使う。
  const hasBf = results.some(r => r.bf && typeof r.bf === 'object')
  const BF_COLUMNS = ['kind', 'tactile', 'kerb', 'hasSound', 'hasVibration', 'lengthM']
  const allHeaders = ['name', 'type', 'osm_id', 'osm_url', 'lat', 'lon',
    ...(hasBf ? BF_COLUMNS : []), ...activeTags, 'fetched_at', 'source']

  const fetchedAt = meta.fetchedAt || new Date().toISOString()
  const source = 'OpenStreetMap (ODbL) / Overpass API'

  const lines = [allHeaders.map(h => csvEscape(h)).join(',')]

  for (const r of results) {
    // バリアフリー項目の専用列の値（施設項目は空欄）
    const bf = r.bf && typeof r.bf === 'object' ? r.bf : null
    const bfValues = bf
      ? [
          bf.kind ?? '',
          yn(bf.tactile),
          yn(bf.kerb),
          yn(bf.hasSound),
          yn(bf.hasVibration),
          bf.lengthM != null ? String(bf.lengthM) : ''
        ]
      : hasBf ? Array(BF_COLUMNS.length).fill('') : []
    const row = [
      r.name || '',
      r.type,
      `${r.type}/${r.id}`,
      `https://www.openstreetmap.org/${r.type}/${r.id}`,
      r.lat != null ? r.lat.toFixed(6) : '',
      r.lon != null ? r.lon.toFixed(6) : '',
      ...bfValues,
      ...activeTags.map(tag => r.tags?.[tag] || ''),
      fetchedAt,
      source
    ]
    // 全フィールドにエスケープを適用
    lines.push(row.map(csvEscape).join(','))
  }

  // BOM + ヘッダー + 同一列幅のデータ行のみ
  return '\uFEFF' + lines.join('\n') + '\n'
}

/**
 * バリアフリー専用列の値を yes/no/空欄 に正規化する
 * - true / 'yes' → 'yes'、false / 'no' → 'no'、その他・null → ''（未記録）
 */
function yn(value) {
  if (value == null) return ''
  if (value === true || value === 'yes') return 'yes'
  if (value === false || value === 'no') return 'no'
  return ''
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
 * - 通常結果: node → Point / way/relation → Point（中心座標）
 * - (#62 第5ピース) バリアフリー項目（bf 付き）は線と点の混在で出力:
 *   way（bf.kind='way'）→ bf.geometry を LineString として、
 *   node（bf.kind='node'）→ bf.geometry を Point として出力する。
 *   bf 項目の properties は仕様どおり
 *   { osmId, kind, tactile, kerb, hasSound, hasVibration, lengthM, name(ある場合), tags }
 *   であり、通常結果のスキーマ（osm_type/osm_id/url/...）とは別に扱う。
 */
export function toGeoJSON(results, meta = {}) {
  const features = results.map(r => {
    const bf = r.bf && typeof r.bf === 'object' ? r.bf : null
    if (bf) {
      const geom = Array.isArray(bf.geometry) ? bf.geometry : []
      let geometry
      let geometryNote = null
      if (bf.kind === 'way' && geom.length >= 2) {
        geometry = { type: 'LineString', coordinates: geom }
      } else if (bf.kind === 'node' && geom.length === 2) {
        geometry = { type: 'Point', coordinates: geom }
      } else {
        // 使用可能なジオメトリが無い場合は中心点にフォールバックして明示
        geometry = { type: 'Point', coordinates: [r.lon, r.lat] }
        geometryNote = 'center point only (bf geometry unavailable)'
      }
      const properties = {
        osmId: r.osmId || `${r.type}/${r.id}`,
        kind: bf.kind,
        tactile: bf.tactile ?? null,
        kerb: bf.kerb ?? null,
        hasSound: !!bf.hasSound,
        hasVibration: !!bf.hasVibration,
        lengthM: bf.lengthM ?? null,
        tags: r.tags || {}
      }
      // name はある場合のみ含める
      if (r.name) properties.name = r.name
      if (geometryNote) properties.geometry_note = geometryNote
      return { type: 'Feature', geometry, properties }
    }
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
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
    }
  })

  // (#62 第5ピース) 中心点注記の扱い:
  // - 施設検索（bf 無し）: 従来どおり常に付与（出力内容を変えない）
  // - バリアフリー検索（bf 混在）: 実際に対象（bf 非付きの way/relation）がある場合のみ付与
  const hasBfResults = results.some(r => r.bf && typeof r.bf === 'object')
  const hasCenterPointWays = results.some(r => !(r.bf && typeof r.bf === 'object') && r.type !== 'node')

  return JSON.stringify({
    type: 'FeatureCollection',
    metadata: {
      source: 'OpenStreetMap / Overpass API',
      license: 'ODbL',
      attribution: '© OpenStreetMap contributors',
      fetched_at: meta.fetchedAt || new Date().toISOString(),
      endpoint: meta.endpoint || null,
      count: results.length,
      note: (!hasBfResults || hasCenterPointWays)
        ? 'way/relation are represented as center points. Full geometry requires separate Overpass query.'
        : null
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
 * (#44) prefixパラメータでファイル名をカスタマイズ可能
 */
export function downloadCSV(results, meta, prefix = 'osm-results') {
  const csv = toCSV(results, meta)
  const dateStr = new Date().toISOString().slice(0, 10)
  downloadFile(csv, `${prefix}-${dateStr}.csv`, 'text/csv;charset=utf-8')
}

/**
 * 結果をGeoJSONとしてダウンロード
 */
export function downloadGeoJSON(results, meta) {
  const geojson = toGeoJSON(results, meta)
  const dateStr = new Date().toISOString().slice(0, 10)
  downloadFile(geojson, `osm-results-${dateStr}.geojson`, 'application/geo+json')
}
