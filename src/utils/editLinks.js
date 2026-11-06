/**
 * (B3) OSM/iD編集導線のURL生成
 *
 * #12（OSM編集・Note作成導線）のURL方式を共通ユーティリティとしてまとめ、
 * 結果一覧（B1/B2の未登録属性表示）から各施設ごとにiD編集へ直接
 * ジャンプできるようにする。
 *
 * - iDは要素ディープリンク（/edit?node=node/123）をサポートしており、
 *   対象施設を特定した状態でエディタが開く。
 */

/**
 * 施設要素用のiD編集URL（要素ディープリンク）
 * @param {object} result - Overpass result（type/id、必要ならlat/lon）
 * @param {number} zoom - 座標フォールバック時のズーム（既定16）
 * @returns {string} iDエディタURL
 */
export function buildIdElementUrl(result, zoom = 16) {
  if (result && result.type && result.id != null) {
    return `https://www.openstreetmap.org/edit?node=${encodeURIComponent(`${result.type}/${result.id}`)}`
  }
  // 要素IDが未取得（稀）の場合は中心座標で開く
  if (result && result.lat != null && result.lon != null) {
    return buildIdMapUrl(result.lat, result.lon, zoom)
  }
  return 'https://www.openstreetmap.org/edit'
}

/**
 * 地図範囲（中心座標）用のiD編集URL
 * @param {number} lat 緯度
 * @param {number} lon 経度
 * @param {number} zoom ズーム
 * @returns {string} iDエディタURL（map/z/lon/lat 形式）
 */
export function buildIdMapUrl(lat, lon, zoom = 16) {
  return `https://www.openstreetmap.org/edit?node=map%2F${Math.round(zoom)}%2F${lon.toFixed(6)}%2F${lat.toFixed(6)}`
}

/**
 * OSM Note作成URL（座標指定）
 */
export function buildNoteUrl(lat, lon) {
  return `https://www.openstreetmap.org/notes/new?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`
}

/**
 * OSM要素ページURL
 */
export function buildOsmElementUrl(result) {
  if (result && result.type && result.id != null) {
    return `https://www.openstreetmap.org/${result.type}/${result.id}`
  }
  return 'https://www.openstreetmap.org'
}
