import React from 'react'

const TOP_BREAKDOWN_ROWS = 6

/**
 * (集計表) カテゴリ別集計テーブル
 *
 * アプリのカテゴリ体系（CATEGORIES の日本語ラベル）で検索結果を集計し、
 * カテゴリごとに brand タグ（無い場合は名称）の内訳を表示する。
 *
 * レイアウトはスマホ幅（360px）でも読めるよう「カテゴリ1件＝カード」の
 * 縦積み型を採用している（広いテーブルにしない）。PCでもそのまま使える。
 */
export default function CategorySummaryTable({ summary = [] }) {
  if (!Array.isArray(summary) || summary.length === 0) {
    return (
      <p className="text-xs text-slate-400 text-center py-4">
        カテゴリに分類できる結果がありません
      </p>
    )
  }

  const total = summary.reduce((sum, c) => sum + c.count, 0)

  return (
    <div className="space-y-2" data-testid="category-summary-table">
      <p className="text-[11px] text-slate-500">
        アプリのカテゴリ体系での集計（1つの施設が複数のカテゴリに属する場合は両方に計上）。
        内訳は brand タグ、brand が無い場合は名称で集計しています。
      </p>
      <div className="space-y-1.5">
        {summary.map((cat) => {
          const pct = total > 0 ? (cat.count / total) * 100 : 0
          const shown = cat.breakdown.slice(0, TOP_BREAKDOWN_ROWS)
          const rest = cat.breakdown.length - shown.length
          return (
            <div key={cat.id} className="bg-white rounded-md border border-slate-200 p-2.5">
              {/* カテゴリ行: アイコン・ラベル・件数 */}
              <div className="flex items-center gap-1.5">
                <span className="text-sm shrink-0" aria-hidden="true">{cat.icon}</span>
                <span className="text-xs font-medium text-slate-700 flex-1 truncate">{cat.label}</span>
                <span className="text-xs font-bold text-slate-800 shrink-0">
                  {cat.count.toLocaleString()}件
                </span>
              </div>
              {/* 割合バー */}
              <div className="h-2 bg-slate-100 rounded overflow-hidden mt-1.5" aria-hidden="true">
                <div className="h-full bg-primary-400 rounded" style={{ width: `${pct}%` }} />
              </div>
              {/* brand/名称 内訳 */}
              {cat.breakdown.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {shown.map((b) => (
                    <div key={b.name} className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-600 flex-1 truncate">{b.name}</span>
                      <span className="text-[10px] text-slate-500 shrink-0">{b.count}</span>
                    </div>
                  ))}
                  {rest > 0 && (
                    <p className="text-[10px] text-slate-400">+ {rest}件</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
