/**
 * (#44 生活者目線UI) 検索結果の表示フィルタ共通ユーティリティ
 *
 * PCの一覧（ResultsPanel）とモバイルの一覧タブ（MobileListTab）が同じ
 * フィルタ定義・同じロジックを共有する。ExportBar はこの関数で
 * 「表示中」の結果集合を求め、エクスポート対象（表示中 N / 全部 M）を
 * 明示する（「検索と出力の一致」要件 #44）。
 *
 * フィルタ状態は App.jsx の reducer state.resultFilters に置き、
 * { nameFilter, typeFilter, catFilter, websiteOnly, sortDir } を持つ。
 *   - nameFilter:   施設名の部分一致（name / name:ja、大文字小文字無視）
 *   - typeFilter:   OSM要素種別（all | node | way | relation）
 *   - catFilter:    施設カテゴリID（categoryMatchesElement で判定）
 *   - websiteOnly:  公式サイトが登録されているものだけ
 *   - sortDir:      施設名で並び替え（none | asc | desc）
 */
import { categoryMatchesElement } from './categoryMatch'
import { facilityName } from './facilityLabels'

/**
 * アクティブなフィルタが1つでも存在するか
 */
export function hasActiveFilters(filters) {
  const f = filters || {}
  return !!(
    (f.nameFilter || '').trim() ||
    (f.typeFilter && f.typeFilter !== 'all') ||
    (f.catFilter || '') ||
    f.websiteOnly ||
    (f.sortDir && f.sortDir !== 'none')
  )
}

/**
 * 表示フィルタを適用した結果配列を返す（新しい配列を返す。元は変更しない）
 * @param {Array} results - Overpass result 配列
 * @param {object} filters - 上記のフィルタ状態
 * @returns {Array} フィルタ＆ソート後の配列
 */
export function applyResultFilters(results, filters) {
  const f = filters || {}
  let out = results || []

  const name = (f.nameFilter || '').trim().toLowerCase()
  if (name) {
    out = out.filter((r) => {
      const n = `${r.name || ''} ${r.tags?.['name:ja'] || ''}`.toLowerCase()
      return n.includes(name)
    })
  }

  if (f.typeFilter && f.typeFilter !== 'all') {
    out = out.filter((r) => r.type === f.typeFilter)
  }

  if (f.catFilter) {
    out = out.filter((r) => categoryMatchesElement(f.catFilter, r))
  }

  if (f.websiteOnly) {
    out = out.filter((r) => !!(r.tags?.['website'] || r.tags?.['official_website']))
  }

  if (f.sortDir === 'asc' || f.sortDir === 'desc') {
    out = [...out].sort((a, b) => {
      const cmp = facilityName(a).localeCompare(facilityName(b), 'ja')
      return f.sortDir === 'asc' ? cmp : -cmp
    })
  }

  return out
}
