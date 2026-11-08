import React, { useState, useCallback, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { useBatchMatch } from '../context/BatchMatchContext.jsx'
import { parseNameList, batchMatch, batchMatchCsvRows, matchResultsToCSV } from '../utils/batchMatch'
import { parseCsvToObjects, extractNamesWithRows } from '../utils/csvParse'
import { matchResultsToLocationCSV, originalCsvWithMatchToCSV } from '../utils/locationCsv'
import { downloadFile } from '../utils/export'
import { parsePreviousYearCSV, verifyPreviousIds, verificationToCSV, getStatusLabel } from '../utils/verifyIds'
import BatchMatchMap from './BatchMatchMap'

/**
 * 一括照合 (#31)
 * 3列レイアウト: 対象施設(30%) + 候補比較(45%) + 地図(25%)
 * 
 * 状態はBatchMatchContextに保持（タブ切替で消えない）
 */
function BatchMatch() {
  const { state: appState } = useApp()
  const { state: bmState, dispatch: bmDispatch } = useBatchMatch()
  const [showMap, setShowMap] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'unconfirmed' | 'confirmed' | 'none'

  const { inputText, matchResults, matchRowAligned, selections, activeIndex, previewCandidate, processing, csvData, csvKeyCols } = bmState

  // CSV導出リスト（キー列から導出された店名）とtextarea内容（パース後）が一致するか
  const derivedNames = useMemo(() => csvData
    ? extractNamesWithRows(csvData.rows, csvKeyCols).map(d => d.name)
    : [], [csvData, csvKeyCols])
  const inputNames = useMemo(() => parseNameList(inputText), [inputText])
  const inputMatchesCsv = !!csvData && derivedNames.length > 0 &&
    inputNames.length === derivedNames.length &&
    inputNames.every((n, i) => n === derivedNames[i])
  const { results: osmResults } = appState

  // (#26) 前年度CSV検証
  const [prevEntries, setPrevEntries] = useState(null)
  const [verificationResults, setVerificationResults] = useState(null)
  const [showVerification, setShowVerification] = useState(false)

  // 照合実行
  // CSV取込中且つtextareaがCSV導出リストと一致する場合: matchCsvRowsOsmid の
  // 考え方（行ごとにキー列を優先順に試し matchName を呼ぶ）に倣い、
  // batchMatchCsvRows で元のCSVの行順に揃えた結果を作る（行対応を保証）。
  // それ以外（貼り付け・textarea編集済み）は従来の batchMatch（名前リスト順）を使う。
  const handleMatch = useCallback(() => {
    if (!osmResults || osmResults.length === 0) {
      alert('先に「施設検索」タブでBBOXを指定してOSMデータを検索してください。')
      return
    }
    const names = parseNameList(inputText)
    if (names.length === 0) return

    bmDispatch({ type: 'SET_PROCESSING', payload: true })
    setTimeout(() => {
      if (inputMatchesCsv) {
        // 行順に揃えた結果（results[i] ↔ CSVのi行目）
        const res = batchMatchCsvRows(csvData.rows, csvKeyCols, osmResults)
        bmDispatch({ type: 'SET_MATCH_RESULTS', payload: res, rowAligned: true })
      } else {
        const res = batchMatch(names, osmResults)
        bmDispatch({ type: 'SET_MATCH_RESULTS', payload: res, rowAligned: false })
      }
      bmDispatch({ type: 'SET_PROCESSING', payload: false })
    }, 50)
  }, [inputText, inputMatchesCsv, csvData, csvKeyCols, osmResults, bmDispatch])

  // 施設選択
  const handleSelectFacility = useCallback((index) => {
    bmDispatch({ type: 'SELECT_FACILITY', payload: index })
  }, [bmDispatch])

  // 地図プレビュー（確定せずに候補の位置を表示）
  const handlePreview = useCallback((candidateIdx) => {
    if (activeIndex == null) return
    bmDispatch({ type: 'SET_PREVIEW', payload: { index: activeIndex, candidateIdx } })
  }, [activeIndex, bmDispatch])

  // 候補確定
  const handleConfirm = useCallback((candidateIdx) => {
    if (activeIndex == null) return
    bmDispatch({ type: 'CONFIRM_CANDIDATE', payload: { index: activeIndex, candidateIdx } })
  }, [activeIndex, bmDispatch])

  // 確定取り消し
  const handleUnconfirm = useCallback(() => {
    if (activeIndex == null) return
    bmDispatch({ type: 'UNCONFIRM', payload: activeIndex })
  }, [activeIndex, bmDispatch])

  // CSV出力
  const handleDownload = useCallback(() => {
    if (!matchResults) return
    const csv = matchResultsToCSV(matchResults)
    const dateStr = new Date().toISOString().slice(0, 10)
    downloadFile(csv, `osm-batch-match-${dateStr}.csv`, 'text/csv;charset=utf-8')
  }, [matchResults])

  // 地図制作用CSV: 確定した候補だけ座標・OSM IDを出力 (#42)
  // 取込CSVがある場合: 元のCSVの全列・全行・列順・行順をそのまま保ち、
  // 確定した施設にlat/lon/osmid(type/id)を付加して出力する。
  // 照合が行揃えモード（batchMatchCsvRows）で実行され、textareaがCSV導出
  // リストと一致している場合のみ元のCSVに書き込む。貼り付けなどで一致しない
  // 場合は、行の対応が保証できないため従来の固定列形式にフォールバックする。
  const handleDownloadLocations = useCallback(() => {
    if (!matchResults) return
    let csv
    csv = (csvData && matchRowAligned && inputMatchesCsv)
      ? originalCsvWithMatchToCSV(csvData, matchResults)
      : matchResultsToLocationCSV(matchResults)
    const dateStr = new Date().toISOString().slice(0, 10)
    downloadFile(csv, `map-locations-${dateStr}.csv`, 'text/csv;charset=utf-8')
  }, [matchResults, csvData, matchRowAligned, inputMatchesCsv])

  // CSV取込（RFC4180準拠でパースし、構造化データをcontextに保持）
  // キー列の値から店名リストを導出してinputTextに反映するため、
  // 従来どおり「照合」ボタンでbatchMatchが使える
  const handleCsvUpload = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const { headers, rows } = parseCsvToObjects(ev.target.result)
      if (rows.length === 0) {
        alert('ファイルからデータを読み込めませんでした。')
        return
      }
      const keyCols = headers.length === 1 ? [headers[0]] : []
      bmDispatch({ type: 'SET_CSV_DATA', payload: { fileName: file.name, headers, rows } })
      bmDispatch({ type: 'SET_INPUT_TEXT', payload: extractNamesWithRows(rows, keyCols).map(d => d.name).join('\n') })
    }
    reader.readAsText(file, 'utf-8')
    e.target.value = ''
  }, [bmDispatch])

  // 照合キー列の選択（複数可）。選択に応じて店名リストを再導出する
  const toggleCsvCol = useCallback((col) => {
    if (!csvData) return
    const next = csvKeyCols.includes(col)
      ? csvKeyCols.filter((c) => c !== col)
      : [...csvKeyCols, col]
    bmDispatch({ type: 'SET_CSV_KEY_COLS', payload: next })
    bmDispatch({ type: 'SET_INPUT_TEXT', payload: extractNamesWithRows(csvData.rows, next).map(d => d.name).join('\n') })
  }, [csvData, csvKeyCols, bmDispatch])

  // CSV入力をクリア（関連する照合結果も破棄される）
  const handleClearCsv = useCallback(() => {
    bmDispatch({ type: 'CLEAR_CSV' })
    bmDispatch({ type: 'SET_INPUT_TEXT', payload: '' })
  }, [bmDispatch])

  // (#26) 前年度CSVファイル読み込み
  const handlePrevFileUpload = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const entries = parsePreviousYearCSV(ev.target.result)
      setPrevEntries(entries)
      if (entries.length === 0) {
        alert('前年度CSVから有効なエントリを読み込めませんでした。\n必須カラム: input_name, osm_type, osm_id')
      } else {
        setShowVerification(true)
      }
    }
    reader.readAsText(file, 'utf-8')
    e.target.value = ''
  }, [])

  // (#26) 検証実行
  const handleVerify = useCallback(() => {
    if (!prevEntries || !osmResults) return
    const results = verifyPreviousIds(prevEntries, osmResults)
    setVerificationResults(results)
  }, [prevEntries, osmResults])

  // (#26) 検証結果CSV出力
  const handleDownloadVerification = useCallback(() => {
    if (!verificationResults) return
    const csv = verificationToCSV(verificationResults, { fetchedAt: new Date().toISOString() })
    const dateStr = new Date().toISOString().slice(0, 10)
    downloadFile(csv, `osm-verify-${dateStr}.csv`, 'text/csv;charset=utf-8')
  }, [verificationResults])

  // サマリー計算
  // 'empty'（キー列が全空で店名が導出されないCSV行）は照合対象外なので集計しない
  const summary = useMemo(() => {
    if (!matchResults) return null
    const rows = matchResults.filter(r => r.matchType !== 'empty')
    return {
      total: rows.length,
      confirmed: rows.filter(r => r.confirmed).length,
      unconfirmed: rows.filter(r => !r.confirmed && r.matchType !== 'none').length,
      none: rows.filter(r => r.matchType === 'none').length,
    }
  }, [matchResults])

  // 絞り込み（'empty'行は表示しない）
  const filteredResults = useMemo(() => {
    if (!matchResults) return []
    const rows = matchResults.filter(r => r.matchType !== 'empty')
    switch (statusFilter) {
      case 'confirmed': return rows.filter(r => r.confirmed)
      case 'unconfirmed': return rows.filter(r => !r.confirmed && r.matchType !== 'none')
      case 'none': return rows.filter(r => r.matchType === 'none')
      default: return rows
    }
  }, [matchResults, statusFilter])

  // 現在選択中の施設
  const activeRow = activeIndex != null ? matchResults?.find(r => r.index === activeIndex) : null

  return (
    <div className="batch-workspace h-full flex flex-col">
      {/* 上部バー: 入力 + 操作 + サマリー */}
      <div className="px-3 py-2 border-b border-slate-200 bg-white space-y-2 shrink-0">
        <p className="text-[11px] text-slate-600">
          ①「施設検索」タブで対象地域をOSM検索 → ②店名リストを貼り付け／CSV取込 → ③照合 → ④候補を地図で確認し「確定」 → ⑤地図用CSVを保存
        </p>
        {/* 入力行 */}
        <div className="flex items-start gap-2">
          <textarea
            value={inputText}
            onChange={(e) => bmDispatch({ type: 'SET_INPUT_TEXT', payload: e.target.value })}
            placeholder={"施設名を1行に1件入力\n例:\nラーメン屋 田中\nカフェ 山本\n薬局 鈴木"}
            rows={3}
            className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-400 resize-none"
          />
          <div className="flex flex-col gap-1 shrink-0">
            <label className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs rounded font-medium cursor-pointer transition-colors">
              📁 CSV
              <input type="file" accept=".csv,.txt" onChange={handleCsvUpload} className="hidden" />
            </label>
            <button
              onClick={handleMatch}
              disabled={processing || !inputText.trim()}
              className="px-3 py-1 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 text-white text-xs rounded font-medium transition-colors"
            >
              {processing ? '...' : '照合'}
            </button>
          </div>
        </div>

        {/* CSV取込の状態 + 照合キー列の選択（CSV取込中は表示） */}
        {csvData && (
          <div className="p-2 bg-slate-50 rounded-md border border-slate-200">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 truncate max-w-[240px]">
                {csvData.fileName}（{csvData.rows.length}件）
              </span>
              <button
                onClick={handleClearCsv}
                className="text-[10px] text-slate-400 hover:text-red-500"
                title="CSV入力をクリア"
                aria-label="CSV入力をクリア"
              >
                ✕
              </button>
              {csvData.headers.length > 1 && (
                <span className="ml-auto text-[10px] text-slate-400">
                  {csvKeyCols.length > 0 ? `キー列 ${csvKeyCols.length} 件選択中` : '照合キー列を選択してください'}
                </span>
              )}
            </div>
            {csvData.headers.length > 1 && (
              <div className="mt-1.5">
                <p className="text-[10px] text-slate-500 mb-1">
                  照合に使う列を選択してください（複数可）
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {csvData.headers.map((col, i) => (
                    <label key={i} className="flex items-center gap-1 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={csvKeyCols.includes(col)}
                        onChange={() => toggleCsvCol(col)}
                      />
                      {col}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* サマリー + 絞り込み + 出力 */}
        {summary && (
          <div className="flex items-center gap-3 text-[11px] flex-wrap">
            <span className="text-slate-500">
              {summary.total}件中: 
              <span className="text-emerald-600 font-medium"> 確認済 {summary.confirmed}</span>
              <span className="text-amber-600 font-medium"> 要確認 {summary.unconfirmed}</span>
              <span className="text-red-500 font-medium"> 候補なし {summary.none}</span>
            </span>
            {/* 絞り込み */}
            <div className="flex gap-1 ml-auto">
              {[
                ['all', '全て'],
                ['unconfirmed', '要確認'],
                ['confirmed', '確認済'],
                ['none', '候補なし'],
              ].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setStatusFilter(val)}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                    statusFilter === val ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={handleDownloadLocations}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] rounded font-medium"
              title="入力順を維持して出力。未確認・候補なしの座標は空欄です"
            >
              ⬇ 地図用CSV（確定 {summary.confirmed} 件）
            </button>
            <button
              onClick={handleDownload}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] rounded font-medium"
              title="以前からの一括照合CSV形式"
            >
              照合CSV
            </button>
          </div>
        )}
      </div>

      {/* 地図用CSV: 確定行のみ座標・osmidを書き込む（未確認・候補なしは空欄、既存列は空欄で上書き） */}
      {summary && (
        <p className="px-3 py-1 text-[10px] text-slate-500 bg-white border-b border-slate-100 shrink-0">
          地図用CSVは確定済みの候補だけに座標・osmidを書き込みます。未確認・候補なしの行は空欄のままです（元のCSVにlat/lon/osmid列が既にある場合はその列へ書き込み）。way/relationは代表座標。
        </p>
      )}

      {/* (#26) 前年度CSV検証セクション */}
      {showVerification && prevEntries && (
        <div className="px-3 py-2 border-b border-slate-200 bg-amber-50 shrink-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] font-medium text-amber-800">📋 前年度ID再検証</span>
            <span className="text-[10px] text-amber-700">{prevEntries.length}件読み込み</span>
            <button
              onClick={handleVerify}
              disabled={!osmResults || osmResults.length === 0}
              className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white text-[10px] rounded font-medium"
            >
              検証実行
            </button>
            {verificationResults && (
              <button
                onClick={handleDownloadVerification}
                className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] rounded font-medium"
              >
                ⬇ 検証CSV
              </button>
            )}
            <button
              onClick={() => { setShowVerification(false); setPrevEntries(null); setVerificationResults(null) }}
              className="ml-auto text-[10px] text-slate-400 hover:text-red-500"
            >
              ✕ クローズ
            </button>
          </div>
          {/* 検証結果サマリー */}
          {verificationResults && (
            <div className="flex gap-2 text-[10px] text-amber-800">
              <span>変更なし: {verificationResults.filter(r => r.status === 'unchanged').length}</span>
              <span>名称変更: {verificationResults.filter(r => r.status === 'name_changed').length}</span>
              <span>位置違い: {verificationResults.filter(r => r.status === 'location_diff').length}</span>
              <span>BBOX外: {verificationResults.filter(r => r.status === 'not_in_bbox').length}</span>
            </div>
          )}
          {!osmResults || osmResults.length === 0 ? (
            <p className="text-[10px] text-amber-600 mt-1">先に「施設検索」タブでBBOX内のOSMデータを取得してください。</p>
          ) : null}
        </div>
      )}

      {/* 前年度CSV読み込みボタン（上部バーのCSVボタン横に追加） */}
      {!showVerification && (
        <div className="px-3 py-1.5 border-b border-slate-100 bg-slate-50 shrink-0 flex items-center gap-2">
          <label className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-500 text-[10px] rounded cursor-pointer transition-colors">
            📋 前年度CSV（type+ID）
            <input type="file" accept=".csv" onChange={handlePrevFileUpload} className="hidden" />
          </label>
          <span className="text-[10px] text-slate-400">
            前年度のOSM ID対応表を読み込み、現在の検索結果と照合して変更・移転を検出します
          </span>
        </div>
      )}

      {/* 3列メインエリア */}
      <div className="batch-columns flex flex-1 min-h-0">
        {/* 左: 対象施設リスト (30%) */}
        <div className={`${showMap ? 'w-[30%]' : 'w-[35%]'} border-r border-slate-200 flex flex-col min-h-0 transition-all`}>
          <div className="px-2 py-1.5 bg-slate-50 border-b border-slate-100 text-[10px] text-slate-500 shrink-0">
            対象施設（入力順）
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredResults.length === 0 ? (
              <p className="p-3 text-xs text-slate-400 text-center">
                {matchResults ? '条件に一致する施設がありません' : '照合を実行してください'}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filteredResults.map(r => (
                  <li
                    key={r.index}
                    onClick={() => handleSelectFacility(r.index)}
                    className={`px-2 py-1.5 cursor-pointer transition-colors ${
                      activeIndex === r.index
                        ? 'bg-primary-50 border-l-2 border-primary-500'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {/* 状態バッジ */}
                      <span className={`text-[9px] px-1 py-0.5 rounded font-medium shrink-0 ${
                        r.confirmed ? 'bg-emerald-100 text-emerald-700'
                        : r.matchType === 'none' ? 'bg-red-50 text-red-500'
                        : 'bg-amber-100 text-amber-700'
                      }`}>
                        {r.confirmed ? '✓' : r.matchType === 'none' ? '×' : '…'}
                      </span>
                      <span className="text-xs text-slate-700 truncate flex-1">
                        {r.inputName}
                      </span>
                      <span className="text-[9px] text-slate-400 shrink-0">#{r.index}</span>
                    </div>
                    {/* 確定したOSM情報 */}
                    {r.matched && (
                      <p className="text-[10px] text-slate-500 mt-0.5 truncate ml-4">
                        {r.matched.name || r.matched.matchedValue}
                        <span className="text-slate-400 ml-1 font-mono">
                          {r.matched.type}/{r.matched.id}
                        </span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* 中央: 候補比較 (45%) */}
        <div className={`${showMap ? 'w-[45%]' : 'w-[50%]'} border-r border-slate-200 flex flex-col min-h-0 transition-all`}>
          <div className="px-2 py-1.5 bg-slate-50 border-b border-slate-100 text-[10px] text-slate-500 shrink-0">
            {activeRow ? `「${activeRow.inputName}」のOSM候補` : 'OSM候補'}
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {!activeRow ? (
              <p className="text-xs text-slate-400 text-center mt-4">
                左の施設リストから対象を選択してください
              </p>
            ) : activeRow.matchType === 'none' ? (
              <div className="text-center mt-4">
                <p className="text-xs text-slate-500">
                  「{activeRow.inputName}」に一致する候補が見つかりませんでした。
                </p>
                <p className="text-[10px] text-amber-600 mt-2">
                  ※ OSMに未登録であるとは限りません。表記の違いやカテゴリの違いが原因の場合もあります。
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* 候補一覧 */}
                {activeRow.candidates.map((c, ci) => {
                  const isSelected = activeRow.confirmed && selections[activeRow.index] === ci
                  return (
                    <div
                      key={ci}
                      className={`border rounded-lg p-2.5 transition-colors ${
                        isSelected
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                          c.match.type === 'exact' ? 'bg-green-100 text-green-700'
                          : c.match.type === 'partial' ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                        }`}>
                          {c.match.type === 'exact' ? '完全一致' : c.match.type === 'partial' ? '部分一致' : '類似'}
                        </span>
                        <span className="text-xs text-slate-800 flex-1 truncate">
                          {c.result.name || c.match.value}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          {c.match.tag}
                        </span>
                        {c.match.distance != null && (
                          <span className="text-[10px] text-slate-400" title="編集距離">
                            d={c.match.distance}
                          </span>
                        )}
                      </div>
                      {/* OSM ID + リンク + 操作 */}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <a
                          href={`https://www.openstreetmap.org/${c.result.type}/${c.result.id}`}
                          target="_blank"
                          rel="noopener"
                          className="text-[10px] text-primary-600 hover:text-primary-800 font-mono"
                        >
                          {c.result.type}/{c.result.id}
                        </a>
                        <button
                          onClick={() => handlePreview(ci)}
                          className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                            previewCandidate?.index === activeRow.index && previewCandidate?.candidateIdx === ci
                              ? 'bg-blue-50 border-blue-300 text-blue-700'
                              : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-600'
                          }`}
                          title="地図で位置を確認（確定しない）"
                        >
                          📍
                        </button>
                        {/* 確定ボタン */}
                        {!isSelected ? (
                          <button
                            onClick={() => handleConfirm(ci)}
                            className="ml-auto px-2 py-0.5 bg-primary-600 hover:bg-primary-700 text-white text-[10px] rounded font-medium"
                          >
                            確定
                          </button>
                        ) : (
                          <button
                            onClick={handleUnconfirm}
                            className="ml-auto px-2 py-0.5 bg-slate-200 hover:bg-red-100 hover:text-red-700 text-slate-600 text-[10px] rounded font-medium"
                          >
                            ✓取り消し
                          </button>
                        )}
                      </div>
                      {/* 座標 */}
                      {c.result.lat != null && (
                        <p className="text-[9px] text-slate-400 mt-1">
                          {c.result.lat.toFixed(6)}, {c.result.lon.toFixed(6)}
                        </p>
                      )}
                    </div>
                  )
                })}

                {/* 類似候補の注意 */}
                {activeRow.candidates.some(c => c.match.type === 'similar') && (
                  <p className="text-[10px] text-amber-600 bg-amber-50 rounded px-2 py-1.5">
                    ⚠️ 類似候補（編集距離ベース）は自動確定されません。必ず名称を確認してください。
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 右: 地図 (25%) */}
        {showMap && (
          <div className="w-[25%] flex flex-col min-h-0">
            <div className="flex items-center justify-between px-2 py-1 bg-slate-50 border-b border-slate-100 shrink-0">
              <span className="text-[10px] text-slate-400">地図</span>
              <button
                onClick={() => setShowMap(false)}
                className="text-[10px] text-slate-500 hover:text-slate-700"
              >
                閉じる
              </button>
            </div>
            <div className="flex-1 relative min-h-0">
              <BatchMatchMap matchResults={matchResults} previewCandidate={previewCandidate} activeRow={activeRow} />
            </div>
          </div>
        )}
      </div>

      {/* 地図閉じ時の復元 */}
      {!showMap && (
        <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-3 py-1">
          <button onClick={() => setShowMap(true)} className="text-[10px] text-slate-500 hover:text-primary-600">
            + 地図を表示
          </button>
        </div>
      )}
    </div>
  )
}

export default BatchMatch
