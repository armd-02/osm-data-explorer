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
 * BBOXの最小スパン（度）。
 *
 * Overpass APIは面積ゼロのBBOX（south >= north または west >= east）を
 * "bbox order must be [south, west, north, east]" エラーで拒否する。
 * さらにクエリ生成時の丸め（toFixed(6)）により、ごく狭い範囲では
 * 値が崩れて順序が逆転し得るため、丸め精度（1e-6度 ≒ 0.1m）を
 * 最低スパンとして要求する。実表示の地図範囲は最大ズームでも
 * 1e-3度オーダーなので、正当な検索に影響しない。
 */
export const MIN_BBOX_SPAN = 1e-6

/**
 * BBOXが検索に使えるか検証する
 * @param {object|null} bbox - {south, west, north, east}
 * @returns {boolean} 有効なBBOXか
 */
// 浮動小数点演算の丸め誤差に対する許容値（MIN_BBOX_SPANの0.0001%以下）
const FP_TOLERANCE = MIN_BBOX_SPAN * 1e-4

export function isValidBbox(bbox) {
  if (!bbox || typeof bbox !== 'object') return false
  const { south, west, north, east } = bbox
  return [south, west, north, east].every(Number.isFinite)
    && (north - south) >= MIN_BBOX_SPAN - FP_TOLERANCE
    && (east - west) >= MIN_BBOX_SPAN - FP_TOLERANCE
}

/**
 * Leaflet LatLngBoundsからBBOXオブジェクトを生成
 * @param {object} bounds - Leaflet LatLngBounds (getSouth/getNorth/getWest/getEast)
 * @returns {{south, west, north, east}|null} 無効（縮退・逆順・NaN）ならnull
 */
export function boundsToBbox(bounds) {
  if (!bounds) return null
  const bbox = {
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast()
  }
  // 非表示（サイズ0）の地図コンテナからgetBounds()で得られる縮退BBOXは
  // Overpassが拒否するため、未設定として扱う
  return isValidBbox(bbox) ? bbox : null
}

/**
 * 検索に使用するBBOXを決定
 * @param {object|null} stateBbox - 前回確定BBOX {south, west, north, east}
 * @param {object|null} mapBounds - Leaflet LatLngBounds（地図表示範囲）
 * @returns {object|null} 検索用BBOX、またはnull
 */
export function resolveSearchBbox(stateBbox, mapBounds) {
  // 地図が利用可能なら、その表示範囲を使用（縮退bboxなら無効として扱う）
  if (mapBounds) {
    const bbox = boundsToBbox(mapBounds)
    if (bbox) return bbox
  }
  // 地図非表示・縮退時は前回（有効な）BBOXを使用
  if (stateBbox && isValidBbox(stateBbox)) {
    return stateBbox
  }
  // どちらも無い場合はnull（エラー案内）
  return null
}
