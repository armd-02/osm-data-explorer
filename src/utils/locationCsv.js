/**
 * 地図作成用の店舗名→座標CSV (#42)
 *
 * 「候補」は位置の確定ではない。ユーザーが確定したOSM地物だけ
 * 座標・OSM IDを出力し、入力順と候補なしの行も維持する。
 * way/relationの場合はOverpassが返した代表座標（中心点）。
 */
const HEADERS = [
  'name', 'lat', 'lon', 'status', 'matched_name',
  'osm_type', 'osm_id', 'osm_url', 'source'
]
const ATTRIBUTION = '© OpenStreetMap contributors (ODbL)'

function csvCell(value) {
  const raw = String(value ?? '')
  // Excel/LibreOfficeの数式注入を防ぐ（先行空白・タブも対象）。
  const safe = /^[\s\uFEFF]*[=+\-@]/.test(raw) ? "'" + raw : raw
  return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe
}

function hasValidCoordinates(matched) {
  if (!matched || matched.lat == null || matched.lon == null) return false
  const lat = Number(matched.lat)
  const lon = Number(matched.lon)
  return Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
}

/**
 * @param {Array} matchResults - batchMatch() と確定操作後の照合結果
 * @returns {string} UTF-8 BOM付きの標準CSV
 */
export function matchResultsToLocationCSV(matchResults) {
  const lines = [HEADERS.map(csvCell).join(',')]

  for (const row of matchResults ?? []) {
    const matched = row.confirmed ? row.matched : null
    const valid = hasValidCoordinates(matched)
    const type = matched && ['node', 'way', 'relation'].includes(matched.type)
      ? matched.type : ''
    const id = matched?.id
    const osmId = type && /^[1-9][0-9]*$/.test(String(id ?? ''))
      ? `${type}/${id}` : ''
    const osmUrl = osmId ? `https://www.openstreetmap.org/${osmId}` : ''

    const status = row.matchType === 'none' ? '候補なし'
      : !row.confirmed ? '要確認'
      : valid ? '確認済み' : '座標なし'

    const cells = [
      row.inputName ?? '',
      valid ? Number(matched.lat).toFixed(6) : '',
      valid ? Number(matched.lon).toFixed(6) : '',
      status,
      matched?.name ?? '',
      type,
      osmId,
      osmUrl,
      osmId ? ATTRIBUTION : ''
    ]
    lines.push(cells.map(csvCell).join(','))
  }

  return '\uFEFF' + lines.join('\n') + '\n'
}
