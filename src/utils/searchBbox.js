/**
 * 検索BBOXの解決ロジック (#41)
 *
 * 地図表示範囲（Leaflet Bounds）と前回検索範囲（state.bbox）から、
 * 検索に使用するBBOXを決定する。
 *
 * 優先順:
 * 1. mapBounds（地図表示範囲）— 「検索する」押下時点の getBounds()
 * 2. stateBbox（前回確定BBOX）— 地図非表示時のfallback
 * 3. null — どちらも無い場合はエラー案内
 */

/**
 * Leaflet LatLngBoundsからBBOXオブジェクトを生成
 * @param {object} bounds - Leaflet LatLngBounds (getSouth/getNorth/getWest/getEast)
 * @returns {{south, west, north, east}}
 */
export function boundsToBbox(bounds) {
  if (!bounds) return null
  return {
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast()
  }
}

/**
 * 検索に使用するBBOXを決定
 * @param {object|null} stateBbox - 前回確定BBOX {south, west, north, east}
 * @param {object|null} mapBounds - Leaflet LatLngBounds（地図表示範囲）
 * @returns {object|null} 検索用BBOX、またはnull
 */
export function resolveSearchBbox(stateBbox, mapBounds) {
  // 地図が利用可能なら、その表示範囲を使用
  if (mapBounds) {
    return boundsToBbox(mapBounds)
  }
  // 地図非表示時は前回のBBOXを使用
  if (stateBbox) {
    return stateBbox
  }
  // どちらも無い場合はnull（エラー案内）
  return null
}
