import React from 'react'

/**
 * (#47) 検索アクションボタン（フォームのスクロール領域の外に表示）
 *
 * 「検索する」「検索中→中止」を表示する再利用コンポーネント。
 * criteria は buildSearchCriteria() の戻り値（クリック時点のスナップショット）。
 * 失敗時（ok: false）はボタンをdisableし、理由を表示する。
 *
 * @param {object}   criteria  検索条件スナップショット { ok, reason?, message?, suggestion? }
 * @param {string}   status    検索状態 'idle' | 'loading' | 'success' | 'error'
 * @param {Function} onSearch  検索実行（クリック時に呼ばれる。新規criteriaを生成して渡す）
 * @param {Function} onCancel  検索中止
 * @param {boolean}  [showHint] disable理由・提案を表示する（デフォルト: true）
 */
export default function SearchActionButton({ criteria, status, onSearch, onCancel, showHint = true }) {
  const loading = status === 'loading'

  if (loading) {
    return (
      <div className="flex items-center gap-2" role="status">
        <span className="text-xs text-slate-500">検索中...</span>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors"
          title="検索を中止する"
        >
          中止
        </button>
      </div>
    )
  }

  const disabled = !criteria || criteria.ok !== true

  return (
    <div className="flex items-center gap-2 min-w-0">
      <button
        type="button"
        onClick={onSearch}
        disabled={disabled}
        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
          disabled
            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
            : 'bg-primary-600 text-white hover:bg-primary-700'
        }`}
        title={disabled && criteria ? `${criteria.message} ${criteria.suggestion || ''}`.trim() : '検索を実行する'}
      >
        検索する
      </button>
      {showHint && disabled && criteria && (
        <span className="text-[10px] text-amber-700 bg-amber-50 rounded px-2 py-1 leading-tight max-w-[220px] truncate" title={`${criteria.message} ${criteria.suggestion || ''}`.trim()}>
          {criteria.message}
        </span>
      )}
    </div>
  )
}
