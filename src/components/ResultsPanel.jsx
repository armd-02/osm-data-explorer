import React, { useMemo } from 'react'
import { useApp } from '../context/AppContext'

function ResultsPanel() {
  const { state, dispatch } = useApp()
  const { results, status, activeResultId, fetchMeta } = state

  // 集計サマリー（将来の集計機能 #9 用）
  const stats = useMemo(() => {
    if (results.length === 0) return null

    const byType = {}
    const missingName = []
    const missingTags = {}

    results.forEach((r) => {
      byType[r.type] = (byType[r.type] || 0) + 1
      if (!r.name) missingName.push(r)
      if (r.tags) {
        for (const key of ['phone', 'website', 'opening_hours', 'email']) {
          if (!r.tags[key]) {
            missingTags[key] = (missingTags[key] || 0) + 1
          }
        }
      }
    })

    return { total: results.length, byType, missingNameCount: missingName.length, missingTags }
  }, [results])

  const handleSelect = (id) => {
    dispatch({ type: 'SET_ACTIVE_RESULT', payload: id })
  }

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

  if (results.length === 0) {
    return (
      <div className="p-4 flex items-center justify-center h-full">
        <p className="text-sm text-slate-400">検索結果が表示されます</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* ヘッダー: サマリー */}
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-4 text-xs text-slate-600 flex-wrap">
        <span className="font-medium">{stats.total.toLocaleString()}件</span>
        {stats.byType && Object.entries(stats.byType).map(([type, count]) => (
          <span key={type}>{type}: {count.toLocaleString()}</span>
        ))}
        {stats.missingNameCount > 0 && (
          <span className="text-amber-600">名前なし: {stats.missingNameCount.toLocaleString()}件</span>
        )}
        {fetchMeta?.fetchedAt && (
          <span className="text-slate-400 ml-auto">
            {new Date(fetchMeta.fetchedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
            {fetchMeta.cached && ' ⚡'}
          </span>
        )}
      </div>

      {/* 結果一覧 */}
      <div className="flex-1 overflow-y-auto">
        <ul className="divide-y divide-slate-100">
          {results.slice(0, 500).map((result) => (
            <li
              key={`${result.type}-${result.id}`}
              onClick={() => handleSelect(result.id)}
              className={`px-4 py-2 cursor-pointer transition-colors ${
                activeResultId === result.id
                  ? 'bg-primary-50 border-l-2 border-primary-500'
                  : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                  result.type === 'node' ? 'bg-green-100 text-green-700'
                  : result.type === 'way' ? 'bg-blue-100 text-blue-700'
                  : 'bg-purple-100 text-purple-700'
                }`}>
                  {result.type}
                </span>
                <span className="text-sm text-slate-800 truncate flex-1">
                  {result.name || <span className="text-slate-400">（名前のない要素）</span>}
                </span>
                {result.matchType && (
                  <span className={`text-[9px] px-1 py-0.5 rounded shrink-0 ${
                    result.matchType === 'exact' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'
                  }`} title={result.matchType === 'exact' ? '完全一致' : '部分一致'}>
                    {result.matchType === 'exact' ? '完全' : '部分'}
                  </span>
                )}
                <a
                  href={`https://www.openstreetmap.org/${result.type}/${result.id}`}
                  target="_blank"
                  rel="noopener"
                  className="text-[10px] text-primary-600 hover:text-primary-800 shrink-0"
                  title="OpenStreetMapで開く"
                  onClick={(e) => e.stopPropagation()}
                >
                  🔗
                </a>
                <button
                  onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`${result.type}/${result.id}`) }}
                  className="text-[10px] text-slate-400 hover:text-slate-600 shrink-0"
                  title="OSM IDをコピー"
                >
                  {result.id}
                </button>
              </div>
              {/* タグサマリー */}
              {result.tags && Object.keys(result.tags).length > 0 && (
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                  {Object.entries(result.tags)
                    .filter(([k]) => !['name', 'name:ja'].includes(k))
                    .slice(0, 4)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(' · ')}
                </p>
              )}
            </li>
          ))}
        </ul>
        {results.length > 500 && (
          <p className="px-4 py-2 text-xs text-slate-400 text-center">
            残り {(results.length - 500).toLocaleString()}件は表示していません（全{results.length.toLocaleString()}件）
          </p>
        )}
      </div>
    </div>
  )
}

export default ResultsPanel
