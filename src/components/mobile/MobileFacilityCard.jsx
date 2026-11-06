import React from 'react'
import {
  facilityName,
  formatAddress,
  safeWebsite,
  facilityTypeLabel
} from '../../utils/facilityLabels'
import { wheelchairBadge } from '../../utils/accessibility'
import { keyInfoFor } from '../../utils/categoryProfiles'
import { missingAttributesOf, ATTRIBUTE_LABELS } from '../../utils/statistics'

// テスト・他コンポーネントの互換のために再エクスポート
export { facilityName, formatAddress, safeWebsite }

/**
 * (#59 / #44) モバイル施設カード
 *
 * 生活者目線UI（#44）: 生活者の言葉で施設を表示する。
 *   - 施設名（name / name:ja）
 *   - 施設タイプ（日本語ラベル: 「カフェ」「公園」「駅」など）
 *   - (A3) カテゴリ別情報設計: カテゴリごとに意味のある属性（keyInfoFor の
 *     プロファイル）の順に、登録済みの情報のみ表示する。
 *     例: 飲食店→営業時間・料理、公共施設→バリアフリー、トイレ→車椅子のみ。
 * OSM生データ（node/way、amenity=cafe、OSM ID）はカードの主表示にしない。
 * 詳細（OSM ID・全タグ）は施設詳細ボトムシート（MobileFacilityDetail）に退ける。
 *
 * カード全体がボタン（タップで詳細シート）。未登録フィールドは行ごとに出さない。
 */
export default function MobileFacilityCard({ result, onOpen, showMissing = false }) {
  const tags = result.tags || {}
  const name = facilityName(result)
  const typeLabel = facilityTypeLabel(result)
  // (A3) カテゴリプロファイルに基づく属性行（wheelchair はバッジとして別途表示）
  const profileItems = keyInfoFor(result).items.filter((it) => it.key !== 'wheelchair')
  const wcBadge = wheelchairBadge(tags)

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

      {profileItems.map((it) => (
        <p
          key={it.key}
          className={it.key === 'website' ? 'text-xs text-primary-600' : 'text-xs text-slate-600'}
        >
          {it.text}
        </p>
      ))}
      {wcBadge && (
        <p className={`text-[11px] border rounded-md px-2 py-0.5 inline-block ${wcBadge.cls}`}>
          ♿ {wcBadge.text}
        </p>
      )}
      {/* (B2) 欠落フィルタアクティブ時: 未登録の主要属性を表示 */}
      {showMissing && (() => {
        const missing = missingAttributesOf(result)
        if (missing.length === 0) return null
        return (
          <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-0.5">
            ⚠️ {missing.map((k) => ATTRIBUTE_LABELS[k]).join('・')} 未登録
          </p>
        )
      })()}
    </button>
  )
}
