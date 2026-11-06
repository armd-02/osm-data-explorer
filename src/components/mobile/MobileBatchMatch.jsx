import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import { useBatchMatch } from '../../context/BatchMatchContext.jsx'
import { parseNameList, batchMatch, matchResultsToCSV } from '../../utils/batchMatch'
import { matchResultsToLocationCSV } from '../../utils/locationCsv'
import { downloadFile } from '../../utils/export'
import BatchMatchMap from '../BatchMatchMap'

/**
 * (#61?) モバイル用一括照合レイアウト（店名→座標 一括照合）
 *
 * PC版（BatchMatch.jsx）の3ペイン比較レイアウトはスマホ幅に圧縮すると
 * 地図が切れるため、縦流れの1カラムレイアウトにする:
 *
 *   ① 入力（textarea / CSV取込）＋照合ボタン
 *   ② サマリー＋状態絞り込み＋CSV出力
 *   ③ 対象施設リスト（タップで選択）
 *   ④ 選択施設のOSM候補（確認/確定/取消）
 *   ⑤ ミニ地図（位置確認。固定高さ）
 *
 * 状態はBatchMatchContextに保持するため、モバイルの3タブ（検索/一覧/その他）
 * を往復しても入力・照合結果・確定状態が消えない（#31）。
 * 施設切替時のマーカー消去（#39）・プレーンテキストツールチップ（#38）は
 * 共用コンポーネント BatchMatchMap 内で維持される。
 *
 * 確定/取消の意味（PC版と同一）:
 *   確定 = その候補を「この店名に対応するOSM要素」として採用。
 *          地図用CSVに座標・OSM IDが付与される。
 *   取消 = 採用を解除（座標出力から外れる）。候補自体は残る。
 */
