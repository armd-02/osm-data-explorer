import React, { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'

/**
 * 検索結果テーブル (#37)
 * 施設名・OSM型・ID・タグを列で比較可能
 * 絞り込み・ソート・行選択→地図移動
 */
function ResultsPanel() {
  const { state, dispatch } = useApp()
  const { results, status, activeResultId, fetchMeta } = state

  const [nameFilter, setNameFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sortDir, setSortDir] = useState('none') // 'none' | 'name_asc' | 'name_desc'

  // 絞り込み + ソート
  const displayResults = useMemo(() => {
    if (!results) return []
    let filtered = results

    // 名称絞り込み
    if (nameFilter.trim()) {
      const q = nameFilter.trim().toLowerCase()
      filtered = filtered.filter(r => {
        const name = (r.name || '').toLowerCase()
        const tags = r.tags || {}
        const nameJa = (tags['name:ja'] || '').toLowerCase()
        return name.includes(q) || nameJa.includes(q)
      })
    }

    // 型絞り込み
    if (typeFilter !== 'all') {
      filtered = filtered.filter(r => r.type === typeFilter)
    }

    // ソート
    if (sortDir === 'name_asc') {
      filtered = [...filtered].sort((a, b) => (a.name || '〜').localeCompare(b.name || '〜', 'ja'))
    } else if (sortDir === 'name_desc') {
      filtered = [...filtered].sort((a, b) => (b.name || '〜').localeCompare(a.name || '〜', 'ja'))
    }

    return filtered
  }, [results, nameFilter, typeFilter, sortDir])

  const makeOsmId = (r) => `${r.type}/${r.id}`

  const handleSelect = (result) => {
    dispatch({ type: 'SET_ACTIVE_RESULT', payload: makeOsmId(result) })
  }

  // サマリー
  const stats = useMemo(() => {
    if (!results || results.length === 0) return null
    const byType = {}
    results.forEach(r => { byType[r.type] = (byType[r.type] || 0) + 1 })
    return { total: results.length, byType }
  }, [results])

  if (status === 'loading') {
    return (
      <div className="p-4 flex items-center justify-center h-full">
        <div className="flex items-center gap-2 text-slate-500">
          <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">結果を読み込み中...</span>
        </div>
      </div>
    )
  }

  if (!results || results.length === 0) {
    return (
      <div className="p-4 flex items-center justify-center h-full">
        <p className="text-sm text-slate-400">検索結果が表示されます</p>
      </div>
    )
  }

  const MAX_DISPLAY = 500
  const displayList = displayResults.slice(0, MAX_DISPLAY)

  return (
    <div className="h-full flex flex-col">
      {/* サマリー + 絞り込みバー */}
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 space-y-1.5 shrink-0">
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span className="font-medium">{stats.total.toLocaleString()}件</span>
          {Object.entries(stats.byType).map(([type, count]) => (
            <span key={type}>{type}: {count}</span>
          ))}
          {fetchMeta?.fetchedAt && (
            <span className="text-slate-400 ml-auto text-[10px]">
              {new Date(fetchMeta.fetchedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
              {fetchMeta.cached && ' ⚡'}
            </span>
          )}
        </div>
        {/* 絞り込み・ソート */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="名称で絞り込み"
            className="px-2 py-1 text-[11px] border border-slate-200 rounded w-32 focus:outline-none focus:ring-1 focus:ring-primary-300"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-1.5 py-1 text-[11px] border border-slate-200 rounded focus:outline-none"
          >
            <option value="all">全て</option>
            <option value="node">node</option>
            <option value="way">way</option>
            <option value="relation">relation</option>
          </select>
          <button
            onClick={() => setSortDir(sortDir === 'name_asc' ? 'name_desc' : 'name_asc')}
            className={`px-2 py-1 text-[11px] border rounded transition-colors ${
              sortDir !== 'none' ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            名前順 {sortDir === 'name_asc' ? '↑' : sortDir === 'name_desc' ? '↓' : '↕'}
          </button>
          {(nameFilter || typeFilter !== 'all' || sortDir !== 'none') && (
            <button
              onClick={() => { setNameFilter(''); setTypeFilter('all'); setSortDir('none') }}
              className="text-[10px] text-slate-400 hover:text-red-500"
            >
              リセット
            </button>
          )}
          {displayResults.length !== stats.total && (
            <span className="text-[10px] text-slate-400 ml-auto">
              {displayResults.length.toLocaleString()}/{stats.total.toLocaleString()}件
            </span>
          )}
        </div>
      </div>

      {/* テーブル */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-[11px] border-collapse">
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr>
              <th className="text-left px-2 py-1.5 text-slate-500 font-medium whitespace-nowrap">施設名</th>
              <th className="text-left px-2 py-1.5 text-slate-500 font-medium whitespace-nowrap">型</th>
              <th className="text-left px-2 py-1.5 text-slate-500 font-medium whitespace-nowrap">OSM ID</th>
              <th className="text-left px-2 py-1.5 text-slate-500 font-medium whitespace-nowrap min-w-[120px]">主要タグ</th>
            </tr>
          </thead>
          <tbody>
            {displayList.map(result => (
              <tr
                key={makeOsmId(result)}
                onClick={() => handleSelect(result)}
                className={`border-t border-slate-100 cursor-pointer transition-colors ${
                  activeResultId === makeOsmId(result)
                    ? 'bg-primary-50'
                    : 'hover:bg-slate-50'
                }`}
              >
                <td className="px-2 py-1.5 text-slate-800 max-w-[160px] truncate">
                  {result.name || <span className="text-slate-400">（名前のない要素）</span>}
                </td>
                <td className="px-2 py-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    result.type === 'node' ? 'bg-green-100 text-green-700'
                    : result.type === 'way' ? 'bg-blue-100 text-blue-700'
                    : 'bg-purple-100 text-purple-700'
                  }`}>
                    {result.type}
                  </span>
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <a
                    href={`https://www.openstreetmap.org/${result.type}/${result.id}`}
                    target="_blank"
                    rel="noopener"
                    className="text-primary-600 hover:text-primary-800 font-mono"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {result.id}
                  </a>
                </td>
                <td className="px-2 py-1.5 text-slate-500 max-w-[200px] truncate">
                  {result.tags ? Object.entries(result.tags)
                    .filter(([k]) => !['name', 'name:ja'].includes(k))
                    .slice(0, 3)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(' · ') : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {displayResults.length > MAX_DISPLAY && (
          <p className="px-3 py-2 text-[10px] text-slate-400 text-center">
            残り {(displayResults.length - MAX_DISPLAY).toLocaleString()}件は表示していません
            （全{displayResults.length.toLocaleString()}件。CSV/GeoJSONで全件出力できます）
          </p>
        )}
      </div>
    </div>
  )
}

export default ResultsPanel
