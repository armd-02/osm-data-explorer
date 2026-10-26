/**
 * (#26) 前年度OSM ID対応表の読み込みと再検証
 *
 * 前年度のCSV（input_name, osm_type, osm_id）を読み込み、
 * 今回の検索結果と照合して検証状態を判定する。
 */

import { parseNameList } from './batchMatch'
import { normalizeText } from './overpass'

/**
 * 前年度CSVから {input_name, osm_type, osm_id} のリストを抽出
 * @param {string} csvText - CSVテキスト
 * @returns {Array<{name: string, osmType: string, osmId: string}>}
 */
export function parsePreviousYearCSV(csvText) {
  if (!csvText || !csvText.trim()) return []

  const lines = csvText.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  // ヘッダー行を解析
  const headerLine = lines[0]
  const headers = parseCSVLine(headerLine)

  // 必要なカラムのインデックスを特定
  const nameIdx = findColumn(headers, ['input_name', 'name', '店舗名', '名前'])
  const typeIdx = findColumn(headers, ['osm_type', 'type', 'OSM型'])
  const idIdx = findColumn(headers, ['osm_id', 'id', 'OSM ID', 'osmID'])
  const latIdx = findColumn(headers, ['lat', 'latitude', '緯度'])
  const lonIdx = findColumn(headers, ['lon', 'lng', 'longitude', '経度'])

  if (nameIdx === -1 || typeIdx === -1 || idIdx === -1) {
    return []
  }

  const entries = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    const name = (cols[nameIdx] || '').trim()
    const osmType = (cols[typeIdx] || '').trim()
    const osmId = (cols[idIdx] || '').trim()

    if (!name || !osmType || !osmId) continue
    if (!['node', 'way', 'relation'].includes(osmType)) continue

    // 座標を任意で読み込み（あれば位置比較が可能）
    let lat = null, lon = null
    if (latIdx !== -1 && lonIdx !== -1) {
      const latStr = (cols[latIdx] || '').trim()
      const lonStr = (cols[lonIdx] || '').trim()
      if (latStr && lonStr) {
        const latNum = parseFloat(latStr)
        const lonNum = parseFloat(lonStr)
        if (!isNaN(latNum) && !isNaN(lonNum)) {
          lat = latNum
          lon = lonNum
        }
      }
    }

    entries.push({ name, osmType, osmId, lat, lon })
  }

  return entries
}

/**
 * 前年度IDを検索結果と照合して検証状態を判定
 *
 * 検証状態:
 * - 'unchanged'     : 名称・位置がほぼ同じ → 変更なし
 * - 'name_changed'  : 同じID・位置だが名称が異なる → 名称変更候補
 * - 'location_diff' : 同じIDだが位置が大きくずれている → 位置違い
 * - 'not_in_bbox'   : 現在の検索結果にIDがない → BBOX外・未取得
 * - 'id_not_found'  : OSMに存在しない（別途API照会必要）
 *
 * @param {Array} prevEntries - parsePreviousYearCSV の結果
 * @param {Array} currentResults - 現在の検索結果（Overpassから取得）
 * @param {number} locationThresholdKm - 位置ずれの判定閾値（km、デフォルト0.5）
 * @returns {Array<{name, osmType, osmId, status, matchedName, matchedLat, matchedLon, nameDiff, locationDiffKm, matchedTags}>}
 */
