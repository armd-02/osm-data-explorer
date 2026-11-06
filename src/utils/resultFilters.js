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
 *   - purposeFilter: 目的名（その目的に属するカテゴリのいずれかに一致するものだけ）
 *   - websiteOnly:  公式サイトが登録されているものだけ
 *   - missingFilter: 主要属性の欠落で絞り込み（none | any | phone | opening_hours | website | address）(B2)
 *   - sortDir:      施設名で並び替え（none | asc | desc）
 *
 * (#44) catFilter / purposeFilter は検索フォームのカテゴリ・目的選択のミラー
 * として reducer（appReducer.js）が同期する。カテゴリが設定されている間は
 * purposeFilter は空になる（カテゴリ > 目的 の優先度）。
 */
import { categoryMatchesElement } from './categoryMatch'
import { facilityName } from './facilityLabels'
import { getCategoriesForPurpose } from '../data/categories'
import { missingAttributesOf } from './statistics'

/**
 * アクティブなフィルタが1つでも存在するか
 */
export function hasActiveFilters(filters) {
  const f = filters || {}
  return !!(
    (f.nameFilter || '').trim() ||
    (f.typeFilter && f.typeFilter !== 'all') ||
    (f.catFilter || '') ||
    (f.purposeFilter || '') ||
    f.websiteOnly ||
    (f.missingFilter && f.missingFilter !== 'none') ||
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

  if (f.purposeFilter) {
    // 目的スコープ: その目的グループのカテゴリのいずれかに一致すれば残す（OR union）
    const cats = getCategoriesForPurpose(f.purposeFilter) || []
    if (cats.length > 0) {
      out = out.filter((r) => cats.some((c) => categoryMatchesElement(c.id, r)))
    }
  }

  if (f.websiteOnly) {
    out = out.filter((r) => !!(r.tags?.['website'] || r.tags?.['official_website']))
  }

  // (B2) 主要属性が欠落している施設だけを表示
  if (f.missingFilter && f.missingFilter !== 'none') {
    out = out.filter((r) => {
      const missing = missingAttributesOf(r)
      if (f.missingFilter === 'any') return missing.length > 0
      return missing.includes(f.missingFilter)
    })
  }

  if (f.sortDir === 'asc' || f.sortDir === 'desc') {
    out = [...out].sort((a, b) => {
      const cmp = facilityName(a).localeCompare(facilityName(b), 'ja')
      return f.sortDir === 'asc' ? cmp : -cmp
    })
  }

  return out
}
