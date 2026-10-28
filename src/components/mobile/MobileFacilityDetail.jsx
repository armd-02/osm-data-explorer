import React from 'react'
import { facilityName, formatAddress, safeWebsite } from './MobileFacilityCard'

/**
 * (#59) 施設詳細ボトムシート
 *
 * 主情報: 名前・住所・電話・Webサイト（OSMに登録済みの情報のみ表示）
 * 補助情報: OSM ID・座標・タグ一覧（折りたたみ）
 * 主ナビゲーションのタブではなく、施設カード／地図マーカーから開くオーバーレイ。
 */
export default function MobileFacilityDetail({ detail, onClose, onShowOnMap }) {
  const { result } = detail
  const tags = result.tags || {}
  const name = facilityName(result)
  const address = formatAddress(tags)
  const phone = tags.phone
  const website = safeWebsite(tags)
  const tagEntries = Object.entries(tags)
  const hasCoords = result.lat != null && result.lon != null

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`施設詳細: ${name}`}
        className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-2xl max-h-[85dvh] flex flex-col"
      >
        <div className="px-4 pt-2 pb-3 border-b border-slate-100">
          <div className="mx-auto w-10 h-1 bg-slate-200 rounded-full mb-2" aria-hidden="true" />
          <h2 className="text-base font-semibold text-slate-800 break-words">{name}</h2>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">{result.type}/{result.id}</p>
        </div>

        <div className="overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {address && <p className="text-sm text-slate-700">📍 {address}</p>}
          {phone && (
            <a href={`tel:${phone}`} className="inline-flex items-center gap-1.5 text-sm text-primary-600">
              📞 {phone}（タップで発信）
            </a>
          )}
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary-600 break-all"
            >
              🔗 Webサイト
            </a>
          )}
          {!address && !phone && !website && (
            <p className="text-xs text-slate-500">
              住所・電話・WebサイトはOSMに登録されていません。
            </p>
          )}

          {hasCoords && (
            <p className="text-xs text-slate-500 font-mono">🗺 {result.lat}, {result.lon}</p>
          )}

          <a
            href={`https://www.openstreetmap.org/${result.type}/${result.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary-600"
          >
            🔗 OSMで見る（{result.type}/{result.id}）
          </a>

          {tagEntries.length > 0 && (
            <details className="border border-slate-200 rounded-lg">
              <summary className="px-3 py-2 text-xs font-medium text-slate-600 cursor-pointer select-none">
                タグ一覧（{tagEntries.length}）
              </summary>
              <dl className="px-3 pb-2 space-y-1">
                {tagEntries.map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-[11px]">
                    <dt className="shrink-0 font-mono text-slate-500">{k}</dt>
                    <dd className="text-slate-700 break-all min-w-0">{v}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex gap-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {hasCoords && (
            <button
              type="button"
              onClick={() => onShowOnMap(result)}
              className="flex-1 min-h-[44px] bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg"
            >
              地図で見る
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
