import React, { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { getGroupedCategories } from '../../data/categories'
import { applyResultFilters, hasActiveFilters } from '../../utils/resultFilters'
import { countCategoriesInResults, filterGroupsByCounts } from '../../utils/resultCategories'
import { activeSearchOf } from '../../state/appReducer'
import EditPanel from '../EditPanel'
import ExportBar from '../ExportBar'
import MobileFacilityCard from './MobileFacilityCard'
import AttributeCompleteness from '../AttributeCompleteness'
import { ATTRIBUTE_LABELS } from '../../utils/statistics'

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
  const { results, status, resultFilters, searchSource } = state
  const { nameFilter, websiteOnly, sortDir } = resultFilters

  // (#44) カテゴリ選択は検索フォームと一覧フィルタを同じ値として扱う。
  // ドロップダウンの操作は検索フォームのcategoryにdispatchし、
  // reducerが resultFilters.catFilter をミラーする（データ取得後なら即絞り込み）。
  const activeSearch = activeSearchOf(state) || {}
  const searchFormType = searchSource === 'municipality' ? 'SET_MUNICIPALITY_SEARCH' : 'SET_SIMPLE_SEARCH'
  const changeCategory = (value) => dispatch({ type: searchFormType, payload: { category: value } })

  const setFilters = (patch) => dispatch({ type: 'SET_RESULT_FILTERS', payload: patch })

  // (#44) PCのResultsPanelと共通のフィルタロジック（resultFilters.js）を使う
  const filtered = useMemo(
    () => applyResultFilters(results, resultFilters),
    [results, resultFilters]
  )
  const filtersActive = hasActiveFilters(resultFilters)
  // 「フィルタ適用中」マーカーはフィルタが実際に件数を減らしているときだけ出す
  // （検索時にカテゴリを選択済みの場合は結果が既に絞り込まれているため不要）
  const narrowing = filtersActive && filtered.length < (results || []).length

  // (#44) カテゴリの選択肢はOverpass取得データに基づいて絞り込む:
  // 結果に実際に出現したカテゴリのみを、件数付きで表示する。
  const catCounts = useMemo(() => countCategoriesInResults(results), [results])
  const hasData = (results || []).length > 0
  const filterGroups = useMemo(
    () => (hasData ? filterGroupsByCounts(GROUPS, catCounts, activeSearch.category || '') : GROUPS),
    [hasData, catCounts, activeSearch.category]
  )

  const hasResults = status === 'success' && (results || []).length > 0
  const visible = filtered.slice(0, MAX_CARDS)
  const resetFilters = () => {
    // 検索フォームのカテゴリ・目的選択も一緒に解除する（状態の整合性）
    dispatch({ type: searchFormType, payload: { category: '', purpose: '' } })
    setFilters({ nameFilter: '', typeFilter: 'all', catFilter: '', purposeFilter: '', websiteOnly: false, sortDir: 'none', missingFilter: 'none' })
  }

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
            {narrowing ? '（フィルタ適用中）' : ''}
          </p>

          {/* (B1) 属性の充足率: 表示中結果を追従 */}
          <AttributeCompleteness results={filtered} className="my-1" />

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
                value={activeSearch.category || ''}
                onChange={(e) => changeCategory(e.target.value)}
                aria-label="カテゴリで絞り込む"
                className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">{hasData ? `カテゴリ: すべて（${(results || []).length.toLocaleString('ja-JP')}件）` : 'カテゴリ: すべて'}</option>
                {filterGroups.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {hasData ? `${c.label}（${c.count.toLocaleString('ja-JP')}件）` : c.label}
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
                <option value="asc">名前あ行順</option>
                <option value="desc">名前逆順</option>
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
            {/* (B2) 主要属性の欠落で絞り込む */}
            <select
              value={resultFilters.missingFilter || 'none'}
              onChange={(e) => setFilters({ missingFilter: e.target.value })}
              aria-label="属性の欠落で絞る"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="none">未登録の絞り込み: なし</option>
              <option value="any">いずれかの属性が未登録</option>
              <option value="phone">電話が未登録</option>
              <option value="opening_hours">営業時間が未登録</option>
              <option value="website">Webサイトが未登録</option>
              <option value="address">住所が未登録</option>
            </select>
          </div>
        </>
      )}

      {hasResults && filtered.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center space-y-2">
          <p className="text-sm text-amber-800">
            {/* (A4) 未登録絞り込みで0件は「失敗」ではなく「充実」の好機として伝える */}
            {(resultFilters.missingFilter || 'none') !== 'none'
              ? 'この地域では、該当する未登録施設はありません — 主要属性が充実しています。'
              : '現在の絞り込み条件に一致する施設はありません。'}
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
            showMissing={(resultFilters.missingFilter || 'none') !== 'none'}
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