export default function MobileBatchMatch() {
  const { state: appState } = useApp()
  const { state: bmState, dispatch: bmDispatch } = useBatchMatch()

  const { inputText, matchResults, selections, activeIndex, previewCandidate, processing } = bmState
  const { results: osmResults } = appState

  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'unconfirmed' | 'confirmed' | 'none'

  // 施設選択時に候補セクションへスクロール（縦流れの導線）
  const candidatesRef = useRef(null)
  const lastSelectedRef = useRef(null)
  useEffect(() => {
    if (activeIndex == null) { lastSelectedRef.current = null; return }
    if (lastSelectedRef.current === activeIndex) return
    lastSelectedRef.current = activeIndex
    if (candidatesRef.current && typeof candidatesRef.current.scrollIntoView === 'function') {
      candidatesRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [activeIndex])

  // 照合実行（PC版と同一ロジック）
  const handleMatch = useCallback(() => {
    if (!osmResults || osmResults.length === 0) {
      alert('先に「検索」タブで地域を指定してOSMデータを検索してください。')
      return
    }
    const names = parseNameList(inputText)
    if (names.length === 0) return

    bmDispatch({ type: 'SET_PROCESSING', payload: true })
    setTimeout(() => {
      const res = batchMatch(names, osmResults)
      bmDispatch({ type: 'SET_MATCH_RESULTS', payload: res })
      bmDispatch({ type: 'SET_PROCESSING', payload: false })
    }, 50)
  }, [inputText, osmResults, bmDispatch])

  // ファイル読込
  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => bmDispatch({ type: 'SET_INPUT_TEXT', payload: ev.target.result })
    reader.readAsText(file, 'utf-8')
    e.target.value = ''
  }, [bmDispatch])

  // 施設選択（#39: previewCandidateもリセットされる）
  const handleSelectFacility = useCallback((index) => {
    bmDispatch({ type: 'SELECT_FACILITY', payload: index })
  }, [bmDispatch])

  // 地図プレビュー（確定せずに候補の位置を表示）
  const handlePreview = useCallback((candidateIdx) => {
    if (activeIndex == null) return
    bmDispatch({ type: 'SET_PREVIEW', payload: { index: activeIndex, candidateIdx } })
  }, [activeIndex, bmDispatch])

  // 候補確定 / 取り消し
  const handleConfirm = useCallback((candidateIdx) => {
    if (activeIndex == null) return
    bmDispatch({ type: 'CONFIRM_CANDIDATE', payload: { index: activeIndex, candidateIdx } })
  }, [activeIndex, bmDispatch])

  const handleUnconfirm = useCallback(() => {
    if (activeIndex == null) return
    bmDispatch({ type: 'UNCONFIRM', payload: activeIndex })
  }, [activeIndex, bmDispatch])

  // CSV出力（PC版と同一）
  const handleDownload = useCallback(() => {
    if (!matchResults) return
    const csv = matchResultsToCSV(matchResults)
    const dateStr = new Date().toISOString().slice(0, 10)
    downloadFile(csv, `osm-batch-match-${dateStr}.csv`, 'text/csv;charset=utf-8')
  }, [matchResults])

  const handleDownloadLocations = useCallback(() => {
    if (!matchResults) return
    const csv = matchResultsToLocationCSV(matchResults)
    const dateStr = new Date().toISOString().slice(0, 10)
    downloadFile(csv, `map-locations-${dateStr}.csv`, 'text/csv;charset=utf-8')
  }, [matchResults])

  // サマリー（PC版と同一）
  const summary = useMemo(() => {
    if (!matchResults) return null
    return {
      total: matchResults.length,
      confirmed: matchResults.filter(r => r.confirmed).length,
      unconfirmed: matchResults.filter(r => !r.confirmed && r.matchType !== 'none').length,
      none: matchResults.filter(r => r.matchType === 'none').length,
    }
  }, [matchResults])

  // 絞り込み（PC版と同一）
  const filteredResults = useMemo(() => {
    if (!matchResults) return []
    switch (statusFilter) {
      case 'confirmed': return matchResults.filter(r => r.confirmed)
      case 'unconfirmed': return matchResults.filter(r => !r.confirmed && r.matchType !== 'none')
      case 'none': return matchResults.filter(r => r.matchType === 'none')
      default: return matchResults
    }
  }, [matchResults, statusFilter])

  // 現在選択中の施設
  const activeRow = activeIndex != null ? matchResults?.find(r => r.index === activeIndex) : null
  const activeSelectionIdx = activeRow ? selections[activeRow.index] : undefined

  return (
    <div className="pb-4">
      {/* ① 入力 */}
      <section className="bg-white border-b border-slate-200 px-3 py-3">
        <p className="text-[11px] text-slate-600 mb-2">
          ①「検索」タブで対象地域をOSM検索 → ②店名リストを貼り付け → ③照合 → ④候補を地図で確認し「確定」 → ⑤地図用CSVを保存
        </p>
        <textarea
          value={inputText}
          onChange={(e) => bmDispatch({ type: 'SET_INPUT_TEXT', payload: e.target.value })}
          placeholder={'施設名を1行に1件入力\n例:\nラーメン屋 田中\nカフェ 山本'}
          rows={4}
          aria-label="店名リスト（1行1件）"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-400 resize-none"
        />
        <div className="flex gap-2 mt-2">
          <label className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 px-3 bg-slate-100 text-slate-600 text-sm rounded-lg font-medium">
            📁 CSV取込
            <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
          </label>
          <button
            onClick={handleMatch}
            disabled={processing || !inputText.trim()}
            className="flex-1 min-h-[44px] px-3 bg-primary-600 text-white text-sm rounded-lg font-medium disabled:bg-slate-300"
          >
            {processing ? '照合中…' : '照合実行'}
          </button>
        </div>
      </section>

      {/* ② サマリー・絞り込み・出力 */}
      {summary && (
        <section className="bg-white border-b border-slate-200 px-3 py-2.5 space-y-2">
          <p className="text-xs text-slate-500">
            {summary.total}件中:
            <span className="text-emerald-600 font-medium"> 確認済 {summary.confirmed}</span>
            <span className="text-amber-600 font-medium"> 要確認 {summary.unconfirmed}</span>
            <span className="text-red-500 font-medium"> 候補なし {summary.none}</span>
          </p>
          <div className="flex flex-wrap gap-1" role="group" aria-label="状態絞り込み">
            {[
              ['all', '全て'],
              ['unconfirmed', '要確認'],
              ['confirmed', '確認済'],
              ['none', '候補なし'],
            ].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setStatusFilter(val)}
                className={`min-h-[36px] px-3 text-xs rounded-full transition-colors ${
                  statusFilter === val ? 'bg-primary-600 text-white font-medium' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDownloadLocations}
              className="flex-1 min-h-[44px] px-3 bg-emerald-600 text-white text-sm rounded-lg font-medium"
            >
              ⬇ 地図用CSV（確定 {summary.confirmed} 件）
            </button>
            <button
              onClick={handleDownload}
              className="min-h-[44px] px-3 bg-slate-100 text-slate-600 text-sm rounded-lg font-medium"
            >
              照合CSV
            </button>
          </div>
          <p className="text-[10px] text-slate-400">
            地図用CSVは確定済みの候補だけに座標を付与します（未確認・候補なしは空欄）。
          </p>
        </section>
      )}

      {/* ③ 対象施設リスト */}
      <section className="bg-white border-b border-slate-200">
        <div className="px-3 py-2 text-xs font-medium text-slate-500">
          対象施設（入力順）
        </div>
        <div className="max-h-44 overflow-y-auto px-1">
          {!matchResults ? (
            <p className="px-2 py-3 text-xs text-slate-400 text-center">
              照合を実行すると、入力した店名がリストされます
            </p>
          ) : filteredResults.length === 0 ? (
            <p className="px-2 py-3 text-xs text-slate-400 text-center">条件に一致する施設がありません</p>
          ) : (
            <ul>
              {filteredResults.map(r => (
                <li key={r.index}>
                  <button
                    onClick={() => handleSelectFacility(r.index)}
                    aria-pressed={activeIndex === r.index}
                    className={`w-full text-left px-2.5 py-2.5 flex items-center gap-2 border-b border-slate-50 ${
                      activeIndex === r.index ? 'bg-primary-50' : 'active:bg-slate-50'
                    }`}
                  >
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                      r.confirmed ? 'bg-emerald-100 text-emerald-700'
                      : r.matchType === 'none' ? 'bg-red-50 text-red-500'
                      : 'bg-amber-100 text-amber-700'
                    }`}>
                      {r.confirmed ? '✓ 確認済' : r.matchType === 'none' ? '× 候補なし' : '… 要確認'}
                    </span>
                    <span className="text-sm text-slate-700 truncate flex-1">{r.inputName}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">#{r.index}</span>
                  </button>
                  {r.matched && activeIndex === r.index && (
                    <p className="px-2.5 pb-2 text-[11px] text-slate-500 truncate">
                      → {r.matched.name || r.matched.matchedValue}
                      <span className="text-slate-400 ml-1 font-mono">{r.matched.type}/{r.matched.id}</span>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ④ OSM候補 */}
      <section ref={candidatesRef} className="bg-white border-b border-slate-200">
        <div className="px-3 py-2 text-xs font-medium text-slate-500 scroll-mt-2">
          {activeRow ? `「${activeRow.inputName}」のOSM候補` : 'OSM候補'}
        </div>
        <div className="px-3 pb-3">
          {!activeRow ? (
            <p className="py-3 text-xs text-slate-400 text-center">
              上の施設リストから対象をタップしてください
            </p>
          ) : activeRow.matchType === 'none' ? (
            <div className="py-3 text-center">
              <p className="text-xs text-slate-500">
                「{activeRow.inputName}」に一致する候補が見つかりませんでした。
              </p>
              <p className="text-[10px] text-amber-600 mt-2">
                ※ OSMに未登録とは限りません。表記の違いが原因の場合もあります。
                該当しない場合はiDエディタで新規追加できます。
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {activeRow.candidates.map((c, ci) => {
                const isSelected = activeRow.confirmed && activeSelectionIdx === ci
                return (
                  <div
                    key={ci}
                    className={`border rounded-xl p-3 ${
                      isSelected ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                        c.match.type === 'exact' ? 'bg-green-100 text-green-700'
                        : c.match.type === 'partial' ? 'bg-amber-100 text-amber-700'
                        : 'bg-blue-100 text-blue-700'
                      }`}>
                        {c.match.type === 'exact' ? '完全一致' : c.match.type === 'partial' ? '部分一致' : '類似'}
                      </span>
                      <span className="text-sm text-slate-800 flex-1 min-w-[120px] truncate">
                        {c.result.name || c.match.value}
                      </span>
                      {c.match.distance != null && (
                        <span className="text-[10px] text-slate-400">d={c.match.distance}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <a
                        href={`https://www.openstreetmap.org/${c.result.type}/${c.result.id}`}
                        target="_blank"
                        rel="noopener"
                        className="text-[11px] text-primary-600 font-mono"
                      >
                        {c.result.type}/{c.result.id}
                      </a>
                      {c.result.lat != null && (
                        <span className="text-[10px] text-slate-400">
                          {c.result.lat.toFixed(5)}, {c.result.lon.toFixed(5)}
                        </span>
                      )}
                    </div>
                    {/* 操作: プレビュー / 確定 / 取消 */}
                    <div className="flex gap-2 mt-2.5">
                      <button
                        onClick={() => handlePreview(ci)}
                        className={`min-h-[40px] px-3 text-xs rounded-lg border ${
                          previewCandidate?.index === activeRow.index && previewCandidate?.candidateIdx === ci
                            ? 'bg-blue-50 border-blue-300 text-blue-700'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        📍 地図で確認
                      </button>
                      {isSelected ? (
                        <button
                          onClick={handleUnconfirm}
                          className="flex-1 min-h-[44px] px-3 bg-slate-200 text-slate-700 text-sm rounded-lg font-medium"
                        >
                          ✓ 取消
                        </button>
                      ) : (
                        <button
                          onClick={() => handleConfirm(ci)}
                          className="flex-1 min-h-[44px] px-3 bg-primary-600 text-white text-sm rounded-lg font-medium"
                        >
                          確定
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}

              {activeRow.candidates.some(c => c.match.type === 'similar') && (
                <p className="text-[10px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-2">
                  ⚠️ 類似候補（編集距離ベース）は自動確定されません。必ず名称を確認してください。
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ⑤ ミニ地図 */}
      {matchResults && activeRow && (
        <section className="bg-white">
          <div className="px-3 py-2 text-xs font-medium text-slate-500">
            位置を確認（確定すると緑マーカー、プレビューは赤マーカー）
          </div>
          <div className="h-44 mx-3 rounded-lg overflow-hidden border border-slate-200">
            <BatchMatchMap matchResults={matchResults} previewCandidate={previewCandidate} activeRow={activeRow} />
          </div>
        </section>
      )}
    </div>
  )
}
