/**
 * CSV行 ↔ OSM検索結果 の近似照合: osmid 列を埋めるユーティリティ
 *
 * CSVの行データ（列名をキーにしたオブジェクト配列）をOSM検索結果と照合し、
 * マッチした要素ID（要素タイプ/ID 形式、例: node/123）を osmid 列に埋める。
 * 照合判定は batchMatch.js の matchName を再利用する
 * （完全一致 > 部分一致 > 類似（編集距離）の優先順）。
 *
 * 動作:
 * - 各行について、照合キー列（keyColumns）の値を指定順に試し、
 *   最初にマッチした列の結果を採用する
 * - マッチした場合: osmid 列に `${type}/${id}` を書き込む
 * - マッチしなかった場合: osmid 列は空（''）のまま
 * - osmid 列がヘッダーにない場合、末尾に追加する
 * - 戻り値は新しい行データ配列（入力行・ヘッダーは変更されない）と
 *   照合できた件数・できなかった件数の集計
 */
import { matchName } from './batchMatch'

/** OSM要素IDを書き込む列名 */
export const OSMID_COLUMN = 'osmid'

/**
 * CSV行のosmid列を埋める
 *
 * @param {string[]} headers - CSVヘッダー配列（列名）
 * @param {Array<Object>} rows - 行データ（列名をキーにしたオブジェクトの配列）
 * @param {string[]} keyColumns - 照合キーに使う列名の配列（試す優先順）
 * @param {Array} results - OSM検索結果（{type, id, lat, lon, tags, ...} の配列）
 * @returns {{headers: string[], rows: Array<Object>, matched: number, unmatched: number}}
 *   - headers: osmid 列を含む最終ヘッダー（必要に応じて末尾追加）
 *   - rows: osmid を埋めた新しい行データ配列（入力行は変更されない）
 *   - matched: 照合できた件数
 *   - unmatched: 照合できなかった件数
 */
export function matchCsvRowsOsmid(headers, rows, keyColumns, results) {
  const headerArr = Array.isArray(headers) ? headers : []
  const rowArr = Array.isArray(rows) ? rows : []
  const keyArr = Array.isArray(keyColumns) ? keyColumns : []
  const resultArr = Array.isArray(results) ? results : []

  const hasOsmidCol = headerArr.includes(OSMID_COLUMN)
  const finalHeaders = hasOsmidCol ? [...headerArr] : [...headerArr, OSMID_COLUMN]

  let matched = 0
  let unmatched = 0

  const outRows = rowArr.map((row) => {
    let osmid = ''

    // キー列を指定順に試し、最初にマッチした列の結果を採用
    for (const col of keyArr) {
      const name = String(row?.[col] ?? '').trim()
      if (!name) continue

      const { matched: m } = matchName(name, resultArr)
      if (m) {
        osmid = `${m.type}/${m.id}`
        matched++
        break
      }
    }

    if (!osmid) unmatched++
    return { ...row, [OSMID_COLUMN]: osmid }
  })

  return {
    headers: finalHeaders,
    rows: outRows,
    matched,
    unmatched,
  }
}
