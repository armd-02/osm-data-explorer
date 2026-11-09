import React, { useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { getGroupedCategories } from '../data/categories'
import { applyResultFilters, hasActiveFilters } from '../utils/resultFilters'
import { countCategoriesInResults, filterGroupsByCounts } from '../utils/resultCategories'
import { activeSearchOf } from '../state/appReducer'
import { facilityName, facilityTypeLabel, formatAddress, safeWebsite } from '../utils/facilityLabels'
import { wheelchairBadge } from '../utils/accessibility'
import AttributeCompleteness from './AttributeCompleteness'
import { missingAttributesOf, ATTRIBUTE_LABELS } from '../utils/statistics'
import { buildIdElementUrl } from '../utils/editLinks'
import { keyInfoFor } from '../utils/categoryProfiles'
import { barrierFreeTypeLabel, tactileStatus, lengthLabel, signalLabels } from '../utils/barrierFreeResults'
import { barrierFreeLabel } from '../utils/barrierFree'

/**
 * 検索結果一覧（PC）
 * (#44) 表示フィルタは state.resultFilters（App reducer）に置き、
 * モバイル一覧タブ・ExportBar と同じロジック（resultFilters.js）を共有する。
 * 施設タイプは日本語ラベル（facilityTypeLabel）で表示し、
 * 住所・電話・公式サイトを追加列として出す。
 */
const DEFAULT_FILTERS = { nameFilter: '', typeFilter: 'all', catFilter: '', purposeFilter: '', websiteOnly: false, sortDir: 'none', missingFilter: 'none' }

function ResultsPanel() {
  const { state, dispatch } = useApp()

  // (#62) バリアフリー検索の結果: 施設向けの列（住所・電話・バリアフリー属性）が
  // 意味を持たないため、タイプ・点字ブロック・長さ・案内信号の専用一覧を表示する
  if (state.resultKind === 'barrier_free') {
    return <BarrierFreeResultsList />
  }

  const { results, resultFilters, fetchMeta, searchSource, selectedMunicipality } = state

  // (#44) カテゴリ選択は検索フォームと一覧フィルタを同じ値として扱う。
  // ドロップダウンの操作は検索フォームのcategoryにdispatchし、
  // reducerが resultFilters.catFilter をミラーする（データ取得後なら即絞り込み）。
  const activeSearch = activeSearchOf(state) || {}
  const searchFormType = searchSource === 'municipality' ? 'SET_MUNICIPALITY_SEARCH' : 'SET_SIMPLE_SEARCH'

  const update = (patch) => dispatch({ type: 'SET_RESULT_FILTERS', payload: patch })
  const changeCategory = (value) => dispatch({ type: searchFormType, payload: { category: value } })
  const clear = () => {
    dispatch({ type: searchFormType, payload: { category: '', purpose: '' } })
    dispatch({ type: 'SET_RESULT_FILTERS', payload: { ...DEFAULT_FILTERS } })
  }
  const active = hasActiveFilters(resultFilters)
  const displayResults = useMemo(
    () => applyResultFilters(results, resultFilters),
    [results, resultFilters]
  )
  // 「絞り込み済み」表示はフィルタが実際に件数を減らしているときだけ出す
  const narrowing = active && displayResults.length < (results || []).length

  const grouped = useMemo(() => getGroupedCategories(), [])
  const fmt = (n) => n.toLocaleString('ja-JP')

  // (#44) カテゴリの選択肢はOverpass取得データに基づいて絞り込む:
  // 結果に実際に出現したカテゴリのみを、件数付きで表示する。
  const catCounts = useMemo(() => countCategoriesInResults(results), [results])
  const hasData = Array.isArray(results) && results.length > 0
  const filterGroups = useMemo(
    () => (hasData ? filterGroupsByCounts(grouped, catCounts, activeSearch.category || '') : grouped),
    [hasData, grouped, catCounts, activeSearch.category]
  )

  return (
    <aside className="bg-white rounded-lg border border-slate-200 flex flex-col max-h-[640px] min-w-0">
      <div className="p-4 border-b border-slate-200">
        <div className="text-sm text-slate-600">
          {narrowing
            ? <>全 <strong className="text-primary-600">{fmt(results.length)}</strong> 件中、<strong className="text-primary-600">{fmt(displayResults.length)}</strong> 件を表示中</>
            : <>全 <strong className="text-primary-600">{fmt(results.length)}</strong> 件が見つかりました</>}
          {searchSource === 'municipality' && selectedMunicipality?.name && (
            <span className="ml-2 text-xs text-slate-500">（{selectedMunicipality.name} とその周辺）</span>
          )}
          {fetchMeta && (
            <div className="mt-1 text-xs text-slate-500">取得: {Math.round(fetchMeta.elapsedMs)}ms</div>
          )}
          {/* (B2) 欠落フィルタアクティブ時の案内 */}
          {resultFilters.missingFilter && resultFilters.missingFilter !== 'none' && displayResults.length > 0 && (
            <div className="mt-1 text-xs text-amber-600">
              主要属性が未登録の施設を優先表示中（{resultFilters.missingFilter === 'any' ? 'いずれかの属性' : ATTRIBUTE_LABELS[resultFilters.missingFilter] + 'の欠落'}）
            </div>
          )}
        </div>

        {/* (B1) 属性の充足率: 表示中結果（自治体×カテゴリ / 地図検索+絞り込み）を追従 */}
        {displayResults.length > 0 && (
          <div className="mt-1.5">
            <AttributeCompleteness results={displayResults} />
          </div>
        )}

        {narrowing && (
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
              value={activeSearch.category || ''}
              onChange={(e) => changeCategory(e.target.value)}
              className="px-2 py-1.5 text-sm border border-slate-300 rounded-md bg-white"
              aria-label="施設の種類で絞る"
            >
              <option value="">{hasData ? `すべての種類（${fmt(results.length)}件）` : 'すべての種類'}</option>
              {filterGroups.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {hasData ? `${c.label}（${fmt(c.count)}件）` : c.label}
                    </option>
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
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={resultFilters.websiteOnly}
                onChange={(e) => update({ websiteOnly: e.target.checked })}
              />
              公式サイトがあるものだけ
            </label>
            {/* (B2) 主要属性の欠落で絞り込む */}
            <select
              value={resultFilters.missingFilter || 'none'}
              onChange={(e) => update({ missingFilter: e.target.value })}
              className="flex-1 min-w-0 px-2 py-1 text-xs border border-slate-300 rounded-md bg-white"
              aria-label="属性の欠落で絞る"
            >
              <option value="none">未登録の絞り込み: なし</option>
              <option value="any">いずれかの属性が未登録</option>
              <option value="phone">電話が未登録</option>
              <option value="opening_hours">営業時間が未登録</option>
              <option value="website">Webサイトが未登録</option>
              <option value="address">住所が未登録</option>
            </select>
            <button onClick={clear} className="text-xs text-slate-500 hover:text-primary-600 shrink-0">クリア</button>
          </div>
        </div>
      </div>

      {/* 高さ上限640px: 結果が長いと内部スクロールになる（ページ全体が際限なく長くなるのを防ぐ） */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">施設名</th>
              <th className="px-2 py-2 text-left">タイプ</th>
              <th className="px-2 py-2 text-left">住所</th>
              <th className="px-2 py-2 text-left">電話</th>
              <th className="px-2 py-2 text-left">バリアフリー</th>
              <th className="px-2 py-2 text-left">公式サイト</th>
              <th className="px-2 py-2 text-left">編集</th>
            </tr>
          </thead>
          <tbody>
            {displayResults.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                  {/* (A4) 0件は「失敗」ではなく「まだ登録がない」として伝える */}
                  {active && (resultFilters.missingFilter || 'none') !== 'none' && (results || []).length > 0
                    ? 'この地域では、該当する未登録施設はありません — 主要属性が充実しています。'
                    : active
                      ? '条件に一致する施設はありません。フィルタを緩めてみてください。'
                      : 'この地域ではまだ登録がありません。範囲を広げたり、カテゴリやキーワードを変えて再検索するか、iDエディタで追加できます。'}
                </td>
              </tr>
            ) : displayResults.map((r, i) => {
              const website = safeWebsite(r.tags)
              const badge = wheelchairBadge(r.tags)
              return (
                <tr
                  key={`${r.type}-${r.id}`}
                  className="border-b border-slate-100"
                >
                  <td className="px-3 py-2 text-slate-400 text-xs">{i + 1}</td>
                  <td className="px-2 py-2 font-medium text-slate-800">
                    {facilityName(r)}
                    {website && (
                      <a
                        href={website}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="公式サイトを開く"
                        className="ml-1 align-middle"
                      >
                        <span role="img" aria-label="公式サイトがあります">🔗</span>
                      </a>
                    )}
                    {/* (B2) 欠落フィルタアクティブ時: 未登録属性をバッジで表示 */}
                    {(resultFilters.missingFilter || 'none') !== 'none' && (() => {
                      const missing = missingAttributesOf(r)
                      if (missing.length === 0) return null
                      return (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {missing.map((k) => (
                            <span key={k} className="text-[10px] text-red-700 border border-red-200 bg-red-50 rounded-full px-1.5 py-0 whitespace-nowrap">
                              {ATTRIBUTE_LABELS[k]} 未登録
                            </span>
                          ))}
                        </span>
                      )
                    })()}
                    {/* (A3) カテゴリ別ハイライト: そのカテゴリに意味のある属性のみ */}
                    {(() => {
                      const ki = keyInfoFor(r)
                      const extra = ki.items.find((it) => it.key === 'cuisine') ||
                        ki.items.find((it) => it.key === 'wheelchair')
                      if (!extra) return null
                      return (
                        <span className="mt-0.5 block text-[11px] text-slate-500">
                          {ki.icon} {extra.text}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-2 py-2 text-slate-600 whitespace-nowrap">{facilityTypeLabel(r)}</td>
                  <td className="px-2 py-2 text-slate-500">
                    {formatAddress(r.tags) || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-2 py-2 text-slate-600 whitespace-nowrap">
                    {r.tags?.phone || r.tags?.['contact:phone'] || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {badge ? (
                      <span className={`text-xs border rounded-full px-2 py-0.5 ${badge.cls}`}>♿ {badge.text}</span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {website ? (
                      <a
                        href={website}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary-600 hover:underline text-xs"
                        title={website}
                      >
                        <span role="img" aria-label="公式サイト">🔗</span>
                      </a>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  {/* (B3) iD編集導線: 各施設を特定した状態でiDへジャンプ */}
                  <td className="px-2 py-2 whitespace-nowrap">
                    <a
                      href={buildIdElementUrl(r)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-primary-600 hover:underline text-xs"
                      title="iDエディタで編集（OSMアカウント必要）"
                    >
                      ✏️ iD
                    </a>
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

/**
 * (#62) バリアフリー検索の結果一覧（PC）
 *
 * 対象要素: 歩道・歩行者用通路（way）/ 縁石・音声案内信号・振動案内信号（node）。
 * 名称は name タグがなければ barrierFreeLabel（タグから生成した表示名）を表示する。
 * フィルタは名称・要素種別のみに絞る（カテゴリ・公式サイト・属性欠落は対象外）。
 */
function BarrierFreeResultsList() {
  const { state, dispatch } = useApp()
  const { results, resultFilters, fetchMeta, searchSource, selectedMunicipality } = state

  // バリアフリー要素には意味のないフィルタ（公式サイト・属性欠落）は適用しない
  const bfFilters = { ...resultFilters, websiteOnly: false, missingFilter: 'none' }
  const displayResults = useMemo(
    () => applyResultFilters(results || [], bfFilters),
    [results, resultFilters]
  )

  const update = (patch) => dispatch({ type: 'SET_RESULT_FILTERS', payload: patch })
  const clear = () => dispatch({
    type: 'SET_RESULT_FILTERS',
    payload: { nameFilter: '', typeFilter: 'all', sortDir: 'none' }
  })

  const total = (results || []).length
  const hasResults = total > 0
  const narrowing = displayResults.length < total
  const fmt = (n) => (n ?? 0).toLocaleString('ja-JP')

  return (
    <aside className="bg-white rounded-lg border border-slate-200 flex flex-col max-h-[640px] min-w-0">
      <div className="p-4 border-b border-slate-200">
        <div className="text-sm text-slate-600">
          <span className="text-primary-600 font-semibold">
            {narrowing
              ? `全 ${fmt(total)} 件中、${fmt(displayResults.length)} 件を表示中`
              : `全 ${fmt(total)} 件が見つかりました`}
          </span>
          <span className="ml-1 text-xs text-slate-400">（バリアフリー: 歩道・縁石・案内信号）</span>
          {searchSource === 'municipality' && selectedMunicipality?.name && (
            <span className="ml-1 text-xs text-slate-500">（{selectedMunicipality.name} とその周辺）</span>
          )}
        </div>
        {fetchMeta && (
          <div className="mt-1 text-xs text-slate-500">取得: {Math.round(fetchMeta.elapsedMs)}ms</div>
        )}

        <div className="mt-3 flex gap-2">
          <input
            value={resultFilters.nameFilter}
            onChange={(e) => update({ nameFilter: e.target.value })}
            placeholder="名称で絞る（任意）"
            className="flex-1 min-w-0 px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="名称で絞る"
          />
          <select
            value={resultFilters.typeFilter}
            onChange={(e) => update({ typeFilter: e.target.value })}
            className="px-2 py-1.5 text-sm border border-slate-300 rounded-md bg-white"
            aria-label="要素種別で絞る"
          >
            <option value="all">すべて</option>
            <option value="way">線 (way)</option>
            <option value="node">点 (node)</option>
          </select>
          <button onClick={clear} className="text-xs text-slate-500 hover:text-primary-600 shrink-0">クリア</button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          OpenStreetMapに登録済みのデータのみ。点字ブロックは登録情報（tactile_paving）を表示します。
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">タイプ</th>
              <th className="px-2 py-2 text-left">名称</th>
              <th className="px-2 py-2 text-left">点字ブロック</th>
              <th className="px-2 py-2 text-left">長さ</th>
              <th className="px-2 py-2 text-left">案内</th>
              <th className="px-2 py-2 text-left">OSM ID</th>
              <th className="px-2 py-2 text-left">編集</th>
            </tr>
          </thead>
          <tbody>
            {displayResults.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                  {hasResults
                    ? '条件に一致する要素はありません。フィルタを緩めてみてください。'
                    : 'この地域ではバリアフリー関連の登録がありません。iDエディタで追加できます。'}
                </td>
              </tr>
            ) : displayResults.map((r, i) => {
              const tactile = tactileStatus(r)
              const length = lengthLabel(r)
              const signals = signalLabels(r)
              return (
                <tr key={`${r.type}/${r.id}`} className="border-b border-slate-100 align-top">
                  <td className="px-2 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center rounded-full bg-sky-50 text-sky-700 px-2 py-0.5 text-xs">
                      {barrierFreeTypeLabel(r)}
                    </span>
                  </td>
                  <td className="px-2 py-2 font-medium text-slate-800">
                    {r.name || barrierFreeLabel(r)}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">{tactileBadge(tactile)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {length || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {signals.length > 0
                      ? <span className="text-amber-700">{signals.join('・')}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-2 py-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">{r.osmId}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <a
                      href={buildIdElementUrl(r)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:underline"
                      title="iDエディタで編集（OSMアカウント必要）"
                    >
                      ✏️ iD
                    </a>
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

/** 点字ブロック状態のバッジ（有=緑 / 無=赤 / 未登録=—） */
function tactileBadge(status) {
  if (status === '有') {
    return <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs">有</span>
  }
  if (status === '無') {
    return <span className="inline-flex items-center rounded-full bg-rose-50 text-rose-600 px-2 py-0.5 text-xs">無</span>
  }
  return <span className="text-slate-300 text-xs">—</span>
}

export default ResultsPanel
