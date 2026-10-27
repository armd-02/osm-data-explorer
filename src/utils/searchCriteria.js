/**
 * 検索条件のスナップショット生成（#47）
 *
 * 「検索する」押下時点で使用する条件を、純粋関数として一箇所で生成する。
 * dispatch の直後に旧 state を読む競合を防ぐため、ボタン側は常に
 * クリック時点の state でこの関数を呼び、その結果（criteria）を
 * useSearch.search() に明示的に渡す。
 *
 * 戻り値:
 *  成功: { ok: true, bbox, searchSource, searchMode, category?, keyword?, query }
 *  失敗: { ok: false, reason, message, suggestion }
 *    reason: 'no_bbox' | 'too_large' | 'municipality_not_selected' | 'no_conditions'
 */
import { buildSimpleQuery, buildPoiQuery, buildAdvancedQuery } from './overpass'
import { checkBboxSize } from './geo'
import { resolveSearchBbox } from './searchBbox'

// Overpass API の実用上の上限（useSearch と同じ基準）
const MAX_AREA_KM2 = 40000

function fail(reason, message, suggestion) {
  return { ok: false, reason, message, suggestion }
}

/**
 * 検索条件のスナップショットを生成
 * @param {object} state - AppContext の検索関連 state（その時点の値）
 * @param {object} [options]
 * @param {object|null} [options.mapBounds] - Leaflet LatLngBounds（地図表示範囲）
 * @param {object|null} [options.bboxOverride] - 地図モードで使用するBBOXを上書き
 * @returns {object} criteria（上記の戻り値形式）
 */
export function buildSearchCriteria(state, { mapBounds = null, bboxOverride = null } = {}) {
  const source = state.searchSource === 'municipality' ? 'municipality' : 'map'

  // ===== 自治体モード (#44/#47) =====
  if (source === 'municipality') {
    const mun = state.selectedMunicipality
    if (!mun || !mun.bbox) {
      return fail(
        'municipality_not_selected',
        '自治体が未選択です。',
        '都道府県と市区町村を選択してください。'
      )
    }

    const bbox = mun.bbox
    const sizeCheck = checkBboxSize(bbox)
    if (sizeCheck.areaKm2 > MAX_AREA_KM2) {
      return fail('too_large', sizeCheck.message, 'より小さい市区町村を選択してください。')
    }

    const ms = state.municipalitySearch || { category: '', keyword: '', cuisine: '' }
    const { query, keyword } = buildPoiQuery(bbox, ms.category, ms.keyword, ms.cuisine)
    return {
      ok: true,
      bbox,
      searchSource: 'municipality',
      searchMode: 'simple',
      category: ms.category,
      keyword,
      cuisine: ms.cuisine,
      query
    }
  }

  // ===== 地図モード (#41/#47) =====
  const bbox = bboxOverride || resolveSearchBbox(state.bbox, mapBounds)
  if (!bbox) {
    return fail(
      'no_bbox',
      '検索範囲が設定されていません。',
      '地図を移動・拡大して検索したい範囲を表示してください。'
    )
  }

  const sizeCheck = checkBboxSize(bbox)
  if (sizeCheck.areaKm2 > MAX_AREA_KM2) {
    return fail('too_large', sizeCheck.message, '地図をズームインして範囲を狭めてください。')
  }

  if (state.searchMode === 'advanced') {
    const adv = state.advancedSearch || { tags: [], keyword: '', useAnd: true }
    const tags = adv.tags || []
    const keyword = adv.keyword || ''
    const useAnd = adv.useAnd !== false
    if (tags.length === 0 && !keyword) {
      return fail(
        'no_conditions',
        '検索条件を指定してください。',
        'OSMタグ条件を1つ以上追加するか、キーワードを入力してください。'
      )
    }
    const { query } = buildAdvancedQuery(bbox, tags, keyword, useAnd)
    return {
      ok: true,
      bbox,
      searchSource: 'map',
      searchMode: 'advanced',
      tags,
      keyword,
      useAnd,
      query
    }
  }

  // かんたん検索
  const ss = state.simpleSearch || { category: '', keyword: '', cuisine: '' }
  const { query, keyword } = buildSimpleQuery(bbox, ss.category, ss.keyword, ss.cuisine)
  return {
    ok: true,
    bbox,
    searchSource: 'map',
    searchMode: 'simple',
    category: ss.category,
    keyword,
    cuisine: ss.cuisine,
    query
  }
}
