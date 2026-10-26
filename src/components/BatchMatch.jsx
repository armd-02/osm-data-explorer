import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { useBatchMatch } from '../context/BatchMatchContext.jsx'
import { parseNameList, batchMatch, matchResultsToCSV } from '../utils/batchMatch'
import { downloadFile } from '../utils/export'
import L from 'leaflet'

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

  const { inputText, matchResults, selections, activeIndex, previewCandidate, processing } = bmState
  const { results: osmResults } = appState

  // 照合実行
  const handleMatch = useCallback(() => {
    if (!osmResults || osmResults.length === 0) {
      alert('先に「施設検索」タブでBBOXを指定してOSMデータを検索してください。')
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

  // ファイル読込
  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => bmDispatch({ type: 'SET_INPUT_TEXT', payload: ev.target.result })
    reader.readAsText(file, 'utf-8')
    e.target.value = ''
  }, [bmDispatch])

  // サマリー計算
  const summary = useMemo(() => {
    if (!matchResults) return null
    return {
      total: matchResults.length,
      confirmed: matchResults.filter(r => r.confirmed).length,
      unconfirmed: matchResults.filter(r => !r.confirmed && r.matchType !== 'none').length,
      none: matchResults.filter(r => r.matchType === 'none').length,
    }
  }, [matchResults])

  // 絞り込み
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

  return (
    <div className="batch-workspace h-full flex flex-col">
      {/* 上部バー: 入力 + 操作 + サマリー */}
      <div className="px-3 py-2 border-b border-slate-200 bg-white space-y-2 shrink-0">
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
              <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
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
              onClick={handleDownload}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] rounded font-medium"
            >
              ⬇ CSV出力
            </button>
          </div>
        )}
      </div>

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

/**
 * 一括照合用ミニ地図 (#35)
 * プレビュー候補の位置を表示（panToのみ、BBOX変更しない）
 * 確定済みの位置も表示
 */
function BatchMatchMap({ matchResults, previewCandidate, activeRow }) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return
    
    const map = L.map(mapContainerRef.current, {
      center: [34.705, 135.485],
      zoom: 14,
      zoomControl: true,
      attributionControl: true  // OSM帰属表示を有効化 (#35)
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // プレビュー/確定の位置へpanTo
  useEffect(() => {
    if (!mapRef.current || !matchResults) return

    let target = null

    // プレビュー候補があればそれを優先
    if (previewCandidate) {
      const row = matchResults.find(r => r.index === previewCandidate.index)
      if (row && row.candidates[previewCandidate.candidateIdx]) {
        const c = row.candidates[previewCandidate.candidateIdx]
        if (c.result.lat != null && c.result.lon != null) {
          target = { lat: c.result.lat, lon: c.result.lon, label: c.result.name || '候補', confirmed: false }
        }
      }
    }

    // プレビューなしなら確定済みの位置
    if (!target && activeRow?.matched) {
      if (activeRow.matched.lat != null && activeRow.matched.lon != null) {
        target = { lat: activeRow.matched.lat, lon: activeRow.matched.lon, label: activeRow.matched.name || '確定', confirmed: true }
      }
    }

    if (!target) return

    mapRef.current.panTo([target.lat, target.lon], { animate: true })

    // マーカー更新
    if (markerRef.current) {
      mapRef.current.removeLayer(markerRef.current)
      markerRef.current = null
    }
    const color = target.confirmed ? '#059669' : '#dc2626'
    markerRef.current = L.marker([target.lat, target.lon], {
      icon: L.divIcon({
        html: `<div style="width:14px;height:14px;background:${color};border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      })
    }).addTo(mapRef.current)
    markerRef.current.bindTooltip(target.label, { direction: 'top', offset: [0, -8] })
  }, [previewCandidate, activeRow?.matched?.lat, activeRow?.matched?.lon, matchResults])

  return <div ref={mapContainerRef} className="w-full h-full" />
}

export default BatchMatch
