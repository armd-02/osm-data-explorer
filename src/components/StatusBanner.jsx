import React from 'react'
import { useApp } from '../context/AppContext'

function StatusBanner() {
  const { state, dispatch } = useApp()
  const { status, error, results } = state

  // No banner for idle or success (results shown in panel)
  if (status === 'idle' || status === 'success') return null

  if (status === 'loading') {
    return (
      <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center gap-2">
        <svg className="w-4 h-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0a8 8 0 00-8 8z" />
        </svg>
        <span className="text-sm text-blue-700">Overpass API に問い合わせ中...</span>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="bg-red-50 border-b border-red-100 px-4 py-2 flex items-center gap-2">
        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m5.618-4.954l-1.036 1.036M12 4l2.496 2.496L12 4zm0 0l-2.496 2.496" />
        </svg>
        <div className="flex-1">
          <span className="text-sm text-red-700">
            {error || '検索に失敗しました'}
          </span>
        </div>
        <button
          onClick={() => dispatch({ type: 'CLEAR_RESULTS' })}
          className="text-xs text-red-600 hover:text-red-800 underline"
        >
          閉じる
        </button>
      </div>
    )
  }

  // Large results warning
  if (results.length > 1000) {
    return (
      <div className="bg-amber-50 border-b border-amber-100 px-4 py-2">
        <span className="text-sm text-amber-700">
          ⚠️ {results.length} 件の結果があります。表示には時間がかかる場合があります。
        </span>
      </div>
    )
  }

  return null
}

export default StatusBanner
