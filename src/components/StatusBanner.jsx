import React from 'react'
import { useApp } from '../context/AppContext'

const ERROR_LABELS = {
  timeout: 'タイムアウト',
  rate_limit: 'レート制限',
  server_error: 'サーバーエラー',
  network: '接続エラー',
  empty: '結果なし',
  invalid_query: 'クエリエラー'
}

function StatusBanner() {
  const { state } = useApp()
  const { status, error, errorType, errorSuggestion, results, fetchMeta } = state

  // モバイルで検索後に結果パネルへ直接スクロールするための導線
  const scrollToResults = () => {
    document.getElementById('results-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (status === 'loading') {
    return (
      <div className="bg-primary-50 border-b border-primary-200 px-4 py-2 flex items-center gap-2">
        <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-primary-800">Overpass APIにクエリ実行中...</span>
      </div>
    )
  }

  if (status === 'error' && error) {
    const label = errorType ? ERROR_LABELS[errorType] : null
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-2.5">
        <div className="flex items-start gap-2">
          <span className="text-red-600 text-sm font-medium shrink-0 mt-0.5">
            ⚠️ {label ? `${label}: ` : ''}{error}
          </span>
        </div>
        {errorSuggestion && (
          <p className="text-xs text-red-500 mt-1 ml-5">
            → {errorSuggestion}
          </p>
        )}
      </div>
    )
  }

  if (status === 'success') {
    const count = results.length
    if (count === 0) {
      return (
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2">
          <span className="text-sm text-slate-600">
            該当する結果がありません。
          </span>
          <span className="text-xs text-slate-400 ml-2">
            （OSMに未登録である可能性、または表記の違いで一致しない可能性があります）
          </span>
        </div>
      )
    }

    const timeStr = fetchMeta?.fetchedAt
      ? new Date(fetchMeta.fetchedAt).toLocaleString('ja-JP', {
          month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit'
        })
      : null

    return (
      <div className="bg-green-50 border-b border-green-200 px-4 py-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-green-800">
            {count.toLocaleString()}件の結果を取得しました
          </span>
          {count > 5000 && (
            <span className="text-xs text-amber-600">
              ⚠️ 大量の結果です。範囲を狭めると表示が早くなります。
            </span>
          )}
          {timeStr && (
            <span className="text-xs text-slate-500">
              取得: {timeStr}
              {fetchMeta?.cached && '（キャッシュ）'}
              {fetchMeta?.endpoint && ` / ${fetchMeta.endpoint}`}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={scrollToResults}
          className="lg:hidden mt-1.5 w-full py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          結果を見る ↓
        </button>
      </div>
    )
  }

  return null
}

export default StatusBanner
