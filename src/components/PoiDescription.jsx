import React from 'react'
import { buildPoiDescription } from '../utils/poiDescription'

/**
 * POI説明枠
 *
 * マップ上のマーカーをタップしたPOIの説明をタグから生成して表示する。
 * 説明文の組み立ては buildPoiDescription（utils/poiDescription.js）に委譲する。
 *
 * 使用場所: 地図ブロックの下（PC: SearchTabContent / モバイル: MobileSearchTab）。
 */
export default function PoiDescription({ tappedPoi }) {
  if (!tappedPoi) {
    return (
      <div className="border border-slate-200 rounded-lg bg-slate-50 px-3 py-2.5">
        <p className="text-xs text-slate-400">地図のPOIをタップすると、ここに説明が表示されます</p>
      </div>
    )
  }

  const desc = buildPoiDescription(tappedPoi)
  if (!desc) return null

  return (
    <div className="border border-slate-200 rounded-lg bg-slate-50 px-3 py-2.5">
      {/* ヘッダー: 名前 + タイプラベル */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-sm font-medium text-slate-800 truncate">{desc.name}</span>
        <span className="text-xs text-slate-500 shrink-0 ml-auto">{desc.typeLabel}</span>
      </div>

      {/* 登録済みの属性（あるもののみ） */}
      <ul className="space-y-0.5">
        {desc.items.map((item, i) => (
          <li key={i} className={`text-xs leading-relaxed ${item.cls || 'text-slate-600'}`}>
            {item.href ? (
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:underline"
              >
                {item.icon} {item.text}
              </a>
            ) : (
              <>{item.icon} {item.text}{item.note && <span className="text-slate-400">（{item.note}）</span>}</>
            )}
          </li>
        ))}
      </ul>

      {/* OSMリンク */}
      {desc.osmUrl && (
        <a
          href={desc.osmUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-block text-[11px] text-primary-600 hover:underline"
        >
          🔗 OSMで見る
        </a>
      )}
    </div>
  )
}
