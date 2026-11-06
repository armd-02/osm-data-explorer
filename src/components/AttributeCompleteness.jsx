import React from 'react'
import { computeAttributeCompleteness, DISPLAY_ATTRIBUTES } from '../utils/statistics'

/**
 * (B1) 属性の充足率表示
 *
 * 表示中結果における主要属性（電話・営業時間・Webサイト・住所）の
 * 登録件数を「あり X/Y件」で表示する。
 * 計算は #9 の属性欠損分析（computeStatistics の CHECK_TAGS 方式）を踏襲し、
 * 一覧で実際に表示する値（facilityLabels のロジック）と揃えている。
 *
 * 値が「推測」で補われることはなく、OSMに登録済みの値のみをカウントする。
 */
export default function AttributeCompleteness({ results, className = '' }) {
  if (!results || results.length === 0) return null
  const completeness = computeAttributeCompleteness(results)

  return (
    <div className={`flex flex-wrap gap-x-3 gap-y-1 ${className}`} aria-label="主要属性の充足率">
      {DISPLAY_ATTRIBUTES.map((attr) => {
        const { present, total } = completeness[attr.key]
        const pct = total > 0 ? Math.round((present / total) * 100) : 0
        const tone = present === total ? 'text-green-700' : present === 0 ? 'text-red-600' : 'text-slate-600'
        return (
          <span
            key={attr.key}
            className={`text-xs ${tone}`}
            title={`${attr.label}: ${pct}%（${present}/${total}件）が登録あり`}
          >
            {attr.icon} {attr.label}あり {present}/{total}件
          </span>
        )
      })}
    </div>
  )
}
