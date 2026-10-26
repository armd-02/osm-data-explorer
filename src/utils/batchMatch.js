/**
 * 店舗名の一括照合
 * 名称リストをOSMデータと照合し、候補を提示する
 * 判定優先順: 完全一致 > 部分一致 > 類似（編集距離）
 */
import { normalizeText, romanizeText } from './overpass'
import { normalizeNameForFuzzyMatch } from './nameVariants'

/**
 * レーベンシュタイン距離（編集距離）を計算
 * DP方式。長さが差で既に閾値を超える場合は早期終了。
 */
export function levenshteinDistance(a, b, maxDist = Infinity) {
  const la = a.length, lb = b.length
  if (Math.abs(la - lb) > maxDist) return maxDist + 1

  // 1行だけ保持するメモリ効率化DP
  let prev = Array.from({ length: lb + 1 }, (_, j) => j)
  let curr = new Array(lb + 1)

  for (let i = 1; i <= la; i++) {
    curr[0] = i
    let rowMin = curr[0]
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
      if (curr[j] < rowMin) rowMin = curr[j]
    }
    // 早期終了: この行の最小値が既にmaxDistを超えたら終了
    if (rowMin > maxDist) return maxDist + 1
    ;[prev, curr] = [curr, prev]
  }
  return prev[lb]
}

/**
 * 名称の長さに基づく編集距離の閾値
 * 6文字以上: 距離2以内 / 4〜5文字: 距離1以内 / 3文字以下: 類似検索しない
 */
function getFuzzyThreshold(shorterLen) {
  if (shorterLen >= 6) return 2
  if (shorterLen >= 4) return 1
  return -1 // 3文字以下は類似検索しない
}

/**
 * 編集距離による類似候補を検出
 * 正規化後の名称同士でレーベンシュタイン距離を計算し、閾値以内ならsimilar候補とする
 */
function findFuzzyMatch(normInput, normTarget, result, nameTags) {
  let best = null
  let bestDist = Infinity

  for (const tag of nameTags) {
    const value = result.tags?.[tag]
    if (!value) continue

    const normVal = normalizeText(value)
    if (!normVal) continue

    // 長さが差で既に閾値を超える場合はスキップ
    const shorterLen = Math.min(normInput.length, normVal.length)
    const maxDist = getFuzzyThreshold(shorterLen)
    if (maxDist < 0) continue

    const dist = levenshteinDistance(normInput, normVal, maxDist)
    if (dist <= maxDist && dist < bestDist) {
      bestDist = dist
      best = { type: 'similar', tag, value, distance: dist }
    }
  }

  return best
}

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

    // 完全一致/部分一致が見つからない場合: 編集距離による類似判定
    if (!bestMatch || bestMatch.type === 'similar') {
      const fuzzyResult = findFuzzyMatch(normName, normName, result, nameTags)
      if (fuzzyResult && (!bestMatch || bestMatch.type === 'similar')) {
        bestMatch = fuzzyResult
      }
    }

    if (bestMatch) {
      candidates.push({ result, match: bestMatch })
    }
  }

  // 候補をソート（exact > partial > similar）
  // 注意: typeOrder['exact'] が 0 なので ?? を使用する（|| だと 0 がfalsy扱いされる）
  candidates.sort((a, b) => {
    const typeDiff = (typeOrder[a.match.type] ?? 3) - (typeOrder[b.match.type] ?? 3)
    if (typeDiff !== 0) return typeDiff
    // 同種内は編集距離の小さい順（similarのみdistanceを持つ）
    const distA = a.match.distance ?? Infinity
    const distB = b.match.distance ?? Infinity
    return distA - distB
  })

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
 * 照合結果をCSVで出力（Issue #21対応）
 * - # メタデータ行を一切含めない（CSVパーサー互換性）
 * - ヘッダーが最初の行（標準CSVリーダー対応）
 * - 全行が同一列幅（Excel・pandas・標準CSVリーダーで確実に読める）
 * - status 列で「確認済み」/「要確認」/「候補なし」を区別
 * - osm_id は type/id 形式（例: node/12345）
 */
