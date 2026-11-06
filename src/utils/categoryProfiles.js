/**
 * (A3) カテゴリ別情報設計
 *
 * 一覧（PCテーブル・モバイルカード）では、カテゴリごとに「意味のある属性」を
 * 選び、そのカテゴリに相応しい情報のみを表示する。
 *   - 飲食店: 営業時間・料理ジャンル（cuisine）・電話・Web
 *   - 薬局:   電話・営業時間・Webサイト
 *   - 公共施設: 電話・開館時間・バリアフリー（wheelchair）・Web
 *   - 公園:   開園時間・バリアフリー・Web
 *   - 交通:   住所・電話・Web（営業時間は意味がない）
 *   - 公共トイレ: 住所・バリアフリー（電話・Webは意味がない）
 *
 * 原則: OSMに登録されていない値は表示しない（捏造しない）。
 * プロファイルは「表示する属性の候補と順序」を定義するのみ。
 */
import { facilityCategoryId, safeWebsite, formatAddress, facilityTypeLabel } from './facilityLabels'
import { wheelchairBadge } from './accessibility'

/**
 * 属性キー → 表示テキストのレンダラー
 * 未登録（null）は表示対象外。
 */
const ATTR_RENDERERS = {
  address: (tags) => {
    const a = formatAddress(tags)
    return a ? `📍 ${a}` : null
  },
  phone: (tags) => {
    const p = tags.phone || tags['contact:phone']
    return p ? `📞 ${p}` : null
  },
  opening_hours: (tags) => (tags.opening_hours ? `🕐 ${tags.opening_hours}` : null),
  website: (tags) => (safeWebsite(tags) ? '🌐 公式サイト' : null),
  cuisine: (tags) => (tags.cuisine ? `🍴 ${tags.cuisine}` : null),
  wheelchair: (tags) => {
    const b = wheelchairBadge(tags)
    return b ? `♿ ${b.text}` : null
  }
}

/**
 * カテゴリID → 表示プロファイル（アイコン＋意味のある属性の順序）
 * 未定義カテゴリは DEFAULT を使う。
 */
const PROFILES = {
  // 飲食
  cafe:           { icon: '☕', attrs: ['address', 'phone', 'opening_hours', 'cuisine', 'website'] },
  restaurant:     { icon: '🍽️', attrs: ['address', 'phone', 'opening_hours', 'cuisine', 'website'] },
  fast_food:      { icon: '🍔', attrs: ['address', 'phone', 'opening_hours', 'cuisine'] },
  bar_izakaya:    { icon: '🍶', attrs: ['address', 'phone', 'opening_hours', 'website'] },
  food_drink:     { icon: '🍜', attrs: ['address', 'phone', 'opening_hours', 'cuisine', 'website'] },
  // 買い物
  convenience:    { icon: '🏪', attrs: ['address', 'phone', 'opening_hours', 'website'] },
  retail:         { icon: '🛍️', attrs: ['address', 'phone', 'opening_hours', 'website'] },
  pharmacy:       { icon: '💊', attrs: ['address', 'phone', 'opening_hours', 'website'] },
  bank:           { icon: '🏦', attrs: ['address', 'phone', 'opening_hours'] },
  // 暮らし・医療
  hospital:       { icon: '🏥', attrs: ['address', 'phone', 'opening_hours', 'wheelchair'] },
  public_facility:{ icon: '🏛️', attrs: ['address', 'phone', 'opening_hours', 'wheelchair', 'website'] },
  // 教育
  kindergarten:   { icon: '🏫', attrs: ['address', 'phone', 'opening_hours', 'wheelchair'] },
  primary_school: { icon: '🏫', attrs: ['address', 'phone', 'opening_hours', 'wheelchair'] },
  university:     { icon: '🎓', attrs: ['address', 'phone', 'opening_hours', 'wheelchair'] },
  prep_school:    { icon: '📖', attrs: ['address', 'phone', 'opening_hours', 'wheelchair'] },
  school:         { icon: '🏫', attrs: ['address', 'phone', 'opening_hours', 'wheelchair'] },
  // 遊び・文化
  park:           { icon: '🌳', attrs: ['address', 'phone', 'opening_hours', 'wheelchair', 'website'] },
  sports:         { icon: '🏟️', attrs: ['address', 'phone', 'opening_hours', 'wheelchair', 'website'] },
  museum:         { icon: '🖼️', attrs: ['address', 'phone', 'opening_hours', 'wheelchair', 'website'] },
  worship:        { icon: '⛩️', attrs: ['address', 'opening_hours', 'website'] },
  accommodation:  { icon: '🏨', attrs: ['address', 'phone', 'wheelchair', 'website'] },
  // 交通・その他
  transport:      { icon: '🚉', attrs: ['address', 'phone', 'website'] },
  toilets:        { icon: '🚻', attrs: ['address', 'wheelchair'] },
  // フォールバック
  DEFAULT:        { icon: '📍', attrs: ['address', 'phone', 'opening_hours', 'website'] }
}

/**
 * 施設要素のキー情報（プロファイル＋登録済み属性の表示テキスト）
 * @param {object} result - Overpass result
 * @returns {{
 *   categoryId: (string|null),
 *   icon: string,
 *   typeLabel: string,
 *   items: Array<{ key: string, text: string }>
 * }}
 */
export function keyInfoFor(result) {
  const tags = (result && result.tags) || {}
  const categoryId = facilityCategoryId(result)
  const profile = (categoryId && PROFILES[categoryId]) || PROFILES.DEFAULT

  const items = profile.attrs
    .map((key) => ({ key, text: ATTR_RENDERERS[key] ? ATTR_RENDERERS[key](tags) : null }))
    .filter((it) => it.text != null)

  return {
    categoryId,
    icon: profile.icon,
    typeLabel: facilityTypeLabel(result),
    items
  }
}

/**
 * カテゴリID → プロファイル（テスト・他コンポーネント向け）
 */
export function profileFor(categoryId) {
  return (categoryId && PROFILES[categoryId]) || PROFILES.DEFAULT
}

export { PROFILES, ATTR_RENDERERS }
