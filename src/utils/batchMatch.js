/**
 * 店舗名の一括照合
 * 名称リストをOSMデータと照合し、候補を提示する
 */
import { normalizeText, romanizeText } from './overpass'
import { normalizeNameForFuzzyMatch } from './nameVariants'

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
  const fuzzyName = normalizeNameForFuzzyMatch(name)
  const candidates = []
  const typeOrder = { exact: 0, partial: 1, similar: 2 }

  for (const result of results) {
    const nameTags = ['name', 'name:ja', 'official_name', 'alt_name', 'name:en']
    let bestMatch = null

    for (const tag of nameTags) {
      const value = result.tags?.[tag]
      if (!value) continue

      const normVal = normalizeText(value)
      const romVal = romanizeText(value)
      const fuzzyVal = normalizeNameForFuzzyMatch(value)
      let type = null

      if (normVal === normName || (romVal && romName && romVal === romName)) {
        type = 'exact'
      } else if (normVal.includes(normName) || normName.includes(normVal)) {
        type = 'partial'
      } else if (romVal && romName && (romVal.includes(romName) || romName.includes(romVal))) {
        type = 'similar'
      } else if (fuzzyName.length >= 6 && fuzzyName === fuzzyVal) {
        // 語の表記揺れ・接続助詞の省略は「完全一致」としない。
        // 一致候補として提示し、ユーザーによるOSM IDの確認を必要とする。
        type = 'similar'
      }

      if (type && (!bestMatch || typeOrder[type] < typeOrder[bestMatch.type])) {
        bestMatch = { type, tag, value }
      }
      if (bestMatch?.type === 'exact') break
    }

    if (bestMatch) {
      candidates.push({ result, match: bestMatch })
    }
  }

  // 候補をソート（exact > partial > similar）
  // 注意: typeOrder['exact'] が 0 なので ?? を使用する（|| だと 0 がfalsy扱いされる）
  candidates.sort((a, b) => (typeOrder[a.match.type] ?? 3) - (typeOrder[b.match.type] ?? 3))

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
 * - 全フィールドにエスケープを適用
 * - ヘッダーが最初の行（標準CSVリーダー対応）
 * - メタデータは末尾に配置
 * - confirmed フラグで「ユーザー確認済み」と「自動選択（未確認）」を区別
 */
export function matchResultsToCSV(matchResults) {
  const headers = ['row', 'input_name', 'match_type', 'confirmed', 'osm_type', 'osm_id', 'osm_url', 'lat', 'lon', 'matched_tag', 'matched_value', 'candidates_count']
  const lines = [headers.map(csvEscape).join(',')]

  for (const r of matchResults) {
    if (r.matchType === 'none') {
      const row = [String(r.index), r.inputName, '候補なし', '', '', '', '', '', '', '', '0']
      lines.push(row.map(csvEscape).join(','))
    } else {
      const m = r.matched
      const matchLabel = r.matchType === 'exact' ? '完全一致' : r.matchType === 'partial' ? '部分一致' : '類似'
      const confirmed = r.confirmed ? 'はい' : 'いいえ'
      const row = [
        String(r.index), r.inputName, matchLabel, confirmed,
        m.type, String(m.id), m.url,
        m.lat != null ? m.lat.toFixed(6) : '',
        m.lon != null ? m.lon.toFixed(6) : '',
        m.matchedTag, m.matchedValue, String(r.candidates.length)
      ]
      lines.push(row.map(csvEscape).join(','))
    }
  }

  const meta = [
    `# 店舗名照合結果`,
    `# 日時: ${new Date().toISOString()}`,
    `# 出典: OpenStreetMap (ODbL) / © OpenStreetMap contributors`,
    `# 注: 「候補なし」はOSMに未登録であるとは限りません（表記違いの可能性があります）`,
    `# confirmed: はい=ユーザー確認済み / いいえ=自動選択（要確認）`
  ]

  return '\uFEFF' + lines.join('\n') + '\n' + meta.join('\n') + '\n'
}

function csvEscape(value) {
  const str = String(value ?? '')
  const needsQuote = /[",\n\r]/.test(str)
  const needsGuard = /^[=+\-@]/.test(str)

  if (needsQuote) {
    const inner = needsGuard ? "'" + str : str
    return '"' + inner.replace(/"/g, '""') + '"'
  }
  if (needsGuard) return "'" + str
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
