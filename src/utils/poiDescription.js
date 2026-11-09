/**
 * POI説明の生成ユーティリティ
 *
 * OSMタグからPOIの説明文（構造化データ）を生成する。
 * 原則: OSMに登録済みの情報のみ含める（未登録は省く・捏造しない）。
 *
 * 施設POI（bfなし）:
 *   住所 → 営業時間 → 電話 → Webサイト → バリアフリー情報
 * バリアフリーPOI（bfあり）:
 *   点字ブロック → 縁石種別 → 長さ → 音声・振動案内
 *
 * 利用箇所: PoiDescription コンポーネント
 * 回帰テスト: src/utils/__tests__/poiDescription.test.js
 */
import { facilityName, facilityTypeLabel, formatAddress, safeWebsite } from './facilityLabels'
import { parseAccessibility } from './accessibility'
import { buildOsmElementUrl } from './editLinks'
import { barrierFreeTypeLabel, tactileStatus, lengthLabel, signalLabels } from './barrierFreeResults'
import { barrierFreeLabel } from './barrierFree'

/**
 * POI結果から説明文の構造化データを生成する。
 *
 * @param {object} poi - Overpass結果（{ type, id, tags, lat, lon, name, bf? }）
 * @returns {{
 *   name: string,
 *   typeLabel: string,
 *   items: Array<{ icon: string, text: string, href?: string, cls?: string }>,
 *   osmUrl: string
 * }}
 *   items: 表示順の項目配列。未登録の項目は含まれない。
 *   href:  リンク付き項目（Webサイト等）のURL。
 *   cls:   色分け用のCSSクラス（点字ブロック有無など）。
 */
export function buildPoiDescription(poi) {
  if (!poi) return null
  const isBf = !!poi.bf
  return isBf ? buildBfDescription(poi) : buildFacilityDescription(poi)
}

/** 施設POIの説明文を生成する（bfなし） */
function buildFacilityDescription(poi) {
  const tags = poi.tags || {}
  const items = []

  const address = formatAddress(tags)
  if (address) {
    items.push({ icon: '📍', text: address })
  }

  if (tags.opening_hours) {
    items.push({ icon: '🕐', text: tags.opening_hours })
  }

  const phone = tags.phone || tags['contact:phone']
  if (phone) {
    items.push({ icon: '📞', text: phone })
  }

  const website = safeWebsite(tags)
  if (website) {
    items.push({ icon: '🔗', text: 'Webサイト', href: website })
  }

  // バリアフリー情報（車椅子・点字ブロック・エレベーター等）
  const accessItems = parseAccessibility(tags)
  for (const it of accessItems) {
    const item = { icon: it.icon, text: `${it.label}: ${it.status}` }
    if (it.note) item.note = it.note
    items.push(item)
  }

  return {
    name: facilityName(poi),
    typeLabel: facilityTypeLabel(poi),
    items,
    osmUrl: buildOsmElementUrl(poi)
  }
}

/** バリアフリーPOIの説明文を生成する（bfあり） */
function buildBfDescription(poi) {
  const items = []

  const tactile = tactileStatus(poi)
  if (tactile) {
    items.push({
      icon: '🦯',
      text: `点字ブロック: ${tactile}`,
      cls: tactile === '有' ? 'text-emerald-700' : 'text-rose-600'
    })
  }

  const kerb = poi.bf?.kerb || null
  if (kerb) {
    items.push({ icon: '🧱', text: `縁石: ${kerb}` })
  }

  const length = lengthLabel(poi)
  if (length) {
    items.push({ icon: '📏', text: `長さ: ${length}` })
  }

  const signals = signalLabels(poi)
  if (signals.length > 0) {
    items.push({ icon: '🔔', text: `${signals.join('・')}案内あり`, cls: 'text-amber-700' })
  }

  return {
    name: poi.name || barrierFreeLabel(poi),
    typeLabel: barrierFreeTypeLabel(poi),
    items,
    osmUrl: buildOsmElementUrl(poi)
  }
}
