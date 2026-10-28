import React from 'react'
import {
  facilityName,
  formatAddress,
  safeWebsite,
  facilityTypeLabel
} from '../../utils/facilityLabels'

// テスト・他コンポーネントの互換のために再エクスポート
export { facilityName, formatAddress, safeWebsite }

/**
 * (#59 / #44) モバイル施設カード
 *
 * 生活者目線UI（#44）: 生活者の言葉で施設を表示する。
 *   - 施設名（name / name:ja）
 *   - 施設タイプ（日本語ラベル: 「カフェ」「公園」「駅」など）
 *   - 住所 / 電話 / 公式サイト / 営業時間（OSMに未登録なら表示しない。捏造しない）
 * OSM生データ（node/way、amenity=cafe、OSM ID）はカードの主表示にしない。
 * 詳細（OSM ID・全タグ）は施設詳細ボトムシート（MobileFacilityDetail）に退ける。
 *
 * カード全体がボタン（タップで詳細シート）。未登録フィールドは行ごとに出さない。
 */
export default function MobileFacilityCard({ result, onOpen }) {
  const tags = result.tags || {}
  const name = facilityName(result)
  const typeLabel = facilityTypeLabel(result)
  const address = formatAddress(tags)
  const phone = tags.phone || tags['contact:phone'] || ''
  const website = safeWebsite(tags)
  const openingHours = tags.opening_hours || ''

  return (
    <button
      type="button"
      onClick={() => onOpen(result)}
      className="w-full text-left bg-white border border-slate-200 rounded-xl p-3 space-y-1.5 active:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800 min-w-0 break-words">{name}</h3>
        <span className="shrink-0 text-[11px] text-primary-700 bg-primary-50 rounded-md px-2 py-0.5">
          {typeLabel}
        </span>
      </div>

      {address && <p className="text-xs text-slate-600">📍 {address}</p>}
      {phone && <p className="text-xs text-slate-600">📞 {phone}</p>}
      {openingHours && <p className="text-xs text-slate-600">🕐 {openingHours}</p>}
      {website && (
        <p className="text-xs text-primary-600">🌐 公式サイト（詳細で開けます）</p>
      )}
    </button>
  )
}
