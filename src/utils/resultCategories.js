/**
 * (#44) Overpass取得結果に基づくカテゴリ集計
 *
 * 検索結果（Overpassから取得した要素）に実際に存在するカテゴリを、
 * categoryMatchesElement の判定で集計する。一覧パネルのカテゴリ絞り込み
 * ドロップダウンは、この集計結果をもとに「データに存在するカテゴリだけ」を
 * 件数付きで表示する（存在しないカテゴリを選ぶと空結果になるため非表示）。
 */
import { CATEGORIES } from '../data/categories'
import { categoryMatchesElement } from './categoryMatch'

/**
 * 結果配列ごとにカテゴリID別の一致数を集計する。
 * @param {Array<object>} results Overpass正規化済みの要素
 * @returns {Object<string, number>} { [categoryId]: 一致数 }（0件のカテゴリは含まれない）
 */
export function countCategoriesInResults(results) {
  const counts = {}
  if (!Array.isArray(results) || results.length === 0) return counts
  for (const r of results) {
    if (!r || !r.tags) continue
    for (const c of CATEGORIES) {
      if (categoryMatchesElement(c.id, r)) {
        counts[c.id] = (counts[c.id] || 0) + 1
      }
    }
  }
  return counts
}

/**
 * getGroupedCategories() の結果を、集計で出現したカテゴリに絞り込む。
 * - 出現したカテゴリには count を付与して返す
 * - 選択中カテゴリ（selectedId）は count が 0 でも必ず残す
 *   （選択値が <select> の選択肢に存在しない状態を防ぐため）
 * - カテゴリが1つも残らないグループは除外する
 * @param {Array<{ group: string, categories: Array<object> }>} groups
 * @param {Object<string, number>} counts
 * @param {string} selectedId 現在選択中のカテゴリID（'' の場合はなし）
 */
export function filterGroupsByCounts(groups, counts, selectedId = '') {
  return (groups || [])
    .map((g) => ({
      ...g,
      categories: g.categories
        .filter((c) => (counts[c.id] || 0) > 0 || c.id === selectedId)
        .map((c) => ({ ...c, count: counts[c.id] || 0 }))
    }))
    .filter((g) => g.categories.length > 0)
}
