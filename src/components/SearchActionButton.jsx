/**
 * Search/Cancel button (Issue #47)
 *
 * Placed outside the scrollable search form area so the primary action
 * is always visible without scrolling. Used in the PC header and on the
 * search screen of the mobile layout.
 *
 * fullWidth=true: mobile variant — large tap target (min 44px), hint
 * shown below the button. fullWidth=false: original PC header variant.
 */
import React from 'react'

export default function SearchActionButton({
  criteria,
  status,
  onSearch,
  onCancel,
  showHint = true,
  fullWidth = false,
  label = '検索する',
}) {
  const loading = status === 'loading'

  if (loading) {
    if (fullWidth) {
      return (
        <div className="flex flex-col gap-2" role="status">
          <div className="flex items-center justify-center gap-2">
            <div
              className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"
              aria-hidden="true"
            />
            <span className="text-sm text-slate-600">検索中...</span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-full min-h-[44px] px-3 py-2 text-sm font-medium rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors"
          >
            中止
          </button>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2" role="status">
        <span className="text-sm text-slate-600">検索中...</span>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 text-sm font-medium rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors"
        >
          中止
        </button>
      </div>
    )
  }

  const disabled = !criteria || criteria.ok !== true
  const hint = disabled && criteria ? criteria.message : null
  const reason = disabled && criteria ? criteria.reason : null
  const title = hint
    ? `検索できません: ${hint}${reason ? ` (${reason})` : ''}`
    : '検索を実行します'

  if (fullWidth) {
    return (
      <div className="flex flex-col gap-1.5 min-w-0">
        <button
          type="button"
          onClick={onSearch}
          disabled={disabled}
          className={`w-full min-h-[48px] py-3 text-base font-semibold rounded-xl transition-colors ${
            disabled
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-primary-600 text-white hover:bg-primary-700'
          }`}
          title={title}
        >
          {label}
        </button>
        {showHint && hint && (
          <p
            className="text-[11px] text-amber-700 bg-amber-50 rounded-md px-2.5 py-1.5 leading-snug"
            title={hint}
          >
            {hint}
          </p>
        )}
      </div>
    )
  }

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
        title={title}
      >
        {label}
      </button>
      {showHint && hint && (
        <p
          className="text-[10px] text-amber-700 bg-amber-50 rounded px-2 py-1 leading-tight max-w-[220px] truncate"
          title={hint}
        >
          {hint}
        </p>
      )}
    </div>
  )
}
