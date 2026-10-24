import React, { useMemo } from 'react'
import { useApp } from '../context/AppContext'

function ResultsPanel() {
  const { state, dispatch } = useApp()
  const { results, status, activeResultId } = state

  // Summary stats
  const stats = useMemo(() => {
    if (results.length === 0) return null
    const byType = {}
    const missingNames = results.filter((r) => !r.name).length
    const missingTags = results.filter((r) => !r.tags || Object.keys(r.tags).length <= 1).length
    results.forEach((r) => {
      byType[r.type || 'node'] = (byType[r.type || 'node'] || 0) + 1
    })
    return { total: results.length, byType, missingNames, missingTags }
  }, [results])

  if (status === 'idle') {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <p className="text-sm text-slate-400">検索すると結果がここに表示されます</p>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <svg className="w-4 h-4 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0a8 8 0 00-8 8z" />
          </svg>
          検索中...
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="p-4">
        <p className="text-sm text-red-600">検索に失敗しました。時間をおいて再試行してください。</p>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <p className="text-sm text-slate-500">検索結果が0件です</p>
          <p className="text-xs text-slate-400 mt-1">
            検索範囲を広げたり、条件を変更して再検索してください
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Summary bar */}
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 shrink-0">
        <span className="text-sm font-medium text-slate-700">
          {stats.total} 件の結果
        </span>
        {stats.byType && Object.entries(stats.byType).map(([type, count]) => (
          <span key={type} className="text-xs text-slate-500">
            {type}: {count}
          </span>
        ))}
        {stats.missingNames > 0 && (
          <span className="text-xs text-amber-600">
            名前なし: {stats.missingNames}件
          </span>
        )}
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-y-auto">
        {results.map((result) => (
          <button
            key={result.id}
            onClick={() => dispatch({ type: 'SET_ACTIVE_RESULT', payload: result.id })}
            className={`w-full px-4 py-2 text-left text-sm border-b border-slate-50 hover:bg-primary-50 transition-colors ${
              activeResultId === result.id ? 'bg-primary-50' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary-500 shrink-0" />
              <span className="flex-1 truncate">
                {result.name || <span className="text-slate-400">（名前なし）</span>}
              </span>
              <span className="text-xs text-slate-400 shrink-0">
                {result.type}/{result.id}
              </span>
            </div>
            {result.tags && Object.keys(result.tags).length > 1 && (
              <p className="text-xs text-slate-400 ml-4 truncate">
                {Object.entries(result.tags)
                  .filter(([k]) => k !== 'name')
                  .slice(0, 3)
                  .map(([k, v]) => `${k}=${v}`)
                  .join('  ')}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

export default ResultsPanel
