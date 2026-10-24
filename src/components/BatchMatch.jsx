import React, { useState, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { batchMatch, matchResultsToCSV, parseNameList } from '../utils/batchMatch'
import { downloadFile } from '../utils/export'

/**
 * 店舗名の一括照合パネル
 */
function BatchMatch() {
  const { state, dispatch } = useApp()
  const { results, bbox, status } = state
  const [inputText, setInputText] = useState('')
  const [matchResults, setMatchResults] = useState(null)
  const [processing, setProcessing] = useState(false)

  const handleMatch = useCallback(() => {
    const names = parseNameList(inputText)
    if (names.length === 0) return
    if (!results || results.length === 0) {
      alert('先にBBOXを指定してOSMデータを検索してください。')
      return
    }

    setProcessing(true)
    // 少し遅延させてUI更新を待つ
    setTimeout(() => {
      const results = batchMatch(names, state.results)
      setMatchResults(results)
      setProcessing(false)
    }, 50)
  }, [inputText, results, state.results])

  const handleDownload = () => {
    if (!matchResults) return
    const csv = matchResultsToCSV(matchResults)
    const dateStr = new Date().toISOString().slice(0, 10)
    downloadFile(csv, `osm-batch-match-${dateStr}.csv`, 'text/csv;charset=utf-8')
  }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setInputText(ev.target.result)
    reader.readAsText(file, 'utf-8')
  }

  const summary = matchResults ? {
    exact: matchResults.filter(r => r.matchType === 'exact').length,
    partial: matchResults.filter(r => r.matchType === 'partial').length,
    similar: matchResults.filter(r => r.matchType === 'similar').length,
    none: matchResults.filter(r => r.matchType === 'none').length,
    total: matchResults.length
  } : null

  return (
    <div className="h-full flex flex-col">
      {/* 入力エリア */}
      <div className="p-3 border-b border-slate-200">
        <label className="text-xs font-medium text-slate-600 block mb-1">
          店舗名リスト（1行に1件、またはCSV貼り付け）
        </label>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          className="w-full h-24 text-xs border border-slate-200 rounded px-2 py-1.5 bg-white resize-none focus:outline-none focus:ring-1 focus:ring-primary-400"
          placeholder={'例:\nラーメン屋 田中\nカフェ 山本\n薬局 鈴木'}
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={handleMatch}
            disabled={processing || !inputText.trim()}
            className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs rounded font-medium transition-colors"
          >
            {processing ? '照合中...' : '照合実行'}
          </button>
          <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs rounded font-medium cursor-pointer transition-colors">
            📁 CSV読込
            <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
          </label>
          <span className="text-[10px] text-slate-400 ml-auto">
            {inputText.trim() ? `${parseNameList(inputText).length}件入力` : ''}
          </span>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          ※ 照合には先にOSMデータの検索（BBOX指定）が必要です。
          {results?.length > 0 && ` 現在${results.length}件のOSMデータが利用可能。`}
        </p>
      </div>

      {/* 結果サマリー */}
      {summary && (
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-3 text-xs flex-wrap">
          <span className="font-medium text-slate-700">{summary.total}件照合</span>
          <span className="text-green-600">完全: {summary.exact}</span>
          <span className="text-amber-600">部分: {summary.partial}</span>
          <span className="text-blue-600">類似: {summary.similar}</span>
          <span className="text-red-500">候補なし: {summary.none}</span>
          <button
            onClick={handleDownload}
            className="ml-auto px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] rounded font-medium"
          >
            ⬇ CSV出力
          </button>
        </div>
      )}

      {/* 照合結果一覧 */}
      {matchResults && (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="text-left px-2 py-1.5 text-slate-500 font-medium">#</th>
                <th className="text-left px-2 py-1.5 text-slate-500 font-medium">入力名</th>
                <th className="text-left px-2 py-1.5 text-slate-500 font-medium">結果</th>
                <th className="text-left px-2 py-1.5 text-slate-500 font-medium">OSM</th>
                <th className="text-right px-2 py-1.5 text-slate-500 font-medium">候補</th>
              </tr>
            </thead>
            <tbody>
              {matchResults.map(r => (
                <tr key={r.index} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-2 py-1 text-slate-400">{r.index}</td>
                  <td className="px-2 py-1 text-slate-700 max-w-[120px] truncate">{r.inputName}</td>
                  <td className="px-2 py-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      r.matchType === 'exact' ? 'bg-green-100 text-green-700'
                      : r.matchType === 'partial' ? 'bg-amber-100 text-amber-700'
                      : r.matchType === 'similar' ? 'bg-blue-100 text-blue-700'
                      : 'bg-red-50 text-red-500'
                    }`}>
                      {r.matchType === 'exact' ? '完全' : r.matchType === 'partial' ? '部分' : r.matchType === 'similar' ? '類似' : 'なし'}
                    </span>
                    {r.matched && (
                      <span className="text-slate-500 ml-1">{r.matched.name || r.matched.matchedValue}</span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {r.matched ? (
                      <a
                        href={r.matched.url}
                        target="_blank"
                        rel="noopener"
                        className="text-primary-600 hover:text-primary-800 font-mono text-[10px]"
                      >
                        {r.matched.type}/{r.matched.id}
                      </a>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right text-slate-500">
                    {r.candidates.length > 0 ? `${r.candidates.length}件` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {summary?.none > 0 && (
            <p className="px-3 py-2 text-[10px] text-amber-600 bg-amber-50">
              ⚠️ 「候補なし」はOSMに未登録であるとは限りません。表記の違い（例: 「薬局」vs「ドラッグストア」）が原因のこともあります。
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default BatchMatch