export function verifyPreviousIds(prevEntries, currentResults, locationThresholdKm = 0.5) {
  if (!prevEntries || prevEntries.length === 0) return []
  if (!currentResults || currentResults.length === 0) {
    // 検索結果が空の場合は全て not_in_bbox
    return prevEntries.map(e => ({
      ...e,
      status: 'not_in_bbox',
      matchedName: null,
      matchedLat: null,
      matchedLon: null,
      nameDiff: null,
      locationDiffKm: null,
      matchedTags: null
    }))
  }

  // 現在の結果を type/id でインデックス化
  const resultMap = new Map()
  for (const r of currentResults) {
    const key = `${r.type}/${r.id}`
    resultMap.set(key, r)
  }

  return prevEntries.map(entry => {
    const key = `${entry.osmType}/${entry.osmId}`
    const match = resultMap.get(key)

    if (!match) {
      return {
        ...entry,
        status: 'not_in_bbox',
        matchedName: null,
        matchedLat: null,
        matchedLon: null,
        nameDiff: null,
        locationDiffKm: null,
        matchedTags: null
      }
    }

    // 名称比較
    const currentName = match.name || ''
    const prevName = entry.name || ''
    const nameDiff = normalizeText(prevName) !== normalizeText(currentName)

    // 位置比較（前年度CSVに座標があれば比較）
    let locationDiffKm = null
    if (entry.lat != null && entry.lon != null && match.lat != null && match.lon != null) {
      locationDiffKm = haversineKm(entry.lat, entry.lon, match.lat, match.lon)
    }

    // 状態判定
    let status
    if (locationDiffKm != null && locationDiffKm > locationThresholdKm) {
      status = 'location_diff'
    } else if (nameDiff) {
      status = 'name_changed'
    } else {
      status = 'unchanged'
    }

    return {
      ...entry,
      status,
      matchedName: currentName,
      matchedLat: match.lat,
      matchedLon: match.lon,
      nameDiff,
      locationDiffKm: locationDiffKm != null ? Math.round(locationDiffKm * 1000) / 1000 : null,
      matchedTags: match.tags || null
    }
  })
}

/**
 * 検証状態のラベル（日本語）
 */
export function getStatusLabel(status) {
  const labels = {
    'unchanged': '変更なし',
    'name_changed': '名称変更候補',
    'location_diff': '位置違い',
    'not_in_bbox': 'BBOX外・未取得',
    'id_not_found': 'ID不存在'
  }
  return labels[status] || status
}

/**
 * 検証結果をCSV出力
 */
export function verificationToCSV(results, meta = {}) {
  const headers = ['input_name', 'osm_type', 'osm_id', 'status', 'status_label',
    'matched_name', 'matched_lat', 'matched_lon', 'name_diff', 'location_diff_km', 'needs_confirmation']
  const lines = [headers.join(',')]

  const fetchedAt = meta.fetchedAt || new Date().toISOString()

  for (const r of results) {
    const row = [
      csvEscape(r.name),
      r.osmType,
      r.osmId,
      r.status,
      getStatusLabel(r.status),
      csvEscape(r.matchedName || ''),
      r.matchedLat != null ? r.matchedLat.toFixed(6) : '',
      r.matchedLon != null ? r.matchedLon.toFixed(6) : '',
      r.nameDiff ? 'yes' : 'no',
      r.locationDiffKm != null ? String(r.locationDiffKm) : '',
      'yes', // (#26) 旧年度確認状態をそのまま確定にせず再確認が必要
      fetchedAt
    ]
    lines.push(row.join(','))
  }

  return '\uFEFF' + lines.join('\n') + '\n'
}

// --- 内部ヘルパー ---

/**
 * CSV行を解析（RFC4180準拠）
 */
function parseCSVLine(line) {
  const cols = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        cols.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  cols.push(current)
  return cols
}

/**
 * ヘッダーからカラムインデックスを検索
 */
function findColumn(headers, candidates) {
  for (const candidate of candidates) {
    const idx = headers.findIndex(h => h.trim().toLowerCase() === candidate.toLowerCase())
    if (idx !== -1) return idx
  }
  return -1
}

/**
 * Haversine距離（km）
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371 // 地球半径 km
  const toRad = deg => deg * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function csvEscape(value) {
  const str = String(value ?? '')
  if (/[",\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  if (/^[=+\-@]/.test(str)) {
    return "'" + str
  }
  return str
}
