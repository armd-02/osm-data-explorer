import React, { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { getGroupedCategories } from '../../data/categories'
import { applyResultFilters, hasActiveFilters } from '../../utils/resultFilters'
import { countCategoriesInResults, filterGroupsByCounts } from '../../utils/resultCategories'
import { activeSearchOf } from '../../state/appReducer'
import EditPanel from '../EditPanel'
import ExportBar from '../ExportBar'
import MobileFacilityCard from './MobileFacilityCard'
import MobileResultsMap from './MobileResultsMap'
import BarrierFreeLegend from '../BarrierFreeLegend'
import AttributeCompleteness from '../AttributeCompleteness'
import { ATTRIBUTE_LABELS } from '../../utils/statistics'
import { barrierFreeTypeLabel, tactileStatus, lengthLabel, signalLabels } from '../../utils/barrierFreeResults'
import { barrierFreeLabel } from '../../utils/barrierFree'
import { buildIdElementUrl } from '../../utils/editLinks'

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

  // (#62) バリアフリー検索の結果: 施設カード（詳細シート導線）ではなく、
  // タイプ・点字ブロック・長さ・案内信号を出す専用カードで表示する
  if (state.resultKind === 'barrier_free') {
    return <BarrierFreeMobileList />
  }

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
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-3">
        {status === 'idle' && (
          <p className="text-sm text-slate-500 text-center pt-8">
            検索を実行すると、結果がこの一覧に表示されます。
          </p>
        )}

        {status === 'success' && (results || []).length === 0 && <EditPanel />}

        {hasResults && (
          <>
            {/* (修正) 検索結果マップ: 折りたたみ式（初期は折りたたみ・非表示）。
                見出しボタン「地図を表示／地図を隠す」で開閉する */}
            <CollapsiblePoiMap />

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
      </div>

      {/* 保存ボタン（スロールームの外に固定 — 検索タブの検索ボタンと同じ配置） */}
      {hasResults && (
        <div className="shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <ExportBar variant="stacked" />
        </div>
      )}
    </div>
  )
}

/**
 * (修正) 折りたたみ式の検索結果マップ（POI）
 *
 * 初期状態は折りたたみ（地図非表示）。見出しボタン「地図を表示／地図を隠す」で
 * 開閉する。折りたたんでいる間は MobileResultsMap をマウントしない（地図を
 * 生成しない）。展開すると地図が新規マウントされ、結果範囲にfitBoundsされる。
 *
 * 折りたたみ状態はこの子コンポーネントのローカルstateに置く。MobileListTab 本体の
 * フック構成（早期returnとuseMemoの順序）を変えずに済むため、resultKind の
 * poi⇄barrier_free 切替によるフック数の変化で React がエラーを出すのを避ける。
 */
function CollapsiblePoiMap() {
  const [visible, setVisible] = useState(false)
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-expanded={visible}
        className="w-full min-h-[44px] px-3 py-2 flex items-center justify-between text-sm font-medium text-slate-700"
      >
        <span>🗺️ 検索結果マップ</span>
        <span className="text-xs text-slate-500">{visible ? '地図を隠す' : '地図を表示'}</span>
      </button>
      {visible && <MobileResultsMap kind="poi" />}
    </div>
  )
}

/**
 * (#62) バリアフリー検索の結果一覧（モバイル）
 *
 * 対象要素: 歩道・歩行者用通路（way）/ 縁石・音声案内信号・振動案内信号（node）。
 * 名称は name タグがなければ barrierFreeLabel（タグから生成した表示名）を表示する。
 * フィルタは名称・要素種別のみに絞る（カテゴリ・Webサイト・属性欠落は対象外）。
 */
