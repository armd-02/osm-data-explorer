import { getCategoryById } from '../data/categories'

/**
 * (#59) カテゴリ一致のクライアント側判定（モバイル一覧の絞り込み用）
 *
 * Overpass クエリ（categoryToQueryFilter）と同一のセマンティクスを使う:
 *  - logic 'or' : どのタグでも key=value が1つ以上一致すれば true
 *  - logic 'and': 全てのタグが key=value で一致してはじめて true
 */
export function categoryMatchesElement(categoryId, element) {
  if (!categoryId) return false
  const cat = getCategoryById(categoryId)
  if (!cat || !Array.isArray(cat.tags)) return false
  const tags = (element && element.tags) || {}
  const matches = ({ key, values }) =>
    Array.isArray(values) ? values.includes(tags[key]) : tags[key] === values
  return cat.logic === 'and' ? cat.tags.every(matches) : cat.tags.some(matches)
}
