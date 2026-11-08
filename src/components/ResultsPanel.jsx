import React, { useMemo, useState, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { useBatchMatch } from '../context/BatchMatchContext.jsx'
import { parseNameList } from '../utils/batchMatch'
import { matchCsvRowsOsmid } from '../utils/csvOsmidMatch'
import { downloadFile } from '../utils/export'
import { getGroupedCategories } from '../data/categories'
import { applyResultFilters, hasActiveFilters } from '../utils/resultFilters'
import { countCategoriesInResults, filterGroupsByCounts } from '../utils/resultCategories'
import { activeSearchOf } from '../state/appReducer'
import { facilityName, facilityTypeLabel, formatAddress, safeWebsite } from '../utils/facilityLabels'
import { wheelchairBadge } from '../utils/accessibility'
import AttributeCompleteness from './AttributeCompleteness'
import { missingAttributesOf, ATTRIBUTE_LABELS } from '../utils/statistics'
import { buildIdElementUrl } from '../utils/editLinks'
import { keyInfoFor } from '../utils/categoryProfiles'

/**
 * 検索結果一覧（PC）
 * (#44) 表示フィルタは state.resultFilters（App reducer）に置き、
 * モバイル一覧タブ・ExportBar と同じロジック（resultFilters.js）を共有する。
 * 施設タイプは日本語ラベル（facilityTypeLabel）で表示し、
 * 住所・電話・公式サイトを追加列として出す。
 */
const DEFAULT_FILTERS = { nameFilter: '', typeFilter: 'all', catFilter: '', purposeFilter: '', websiteOnly: false, sortDir: 'none', missingFilter: 'none' }

/**
 * CSVテキストをパーズし、ヘッダーと行オブジェクト配列を返す
 * @returns {{headers: string[], rows: Array<Object>}}
 */
function parseCsvToObjects(text) {
  if (!text || !text.trim()) return { headers: [], rows: [] }

  // RFC4180準拠パーサー（クォート・改行・エスケープ対応）
  const lines = text.split(/\r\n|\r|\n/)
  const firstLine = lines[0]
  if (!firstLine) return { headers: [], rows: [] }

  // 区切り文字の検出（タブ優先）
  const tabCount = (firstLine.match(/\t/g) || []).length
  const commaCount = (firstLine.match(/,(?=(?:[^"\s]*"[^"\s]*)*[^"\s]*$)/g) || []).length
  const delimiter = tabCount > 0 ? '\t' : ','

  // 1行をセル配列にパーズ
  function parseLine(line) {
    const cells = []
    let field = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && i + 1 < line.length && line[i + 1] === '"') {
          field += '"'
          i++
        } else if (ch === '"') {
          inQuotes = false
        } else {
          field += ch
        }
      } else {
        if (ch === '"') {
          inQuotes = true
        } else if (ch === delimiter) {
          cells.push(field)
          field = ''
        } else {
          field += ch
        }
      }
    }
    cells.push(field)
    return cells
  }

  // 全行をパーズ
  const allRows = lines.filter((l) => l.trim() !== '').map(parseLine)
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
 * osmid照合結果の行データをCSV文字列化する
 * - UTF-8 BOM付き（Excel対応）
 * - 元の列・順序を維持したまま osmid 列を含む
 * - カンマ・クォート・改行を含む値はクォートで囲み、数式注入（= + - @ 前置き）に"'"を付与
 */
function csvEscapeCell(value) {
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

function rowsToCsv(headers, rows) {
  const lines = [headers.map(csvEscapeCell).join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscapeCell(row?.[h])).join(','))
  }
  return '\uFEFF' + lines.join('\n') + '\n'
}

