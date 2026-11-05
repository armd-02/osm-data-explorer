import React from 'react'

/**
 * (#59/#60) モバイル下部ナビゲーション（3タブ）
 *
 * - 検索 / 一覧 / その他
 *   （地図は独立タブではなく検索タブ内に内蔵 #60）
 * - タップ領域は 44px 以上（min-h 56px）
 * - ホームインジケータ領域は safe-area-inset-bottom で確保
 * - 非活性タブのコンポーネントはアンマウントしない（hidden）ため、
 *   検索条件・フィルタ状態はタブ切替をまたいで保持される
 */

const ICONS = {
  search: (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" strokeLinecap="round" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
    </svg>
  ),
  other: (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  ),
}

export const MOBILE_TABS = [
  { id: 'search', label: '検索' },
  { id: 'list', label: '一覧' },
  { id: 'other', label: 'その他' },
]

export default function MobileBottomNav({ active, onSelect }) {
  return (
    <nav
      aria-label="モバイルナビゲーション"
      className="shrink-0 bg-white/95 backdrop-blur border-t border-slate-200 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-3">
        {MOBILE_TABS.map((tab) => {
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`min-h-[56px] flex flex-col items-center justify-center gap-0.5 text-[11px] leading-none transition-colors ${
                isActive ? 'text-primary-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {ICONS[tab.id]}
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
