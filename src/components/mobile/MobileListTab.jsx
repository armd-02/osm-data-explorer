import React, { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { getGroupedCategories } from '../../data/categories'
import { categoryMatchesElement } from '../../utils/categoryMatch'
import EditPanel from '../EditPanel'
import ExportBar from '../ExportBar'
import MobileFacilityCard, { facilityName } from './MobileFacilityCard'

/**
 * (#59) モバイル「一覧」タブ
 *
 * - 結果をカード形式で表示（タップで施設詳細ボトムシート）
 * - クライアント側フィルタ: 施設名 / カテゴリ / Webサイト有無 / 並び順
 * - フィルタは AppContext（resultFilters）に保存するため、
 *   タブを離れても選択が保持される
 * - 検索0件時は専用のガイダンス（EditPanel）を表示
 * - CSV/GeoJSON 出力はモバイルでも利用可能（ExportBar）
 */

const MAX_CARDS = 500
const GROUPS = getGroupedCategories()

export default function MobileListTab({ onOpenDetail }) {
  const { state, dispatch } = useApp()
  const { results, status, resultFilters } = state
  const { nameFilter, catFilter, websiteOnly, sortDir } = resultFilters

  const setFilters = (patch) => dispatch({ type: 'SET_RESULT_FILTERS', payload: patch })

  const filtered = useMemo(() => {
    let list = results || []
    if (nameFilter) {
      const q = nameFilter.trim().toLowerCase()
      list = list.filter(
        (r) =>
          ((r.name || '').toLowerCase().includes(q)) ||
          (((r.tags && r.tags['name:ja']) || '').toLowerCase().includes(q))
      )
    }
    if (catFilter) list = list.filter((r) => categoryMatchesElement(catFilter, r))
    if (websiteOnly) {
      list = list.filter((r) => r.tags && (r.tags.website || r.tags.official_website))
    }
    if (sortDir === 'name_asc' || sortDir === 'name_desc') {
      list = [...list].sort((a, b) => facilityName(a).localeCompare(facilityName(b), 'ja'))
      if (sortDir === 'name_desc') list.reverse()
    }
    return list
  }, [results, nameFilter, catFilter, websiteOnly, sortDir])

  const hasResults = status === 'success' && (results || []).length > 0
  const visible = filtered.slice(0, MAX_CARDS)
  const resetFilters = () =>
    setFilters({ nameFilter: '', catFilter: '', websiteOnly: false, sortDir: 'none' })

  return (
    <div className="h-full overflow-y-auto px-3 py-3 space-y-3">
      {status === 'idle' && (
        <p className="text-sm text-slate-500 text-center pt-8">
          検索を実行すると、結果がこの一覧に表示されます。
        </p>
      )}

      {status === 'success' && (results || []).length === 0 && <EditPanel />}

      {hasResults && (
        <>
          <p className="text-xs text-slate-600">
            {(results || []).length.toLocaleString()}件中、{filtered.length.toLocaleString()}件を表示
            {filtered.length !== results.length ? '（フィルタ適用中）' : ''}
          </p>

          {/* フィルタバー */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
            <input
              type="text"
              value={nameFilter}
              onChange={(e) => setFilters({ nameFilter: e.target.value })}
              placeholder="施設名で絞り込む"
              aria-label="施設名で絞り込む"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <div className="flex gap-2">
              <select
                value={catFilter}
                onChange={(e) => setFilters({ catFilter: e.target.value })}
                aria-label="カテゴリで絞り込む"
                className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">カテゴリ: すべて</option>
                {GROUPS.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <select
                value={sortDir}
                onChange={(e) => setFilters({ sortDir: e.target.value })}
                aria-label="並び順"
                className="w-36 shrink-0 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="none">並び順</option>
                <option value="name_asc">名前あ行順</option>
                <option value="name_desc">名前逆順</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 min-h-[24px]">
              <input
                type="checkbox"
                checked={websiteOnly}
                onChange={(e) => setFilters({ websiteOnly: e.target.checked })}
                className="w-4 h-4"
              />
              Webサイトがあるものだけ
            </label>
          </div>
        </>
      )}

      {hasResults && filtered.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center space-y-2">
          <p className="text-sm text-amber-800">
            現在の絞り込み条件に一致する施設はありません。
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="min-h-[44px] px-4 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg"
          >
            フィルタをリセット
          </button>
        </div>
      )}

      <div className="space-y-2">
        {visible.map((r) => (
          <MobileFacilityCard
            key={`${r.type}/${r.id}`}
            result={r}
            onOpen={(res) => onOpenDetail && onOpenDetail(res, 'list')}
          />
        ))}
      </div>

      {filtered.length > MAX_CARDS && (
        <p className="text-xs text-slate-500 text-center">
          最初の{MAX_CARDS.toLocaleString()}件を表示しています（全{filtered.length.toLocaleString()}件）。
          絞り込みで対象を減らすと、ほかの施設を表示できます。
        </p>
      )}

      {hasResults && <ExportBar />}
    </div>
  )
}