function BarrierFreeMobileList() {
  const { state, dispatch } = useApp()
  const { results, status, resultFilters } = state

  // バリアフリー要素には意味のないフィルタ（Webサイト・属性欠落）は適用しない
  const bfFilters = { ...resultFilters, websiteOnly: false, missingFilter: 'none' }
  const filtered = useMemo(
    () => applyResultFilters(results || [], bfFilters),
    [results, resultFilters]
  )

  const setFilters = (patch) => dispatch({ type: 'SET_RESULT_FILTERS', payload: patch })
  // バリアフリー検索ではフォームのカテゴリ（barrier_free）は検索条件そのものなので、
  // リセットは表示フィルタのみに限る
  const resetFilters = () => {
    setFilters({ nameFilter: '', typeFilter: 'all', sortDir: 'none' })
  }

  const hasResults = status === 'success' && (results || []).length > 0
  const visible = filtered.slice(0, MAX_CARDS)
  const narrowing = filtered.length < (results || []).length

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-3">
        {status === 'idle' && (
          <p className="text-sm text-slate-500 text-center pt-8">
            検索を実行すると、結果がこの一覧に表示されます。
          </p>
        )}

        {status === 'success' && (results || []).length === 0 && (
          <div className="bg-white border border-dashed border-slate-200 rounded-xl p-4 text-center space-y-1">
            <p className="text-sm text-slate-500">この地域ではバリアフリー関連の登録がありません。</p>
            <p className="text-xs text-slate-400">iDエディタで点字ブロック・音声案内などを追加できます。</p>
          </div>
        )}

        {hasResults && (
          <>
            {/* (修正) 検索結果マップ: バリアフリー要素を線・点として表示 */}
            <MobileResultsMap kind="barrier_free" />
            <BarrierFreeLegend />

            <p className="text-xs text-slate-600">
              {(results || []).length.toLocaleString()}件中、{filtered.length.toLocaleString()}件を表示
              {narrowing ? '（フィルタ適用中）' : ''}
            </p>

            {/* フィルタバー */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
              <input
                type="text"
                value={resultFilters.nameFilter}
                onChange={(e) => setFilters({ nameFilter: e.target.value })}
                placeholder="名称で絞り込む（任意）"
                aria-label="名称で絞り込む"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <div className="flex gap-2">
                <select
                  value={resultFilters.typeFilter}
                  onChange={(e) => setFilters({ typeFilter: e.target.value })}
                  aria-label="要素種別で絞り込む"
                  className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="all">タイプ: すべて</option>
                  <option value="way">線 (way)</option>
                  <option value="node">点 (node)</option>
                </select>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="shrink-0 min-h-[44px] px-3 text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg"
                >
                  リセット
                </button>
              </div>
              <p className="text-xs text-slate-400">
                OpenStreetMapに登録済みのデータのみ。点字ブロックは登録情報（tactile_paving）を表示します。
              </p>
            </div>
          </>
        )}

        {hasResults && filtered.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center space-y-2">
            <p className="text-sm text-amber-800">現在の絞り込み条件に一致する要素はありません。</p>
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
            <BarrierFreeCard key={`${r.type}/${r.id}`} result={r} />
          ))}
        </div>

        {filtered.length > MAX_CARDS && (
          <p className="text-xs text-slate-500 text-center">
            最初の{MAX_CARDS.toLocaleString()}件を表示しています（全{filtered.length.toLocaleString()}件）。
            絞り込みで対象を減らすと、ほかの要素を表示できます。
          </p>
        )}
      </div>

      {/* 保存ボタン（スロールームの外に固定 — 検索タブの検索ボタンと同じ配置） */}
      {hasResults && (
        <div className="shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <ExportBar variant="stacked" />
        </div>
      )}
    </div>
  )
}

/** (#62) バリアフリー要素のカード（モバイル） */
function BarrierFreeCard({ result }) {
  const named = !!result.name
  const tactile = tactileStatus(result)
  const length = lengthLabel(result)
  const signals = signalLabels(result)
  const kind = result.bf?.kind

  // 名称が無い場合、タイプ・点字ブロック・案内情報は表示名（barrierFreeLabel）に
  // 含まれるため、重複を避けて該当バッジを省略する（#62 仕様4）
  const showTypeBadge = named
  const showTactile = tactile != null && (named || kind !== 'way')
  const showSignals = named && signals.length > 0
  const hasBadges = showTypeBadge || showTactile || length != null || showSignals

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        {showTypeBadge && (
          <span className="inline-flex items-center rounded-full bg-sky-50 text-sky-700 px-2 py-0.5 text-xs shrink-0">
            {barrierFreeTypeLabel(result)}
          </span>
        )}
        <span className="text-sm font-medium text-slate-800 truncate">
          {named ? result.name : barrierFreeLabel(result)}
        </span>
      </div>

      {hasBadges && (
        <div className="flex flex-wrap gap-1.5">
          {showTactile && tactile === '有' && (
            <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs">点字ブロック 有</span>
          )}
          {showTactile && tactile === '無' && (
            <span className="inline-flex items-center rounded-full bg-rose-50 text-rose-600 px-2 py-0.5 text-xs">点字ブロック 無</span>
          )}
          {length && (
            <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-xs">{length}</span>
          )}
          {showSignals && signals.map((s) => (
            <span key={s} className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-xs">{s}案内</span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="font-mono">{result.osmId}</span>
        <a
          href={buildIdElementUrl(result)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-600 flex items-center gap-1"
        >
          ✏️ iDで編集
        </a>
      </div>
    </div>
  )
}