function ResultsPanel() {
  const { state, dispatch } = useApp()
  const { dispatch: bmDispatch } = useBatchMatch()
  const { results, resultFilters, fetchMeta, searchSource, selectedMunicipality } = state

  // CSVアップロード状態
  const [csvMeta, setCsvMeta] = useState(null) // { name, count }
  const [csvColumns, setCsvColumns] = useState([])
  const [csvRows, setCsvRows] = useState([])
  const [selectedCols, setSelectedCols] = useState([])
  const [osmidResult, setOsmidResult] = useState(null)

  // (#44) カテゴリ選択は検索フォームと一覧フィルタを同じ値として扱う。
  // ドロップダウンの操作は検索フォームのcategoryにdispatchし、
  // reducerが resultFilters.catFilter をミラーする（データ取得後なら即絞り込み）。
  const activeSearch = activeSearchOf(state) || {}
  const searchFormType = searchSource === 'municipality' ? 'SET_MUNICIPALITY_SEARCH' : 'SET_SIMPLE_SEARCH'

  // CSVファイル読込 → パースして状態に格納
  const handleCsvUpload = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result
      const { headers, rows } = parseCsvToObjects(text)
      bmDispatch({ type: 'SET_INPUT_TEXT', payload: text })
      setCsvMeta({ name: file.name, count: rows.length })
      setCsvColumns(headers)
      setCsvRows(rows)
      // 1列のCSV: 唯一の列を自動的に照合キーとして選択
      setSelectedCols(headers.length === 1 ? [headers[0]] : [])
      setOsmidResult(null)
    }
    reader.readAsText(file, 'utf-8')
    e.target.value = ''
  }, [bmDispatch])

  // 「照合する」ボタン: 選択列で matchCsvRowsOsmid を実行
  const handleMatch = useCallback(() => {
    if (!results || results.length === 0) {
      alert('先にOSMデータを検索してください。')
      return
    }
    if (selectedCols.length === 0) {
      alert('照合に使う列を至少1つ選択してください。')
      return
    }
    const res = matchCsvRowsOsmid(csvColumns, csvRows, selectedCols, results)
    setOsmidResult(res)
  }, [results, selectedCols, csvColumns, csvRows])

  const toggleCol = useCallback((col) => {
    setSelectedCols((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    )
  }, [])

  // 照合結果CSVのダウンロード: 元の列・順序を維持して osmid 列を追加
  const handleDownloadOsmid = useCallback(() => {
    if (!osmidResult || !csvMeta) return
    const csv = rowsToCsv(osmidResult.headers, osmidResult.rows)
    const base = csvMeta.name.replace(/\.(csv|txt)$/i, '')
    downloadFile(csv, `${base}_osmid.csv`, 'text/csv;charset=utf-8')
  }, [osmidResult, csvMeta])

  const update = (patch) => dispatch({ type: 'SET_RESULT_FILTERS', payload: patch })
  const changeCategory = (value) => dispatch({ type: searchFormType, payload: { category: value } })
  const clear = () => {
    dispatch({ type: searchFormType, payload: { category: '', purpose: '' } })
    dispatch({ type: 'SET_RESULT_FILTERS', payload: { ...DEFAULT_FILTERS } })
  }
  const active = hasActiveFilters(resultFilters)
  const displayResults = useMemo(
    () => applyResultFilters(results, resultFilters),
    [results, resultFilters]
  )
  // 「絞り込み済み」表示はフィルタが実際に件数を減らしているときだけ出す
  const narrowing = active && displayResults.length < (results || []).length

  const grouped = useMemo(() => getGroupedCategories(), [])
  const fmt = (n) => n.toLocaleString('ja-JP')

  // (#44) カテゴリの選択肢はOverpass取得データに基づいて絞り込む:
  // 結果に実際に出現したカテゴリのみを、件数付きで表示する。
  const catCounts = useMemo(() => countCategoriesInResults(results), [results])
  const hasData = Array.isArray(results) && results.length > 0
  const filterGroups = useMemo(
    () => (hasData ? filterGroupsByCounts(grouped, catCounts, activeSearch.category || '') : grouped),
    [hasData, grouped, catCounts, activeSearch.category]
  )

  return (
    <aside className="bg-white rounded-lg border border-slate-200 flex flex-col flex-1 min-w-0">
      <div className="p-4 border-b border-slate-200">
        <div className="text-sm text-slate-600">
          {narrowing
            ? <>全 <strong className="text-primary-600">{fmt(results.length)}</strong> 件中、<strong className="text-primary-600">{fmt(displayResults.length)}</strong> 件を表示中</>
            : <>全 <strong className="text-primary-600">{fmt(results.length)}</strong> 件が見つかりました</>}
          {searchSource === 'municipality' && selectedMunicipality?.name && (
            <span className="ml-2 text-xs text-slate-500">（{selectedMunicipality.name} とその周辺）</span>
          )}
          {fetchMeta && (
            <div className="mt-1 text-xs text-slate-500">取得: {Math.round(fetchMeta.elapsedMs)}ms</div>
          )}
          {/* (B2) 欠落フィルタアクティブ時の案内 */}
          {resultFilters.missingFilter && resultFilters.missingFilter !== 'none' && displayResults.length > 0 && (
            <div className="mt-1 text-xs text-amber-600">
              主要属性が未登録の施設を優先表示中（{resultFilters.missingFilter === 'any' ? 'いずれかの属性' : ATTRIBUTE_LABELS[resultFilters.missingFilter] + 'の欠落'}）
            </div>
          )}
        </div>

        {/* (B1) 属性の充足率: 表示中結果（自治体×カテゴリ / 地図検索+絞り込み）を追従 */}
        {displayResults.length > 0 && (
          <div className="mt-1.5">
            <AttributeCompleteness results={displayResults} />
          </div>
        )}

        {narrowing && (
          <div className="mt-1 text-xs text-amber-600">
            表示は絞り込み済みです。CSV / GeoJSON のエクスポートは「表示中」か「すべて」から選べます。
          </div>
        )}

        {/* CSVアップロード（osmid照合の入口） */}
        <div className="mt-2 flex items-center gap-2">
          <label className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs rounded font-medium cursor-pointer transition-colors">
            📁 CSVアップロード
            <input type="file" accept=".csv,.txt" onChange={handleCsvUpload} className="hidden" />
          </label>
          {csvMeta && (
            <span className="text-[10px] text-slate-500 truncate max-w-[220px]">
              {csvMeta.name}（{csvMeta.count}件）
            </span>
          )}
          {csvMeta && (
            <button
              onClick={() => { setCsvMeta(null); setCsvColumns([]); setCsvRows([]); setSelectedCols([]); setOsmidResult(null) }}
              className="text-[10px] text-slate-400 hover:text-red-500"
              title="CSV入力をクリア"
            >
              ✕
            </button>
          )}
        </div>

        {/* 照合キー列の選択（2列以上の場合のみ表示） */}
        {csvColumns.length > 1 && (
          <div className="mt-2 p-2 bg-slate-50 rounded-md border border-slate-200">
            <p className="text-[10px] text-slate-500 mb-1.5">
              照合に使う列を選択してください（複数可）
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {csvColumns.map((col, i) => (
                <label key={i} className="flex items-center gap-1 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedCols.includes(col)}
                    onChange={() => toggleCol(col)}
                  />
                  {col}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* 「照合する」ボタン + 結果サマリー */}
        {csvMeta && (
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={handleMatch}
              disabled={selectedCols.length === 0 || !results || results.length === 0}
              className="px-3 py-1 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 text-white text-xs rounded font-medium transition-colors"
            >
              照合する
            </button>
            {osmidResult && (
              <span className="text-[11px] text-slate-600">
                <span className="text-emerald-600 font-medium">照合 {osmidResult.matched}件</span>
                <span className="text-red-500 font-medium"> / 未照合 {osmidResult.unmatched}件</span>
              </span>
            )}
            {/* 照合実行後にのみ表示されるダウンロードボタン */}
            {osmidResult && (
              <button
                onClick={handleDownloadOsmid}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded font-medium transition-colors"
                title="元のCSVの列と順序を保ったまま、osmid列（type/id形式）を追加してダウンロード"
              >
                ⬇ CSVをダウンロード
              </button>
            )}
          </div>
        )}

        <div className="mt-3 space-y-2">
          <input
            value={resultFilters.nameFilter}
            onChange={(e) => update({ nameFilter: e.target.value })}
            placeholder="名称で絞る（例: 珈琲）"
            className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <div className="grid grid-cols-3 gap-2">
            <select
              value={resultFilters.typeFilter}
              onChange={(e) => update({ typeFilter: e.target.value })}
              className="px-2 py-1.5 text-sm border border-slate-300 rounded-md bg-white"
              aria-label="要素種別で絞る"
            >
              <option value="all">すべて</option>
              <option value="node">点 (node)</option>
              <option value="way">線面 (way)</option>
              <option value="relation">relation</option>
            </select>
            <select
              value={activeSearch.category || ''}
              onChange={(e) => changeCategory(e.target.value)}
              className="px-2 py-1.5 text-sm border border-slate-300 rounded-md bg-white"
              aria-label="施設の種類で絞る"
            >
              <option value="">{hasData ? `すべての種類（${fmt(results.length)}件）` : 'すべての種類'}</option>
              {filterGroups.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {hasData ? `${c.label}（${fmt(c.count)}件）` : c.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select
              value={resultFilters.sortDir}
              onChange={(e) => update({ sortDir: e.target.value })}
              className="px-2 py-1.5 text-sm border border-slate-300 rounded-md bg-white"
              aria-label="並び替え"
            >
              <option value="none">並び順: 標準</option>
              <option value="asc">名称あ-ほ</option>
              <option value="desc">名称ほ-あ</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={resultFilters.websiteOnly}
                onChange={(e) => update({ websiteOnly: e.target.checked })}
              />
              公式サイトがあるものだけ
            </label>
            {/* (B2) 主要属性の欠落で絞り込む */}
            <select
              value={resultFilters.missingFilter || 'none'}
              onChange={(e) => update({ missingFilter: e.target.value })}
              className="flex-1 min-w-0 px-2 py-1 text-xs border border-slate-300 rounded-md bg-white"
              aria-label="属性の欠落で絞る"
            >
              <option value="none">未登録の絞り込み: なし</option>
              <option value="any">いずれかの属性が未登録</option>
              <option value="phone">電話が未登録</option>
              <option value="opening_hours">営業時間が未登録</option>
              <option value="website">Webサイトが未登録</option>
              <option value="address">住所が未登録</option>
            </select>
            <button onClick={clear} className="text-xs text-slate-500 hover:text-primary-600 shrink-0">クリア</button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">施設名</th>
              <th className="px-2 py-2 text-left">タイプ</th>
              <th className="px-2 py-2 text-left">住所</th>
              <th className="px-2 py-2 text-left">電話</th>
              <th className="px-2 py-2 text-left">バリアフリー</th>
              <th className="px-2 py-2 text-left">公式サイト</th>
              <th className="px-2 py-2 text-left">編集</th>
            </tr>
          </thead>
          <tbody>
            {displayResults.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                  {/* (A4) 0件は「失敗」ではなく「まだ登録がない」として伝える */}
                  {active && (resultFilters.missingFilter || 'none') !== 'none' && (results || []).length > 0
                    ? 'この地域では、該当する未登録施設はありません — 主要属性が充実しています。'
                    : active
                      ? '条件に一致する施設はありません。フィルタを緩めてみてください。'
                      : 'この地域ではまだ登録がありません。範囲を広げたり、カテゴリやキーワードを変えて再検索するか、iDエディタで追加できます。'}
                </td>
              </tr>
            ) : displayResults.map((r, i) => {
              const website = safeWebsite(r.tags)
              const badge = wheelchairBadge(r.tags)
              return (
                <tr
                  key={`${r.type}-${r.id}`}
                  className="border-b border-slate-100"
                >
                  <td className="px-3 py-2 text-slate-400 text-xs">{i + 1}</td>
                  <td className="px-2 py-2 font-medium text-slate-800">
                    {facilityName(r)}
                    {website && (
                      <a
                        href={website}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="公式サイトを開く"
                        className="ml-1 align-middle"
                      >
                        <span role="img" aria-label="公式サイトがあります">🔗</span>
                      </a>
                    )}
                    {/* (B2) 欠落フィルタアクティブ時: 未登録属性をバッジで表示 */}
                    {(resultFilters.missingFilter || 'none') !== 'none' && (() => {
                      const missing = missingAttributesOf(r)
                      if (missing.length === 0) return null
                      return (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {missing.map((k) => (
                            <span key={k} className="text-[10px] text-red-700 border border-red-200 bg-red-50 rounded-full px-1.5 py-0 whitespace-nowrap">
                              {ATTRIBUTE_LABELS[k]} 未登録
                            </span>
                          ))}
                        </span>
                      )
                    })()}
                    {/* (A3) カテゴリ別ハイライト: そのカテゴリに意味のある属性のみ */}
                    {(() => {
                      const ki = keyInfoFor(r)
                      const extra = ki.items.find((it) => it.key === 'cuisine') ||
                        ki.items.find((it) => it.key === 'wheelchair')
                      if (!extra) return null
                      return (
                        <span className="mt-0.5 block text-[11px] text-slate-500">
                          {ki.icon} {extra.text}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-2 py-2 text-slate-600 whitespace-nowrap">{facilityTypeLabel(r)}</td>
                  <td className="px-2 py-2 text-slate-500">
                    {formatAddress(r.tags) || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-2 py-2 text-slate-600 whitespace-nowrap">
                    {r.tags?.phone || r.tags?.['contact:phone'] || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {badge ? (
                      <span className={`text-xs border rounded-full px-2 py-0.5 ${badge.cls}`}>♿ {badge.text}</span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {website ? (
                      <a
                        href={website}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary-600 hover:underline text-xs"
                        title={website}
                      >
                        <span role="img" aria-label="公式サイト">🔗</span>
                      </a>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  {/* (B3) iD編集導線: 各施設を特定した状態でiDへジャンプ */}
                  <td className="px-2 py-2 whitespace-nowrap">
                    <a
                      href={buildIdElementUrl(r)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-primary-600 hover:underline text-xs"
                      title="iDエディタで編集（OSMアカウント必要）"
                    >
                      ✏️ iD
                    </a>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </aside>
  )
}

export default ResultsPanel
