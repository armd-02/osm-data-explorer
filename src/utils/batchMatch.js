/**
 * 店舗名の一括照合
 * 名称リストをOSMデータと照合し、候補を提示する
 */
import { normalizeText, romanizeText } from './overpass'

/**
 * 1件の名称をOSM結果と照合
 * @returns {{matchType: string, candidates: Array, matched: object|null}}
 */
export function matchName(name, results) {
  if (!name || !name.trim()) {
    return { matchType: 'empty', candidates: [], matched: null }
  }

  const normName = normalizeText(name)
  const romName = romanizeText(name)
  const candidates = []

  for (const result of results) {
    const nameTags = ['name', 'name:ja', 'official_name', 'alt_name', 'name:en']
    let bestMatch = null

    for (const tag of nameTags) {
      const value = result.tags?.[tag]
      if (!value) continue

      const normVal = normalizeText(value)
      const romVal = romanizeText(value)

      // 完全一致（正規化後）
      if (normVal === normName) {
        bestMatch = { type: 'exact', tag, value }
        break
      }
      // ローマ字一致
      if (romVal && romName && romVal === romName) {
        if (!bestMatch || bestMatch.type !== 'exact') {
          bestMatch = { type: 'exact', tag, value }
        }
      }
      // 部分一致
      if (normVal.includes(normName) || normName.includes(normVal)) {
        if (!bestMatch || bestMatch.type === 'partial') {
          bestMatch = { type: 'partial', tag, value }
        }
      }
      // 類似（ローマ字部分一致）
      if (romVal && romName && (romVal.includes(romName) || romName.includes(romVal))) {
        if (!bestMatch || bestMatch.type === 'similar') {
          bestMatch = { type: 'similar', tag, value }
        }
      }
    }

    if (bestMatch) {
      candidates.push({ result, match: bestMatch })
    }
  }

  // 候補をソート（exact > partial > similar）
  const typeOrder = { exact: 0, partial: 1, similar: 2 }
  candidates.sort((a, b) => (typeOrder[a.match.type] || 3) - (typeOrder[b.match.type] || 3))

  if (candidates.length === 0) {
    return { matchType: 'none', candidates: [], matched: null }
  }

  const best = candidates[0]
  return {
    matchType: best.match.type,
    candidates,
    matched: {
      id: best.result.id,
      type: best.result.type,
      name: best.result.name,
      lat: best.result.lat,
      lon: best.result.lon,
      url: `https://www.openstreetmap.org/${best.result.type}/${best.result.id}`,
      matchType: best.match.type,
      matchedTag: best.match.tag,
      matchedValue: best.match.value
    }
  }
}

/**
 * 名称リストを一括照合
 * @param {Array<string>} names - 名称リスト
 * @param {Array} results - OSM検索結果
 * @returns {Array} 各名称の照合結果
 */
export function batchMatch(names, results) {
  return names.map((name, index) => ({
    index: index + 1,
    inputName: name,
    ...matchName(name, results)
  }))
}

/**
 * 照合結果をCSVで出力
 */
export function matchResultsToCSV(matchResults) {
  const headers = ['row', 'input_name', 'match_type', 'osm_type', 'osm_id', 'osm_url', 'lat', 'lon', 'matched_tag', 'matched_value', 'candidates_count']
  const lines = [headers.join(',')]

  for (const r of matchResults) {
    if (r.matchType === 'none') {
      lines.push([
        String(r.index),
        csvEscape(r.inputName),
        '候補なし',
        '', '', '', '', '', '', '', '0'
      ].join(','))
    } else {
      const m = r.matched
      lines.push([
        String(r.index),
        csvEscape(r.inputName),
        r.matchType === 'exact' ? '完全一致' : r.matchType === 'partial' ? '部分一致' : '類似',
        m.type,
        String(m.id),
        m.url,
        m.lat?.toFixed(6) || '',
        m.lon?.toFixed(6) || '',
        m.matchedTag,
        csvEscape(m.matchedValue),
        String(r.candidates.length)
      ].join(','))
    }
  }

  const meta = [
    `# 店舗名照合結果`,
    `# 日時: ${new Date().toISOString()}`,
    `# 出典: OpenStreetMap (ODbL) / © OpenStreetMap contributors`,
    `# 注: 「候補なし」はOSMに未登録であるとは限りません（表記違いの可能性があります）`
  ]

  return '\uFEFF' + meta.join('\n') + '\n' + lines.join('\n')
}

function csvEscape(value) {
  let str = String(value ?? '')
  if (/^[=+\-@]/.test(str)) str = "'" + str
  if (/[",\n\r]/.test(str)) str = '"' + str.replace(/"/g, '""') + '"'
  return str
}

/**
 * テキストから名称リストを解析
 * 1行1名称（カンマ区切りも対応）
 */
export function parseNameList(text) {
  if (!text || !text.trim()) return []
  
  // 1行ずつ分割
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  
  // CSV形式（カンマ区切り）の検出
  const firstLine = lines[0] || ''
  if (firstLine.includes(',') && lines.length > 1) {
    // 複数カラムの場合、最初の列を名称として使用
    return lines.map(l => l.split(',')[0].trim()).filter(Boolean)
  }
  
  return lines
}
