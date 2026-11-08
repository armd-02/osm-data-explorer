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

// 各フィールドに対応する既存列名の別名（小文字化して比較）
const FIELD_ALIASES = {
  lat: ['lat', 'latitude', '緯度'],
  lon: ['lon', 'lng', 'longitude', '経度'],
  osmid: ['osmid', 'osm_id']
}
const OUTPUT_FIELDS = ['lat', 'lon', 'osmid']

const normHeader = (h) => String(h).trim().toLowerCase()

/**
 * 指定フィールドに対応する既存列のヘッダー内インデックスを返す（該当なければ-1）
 */
function findFieldColumn(headers, field) {
  const aliases = FIELD_ALIASES[field].map(normHeader)
  return headers.findIndex(h => aliases.includes(normHeader(h)))
}

/**
 * 取込元のCSVの全列・全行・列順・行順をそのまま保ったまま、
 * 確定した施設のみ座標（lat/lon）とosmid（type/id形式）を書き込んで出力する。
 *
 * 列の書き込み規則:
 * - 元のCSVに当該フィールドに対応する列が既にある場合は、その列の位置に
 *   上書きする（別名: lat/latitude/緯度, lon/lng/longitude/経度, osmid/osm_id）。
 * - 対応する列がなければ、末尾に新列（名前は lat/lon/osmid）を追加する。
 * - 確定済みのない行（候補未確定・候補なし・導出されない行）は、対応する
 *   lat/lon/osmid を空欄で出力する（既存列は空欄で上書き、追加列は空欄）。
 *
 * matchResults は batchMatchCsvRows() の戻り値のように、元のCSVの行順に
 * 揃ったもの（matchResults[i] が rows[i] に対応）を渡す。
 * キー列が全空の行（matchType 'empty'）や結果が足りない行は確定結果が
 * ないのと同じ扱いで、lat/lon/osmid は空欄になる。
 *
 * @param {{fileName: string, headers: string[], rows: Array<Object>}|null} csvData（取込なければnull）
 * @param {Array} matchResults - batchMatchCsvRows() と確定操作後の、行順に揃った照合結果
 * @returns {string} UTF-8 BOM付きの標準CSV（元の列＋lat/lon/osmid）
 */
export function originalCsvWithMatchToCSV(csvData, matchResults) {
  const headers = Array.isArray(csvData?.headers) ? csvData.headers : []
  const rows = Array.isArray(csvData?.rows) ? csvData.rows : []
  const results = Array.isArray(matchResults) ? matchResults : []

  // 各フィールドの対応列インデックス（-1: 該当列なし）
  const fieldCol = {}
  for (const f of OUTPUT_FIELDS) fieldCol[f] = findFieldColumn(headers, f)

  // 出力ヘッダー = 元のヘッダー ＋ 対応列のないフィールドのみ末尾に追加（lat, lon, osmid順）
  const appended = OUTPUT_FIELDS.filter(f => fieldCol[f] === -1)
  const lines = [headers.concat(appended).map(csvCell).join(',')]

  rows.forEach((row, i) => {
    // 確定施設のみ計算値を持つ（未確認・座標なし・ID不正・結果なしは空文字）
    let lat = ''
    let lon = ''
    let osmid = ''
    const m = results[i]?.confirmed ? results[i].matched : null
    if (m && hasValidCoordinates(m)) {
      lat = Number(m.lat).toFixed(6)
      lon = Number(m.lon).toFixed(6)
      const type = ['node', 'way', 'relation'].includes(m.type) ? m.type : ''
      const id = m.id
      if (type && /^[1-9][0-9]*$/.test(String(id ?? ''))) {
        osmid = `${type}/${id}`
      }
    }
    const values = { lat, lon, osmid }

    // 行の値: 元のセル（元の列順）＋追加列
    const cells = headers.map(h => String(row?.[h] ?? ''))
    for (const f of OUTPUT_FIELDS) {
      if (fieldCol[f] === -1) {
        cells.push(values[f])            // 追加列（未確認は空欄）
      } else {
        cells[fieldCol[f]] = values[f]   // 既存列: 確定のみ値を書き込み、未確認は空欄で上書き
      }
    }
    lines.push(cells.map(csvCell).join(','))
  })

  return '\uFEFF' + lines.join('\n') + '\n'
}
