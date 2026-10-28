import React, { useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { getGroupedCategories } from '../data/categories'
import { applyResultFilters, hasActiveFilters } from '../utils/resultFilters'
import { facilityName, facilityTypeLabel, formatAddress, safeWebsite } from '../utils/facilityLabels'

/**
 * 検索結果一覧（PC）
 * (#44) 表示フィルタは state.resultFilters（App reducer）に置き、
 * モバイル一覧タブ・ExportBar と同じロジック（resultFilters.js）を共有する。
 * 施設タイプは日本語ラベル（facilityTypeLabel）で表示し、
 * 住所・電話・公式サイトを追加列として出す。
 */
const DEFAULT_FILTERS = { nameFilter: '', typeFilter: 'all', catFilter: '', websiteOnly: false, sortDir: 'none' }

function ResultsPanel() {
  const { state, dispatch } = useApp()
  const { results, resultFilters, fetchMeta, searchSource, selectedMunicipality } = state

  const update = (patch) => dispatch({ type: 'SET_RESULT_FILTERS', payload: patch })
  const clear = () => dispatch({ type: 'SET_RESULT_FILTERS', payload: { ...DEFAULT_FILTERS } })
  const active = hasActiveFilters(resultFilters)
  const displayResults = useMemo(
    () => applyResultFilters(results, resultFilters),
    [results, resultFilters]
  )

  const grouped = useMemo(() => getGroupedCategories(), [])
  const fmt = (n) => n.toLocaleString('ja-JP')

  return (
    <aside className="bg-white rounded-lg border border-slate-200 flex flex-col flex-1 min-w-0">
      <div className="p-4 border-b border-slate-200">
        <div className="text-sm text-slate-600">
          {active
            ? <>全 <strong className="text-primary-600">{fmt(results.length)}</strong> 件中、<strong className="text-primary-600">{fmt(displayResults.length)}</strong> 件を表示中</>
            : <>全 <strong className="text-primary-600">{fmt(results.length)}</strong> 件が見つかりました</>}
          {searchSource === 'municipality' && selectedMunicipality?.name && (
            <span className="ml-2 text-xs text-slate-500">（{selectedMunicipality.name} とその周辺）</span>
          )}
          {fetchMeta && (
            <div className="mt-1 text-xs text-slate-500">取得: {Math.round(fetchMeta.elapsedMs)}ms</div>
          )}
        </div>

        {active && (
          <div className="mt-1 text-xs text-amber-600">
            表示は絞り込み済みです。CSV / GeoJSON のエクスポートは「表示中」か「すべて」から選べます。
          </div>
        )}

        <div className="mt-3 space-y-2">
          <input
            value={resultFilters.nameFilter}
            onChange={(e) => update({ nameFilter: e.target.value })}
            placeholder="名称で絞る（例: 珈琲）"
            className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <div className="grid grid-cols-3 gap-2">
            <select
              value={resultFilters.typeFilter}
              onChange={(e) => update({ typeFilter: e.target.value })}
              className="px-2 py-1.5 text-sm border border-slate-300 rounded-md bg-white"
              aria-label="要素種別で絞る"
            >
              <option value="all">すべて</option>
              <option value="node">点 (node)</option>
              <option value="way">線面 (way)</option>
              <option value="relation">relation</option>
            </select>
            <select
              value={resultFilters.catFilter}
              onChange={(e) => update({ catFilter: e.target.value })}
              className="px-2 py-1.5 text-sm border border-slate-300 rounded-md bg-white"
              aria-label="施設の種類で絞る"
            >
              <option value="">すべての種類</option>
              {grouped.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select
              value={resultFilters.sortDir}
              onChange={(e) => update({ sortDir: e.target.value })}
              className="px-2 py-1.5 text-sm border border-slate-300 rounded-md bg-white"
              aria-label="並び替え"
            >
              <option value="none">並び順: 標準</option>
              <option value="asc">名称あ-ほ</option>
              <option value="desc">名称ほ-あ</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={resultFilters.websiteOnly}
                onChange={(e) => update({ websiteOnly: e.target.checked })}
              />
              公式サイトがあるものだけ
            </label>
            <button onClick={clear} className="text-xs text-slate-500 hover:text-primary-600">クリア</button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">施設名</th>
              <th className="px-2 py-2 text-left">タイプ</th>
              <th className="px-2 py-2 text-left">住所</th>
              <th className="px-2 py-2 text-left">電話</th>
              <th className="px-2 py-2 text-left">公式サイト</th>
            </tr>
          </thead>
          <tbody>
            {displayResults.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                  {active
                    ? '条件に一致する施設はありません。フィルタを緩めてみてください。'
                    : '結果がありません。条件を変更して再検索してください。'}
                </td>
              </tr>
            ) : displayResults.map((r, i) => {
              const website = safeWebsite(r.tags)
              return (
                <tr
                  key={`${r.type}-${r.id}`}
                  className="border-b border-slate-100"
                >
                  <td className="px-3 py-2 text-slate-400 text-xs">{i + 1}</td>
                  <td className="px-2 py-2 font-medium text-slate-800">{facilityName(r)}</td>
                  <td className="px-2 py-2 text-slate-600 whitespace-nowrap">{facilityTypeLabel(r)}</td>
                  <td className="px-2 py-2 text-slate-500">
                    {formatAddress(r.tags) || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-2 py-2 text-slate-600 whitespace-nowrap">
                    {r.tags?.phone || r.tags?.['contact:phone'] || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-2 py-2">
                    {website ? (
                      <a
                        href={website}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary-600 hover:underline text-xs"
                      >開く</a>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </aside>
  )
}

export default ResultsPanel