export function matchResultsToCSV(matchResults) {
  const headers = ['row', 'input_name', 'status', 'match_type', 'osm_type', 'osm_id', 'osm_url', 'matched_name', 'candidates_count']
  const lines = [headers.map(csvEscape).join(',')]

  for (const r of matchResults) {
    if (r.matchType === 'none') {
      const row = [String(r.index), r.inputName, '候補なし', '', '', '', '', '', '0']
      lines.push(row.map(csvEscape).join(','))
    } else {
      const m = r.matched
      const status = r.confirmed ? '確認済み' : '要確認'
      const matchLabel = r.matchType === 'exact' ? '完全一致' : r.matchType === 'partial' ? '部分一致' : '類似'
      if (m) {
        const row = [
          String(r.index), r.inputName, status,
          matchLabel, m.type, `${m.type}/${m.id}`, m.url,
          m.name || '', String(r.candidates.length)
        ]
        lines.push(row.map(csvEscape).join(','))
      } else {
        // 未確認（候補あり但未選択）: osm関連欄は空
        const row = [
          String(r.index), r.inputName, status,
          matchLabel, '', '', '', '', String(r.candidates.length)
        ]
        lines.push(row.map(csvEscape).join(','))
      }
    }
  }

  return '\uFEFF' + lines.join('\n') + '\n'
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
 * RFC4180準拠のCSV/TSVパーサー（状態機械）
 * クォート内のデリミター・改行を保持、"" → " のエスケープ処理
 * @returns {Array<Array<string>>}
 */
function parseDelimited(text, delimiter) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"' // "" → "
          i += 2
        } else {
          inQuotes = false
          i++
        }
      } else {
        field += ch // クォート内なので改行もそのまま保持
        i++
      }
    } else {
      if (ch === '"') {
        inQuotes = true
        i++
      } else if (ch === delimiter) {
        row.push(field)
        field = ''
        i++
      } else if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++
        row.push(field)
        field = ''
        if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) {
          rows.push(row)
        }
        row = []
        i++
      } else {
        field += ch
        i++
      }
    }
  }

  row.push(field)
  if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) {
    rows.push(row)
  }

  return rows
}

/**
 * 解析結果から区切り文字を決定
 * 2列以上の行がある → そのデリミターが有効
 */
function detectDelimiterFromRows(rows) {
  return rows.some(r => r.length > 1)
}

/**
 * ヘッダー行の検出
 * 2以上のセルが典型的なヘッダーキーワードを含む場合、ヘッダーとみなす
 */
function isHeaderRow(row) {
  if (row.length === 0) return false
  const keywords = ['name', 'shop', 'store', '店', '施設', '住所', 'addr', 'address', 'phone', 'tel', 'lat', 'lon', 'lng', 'id', 'osm', 'city']
  const lowerCells = row.map(c => c.toLowerCase().trim())
  const matchCount = lowerCells.filter(c => keywords.some(k => c.includes(k))).length
  // 1列: セル自体がヘッダーキーワードと完全一致
  if (row.length === 1) return keywords.includes(lowerCells[0])
  // 2列以上: 2以上のセルがキーワードを含む
  return matchCount >= 2
}

/**
 * テキストから名称リストを解析
 * - RFC4180準拠のCSV/TSVをパース（クォート・改行・エスケープ対応）
 * - ヘッダー行を自動検出・スキップ
 * - 区切りなしの場合: 1行1名称
 * - 区切りありの場合: 最初の列を名称として使用
 */
export function parseNameList(text) {
  if (!text || !text.trim()) return []

  // クォートがある場合は必ずパーサーを使用（クォート内改行・エスケープを正しく処理）
  const hasQuotes = text.includes('"')

  if (hasQuotes) {
    // タブ → カンマ の順でパースを試行
    const tabRows = parseDelimited(text, '\t')
    if (detectDelimiterFromRows(tabRows)) {
      return extractNames(tabRows)
    }
    const commaRows = parseDelimited(text, ',')
    if (detectDelimiterFromRows(commaRows)) {
      return extractNames(commaRows)
    }
    // クォートありだが区切りなし: パーサー結果（1列）を使用
    // （カンマパース結果が最も適切。タブパース結果でも同様に1列）
    const rows = commaRows.length >= tabRows.length ? commaRows : tabRows
    const dataRows = isHeaderRow(rows[0]) ? rows.slice(1) : rows
    return dataRows
      .map(row => row[0]?.trim())
      .filter(name => name && name.length > 0)
  }

  // クォートなし: 簡易検出
  const tabRows = parseDelimited(text, '\t')
  if (detectDelimiterFromRows(tabRows)) {
    return extractNames(tabRows)
  }

  const commaRows = parseDelimited(text, ',')
  if (detectDelimiterFromRows(commaRows)) {
    return extractNames(commaRows)
  }

  // 区切りなし: 1行1名称
  return text.split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean)
}

function extractNames(rows) {
  const dataRows = isHeaderRow(rows[0]) ? rows.slice(1) : rows
  return dataRows
    .map(row => row[0]?.trim())
    .filter(name => name && name.length > 0)
}
