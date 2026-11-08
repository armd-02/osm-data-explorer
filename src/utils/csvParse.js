/**
 * CSVパーズユーティリティ（RFC4180準拠）
 *
 * 施設検索結果エリア（ResultsPanel）のCSV照合機能と、一括照合（BatchMatch）の
 * CSV取込で共用する。
 *
 * - parseCsvText: テキストを行配列にパース（状態機械。クォート・改行・エスケープ対応）
 * - parseCsvToObjects: CSVテキストを { headers, rows } にパース
 * - extractNamesFromCsv: キー列の値から店名リストを導出
 */

/**
 * CSVテキストをパーズし、ヘッダーと行オブジェクト配列を返す
 * @returns {{headers: string[], rows: Array<Object>}}
 */
export function parseCsvToObjects(text) {
  if (!text || !text.trim()) return { headers: [], rows: [] }

  // 区切り文字の検出は最初の行のみを見る（タブ優先）
  const firstLine = text.split(/\r\n|\r|\n/, 1)[0]
  const tabCount = (firstLine.match(/\t/g) || []).length
  const delimiter = tabCount > 0 ? '\t' : ','

  // 全文をストリームとしてパース（引用符内の改行を同一フィールドに保持）
  const allRows = parseCsvText(text, delimiter)
  if (allRows.length === 0) return { headers: [], rows: [] }

  // 最初の行をヘッダーとして使用する（簡易判定: 2列以上ならヘッダーとみなす）
  const firstRow = allRows[0]
  const hasHeader = firstRow.length > 1
  const headers = hasHeader
    ? firstRow.map((h) => h.trim())
    : firstRow.map((_, i) => `col_${i + 1}`)

  const dataRows = hasHeader ? allRows.slice(1) : allRows
  const rows = dataRows.map((cells) => {
    const obj = {}
    headers.forEach((h, i) => {
      obj[h] = cells[i] !== undefined ? cells[i] : ''
    })
    return obj
  })

  return { headers, rows }
}

/**
 * テキストをRFC4180準拠の行配列にパース（状態機械）
 * 引用符内のデリミター・改行を保持、"" → " のエスケープ処理に対応
 * @returns {Array<Array<string>>} 行ごとのセル値配列
 */
export function parseCsvText(text, delimiter) {
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
        field += ch // 引用符内なので改行もそのまま保持
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
 * CSV行データのキー列の値から「店名＋元の行番号」のリストを導出する
 * 各行について、指定順で最初に見つかった空でない値（trim後）を店名として採用する。
 * すべて空の行はスキップする（行番号の対応関係はスキップ後も位置順で一致する）。
 *
 * 導出した店名が batchMatch の結果と 1対1 で対応するため、保存時に
 * 元のCSVの行へ照合結果（座標・osmid）を戻すことができる。
 *
 * @param {Array<Object>} rows - 行データ（列名をキーにしたオブジェクトの配列）
 * @param {string[]} keyColumns - 照合キーに使う列名の配列（試す優先順）
 * @returns {Array<{name: string, rowIndex: number}>} 店名リスト（入力順）＋元の行番号
 */
export function extractNamesWithRows(rows, keyColumns) {
  const rowArr = Array.isArray(rows) ? rows : []
  const keyArr = Array.isArray(keyColumns) ? keyColumns : []

  const derived = []
  rowArr.forEach((row, rowIndex) => {
    for (const col of keyArr) {
      const v = String(row?.[col] ?? '').trim()
      if (v) {
        derived.push({ name: v, rowIndex })
        return
      }
    }
  })
  return derived
}

/**
 * CSV行データのキー列の値から店名リストを導出する
 * （extractNamesWithRows の名前だけの版。既存呼び出し用の互換ラッパー）
 *
 * @param {Array<Object>} rows - 行データ（列名をキーにしたオブジェクトの配列）
 * @param {string[]} keyColumns - 照合キーに使う列名の配列（試す優先順）
 * @returns {Array<string>} 店名リスト（入力順）
 */
export function extractNamesFromCsv(rows, keyColumns) {
  return extractNamesWithRows(rows, keyColumns).map(d => d.name)
}
