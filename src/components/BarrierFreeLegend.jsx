import React from 'react'
import { useApp } from '../context/AppContext'
import { TACTILE_LINE_COLORS, NODE_ROLE_COLORS } from '../utils/barrierFreeGeoJSON'

/**
 * (#62) バリアフリー検索の地図凡例（第4ピース）
 *
 * バリアフリー検索（resultKind === 'barrier_free'）の結果を地図上で
 * 線（歩道way）と点（縁石・案内信号node）として表示するときの色を説明する。
 *
 * - 表示条件はコンポーネント内で context（AppContext）から判定する。
 *   resultKind === 'barrier_free' かつ結果が1件以上ある場合のみ表示、
 *   それ以外は null（非表示）。
 * - 地図本体の「下」に通常のレイアウトフローで描画する（Appの地図ブロック・
 *   モバイル検索タブの地図の下）。地図上のオーバーレイ（absolute配置）は廃止。
 * - 色は bf-line / bf-node レイヤのpaintと同一の定数（barrierFreeGeoJSON.js）
 *   を使うため、凡例と地図表示がずれることはない。
 */
const LINE_ITEMS = [
  { color: TACTILE_LINE_COLORS.yes, label: '歩道・点字ブロックあり' },
  { color: TACTILE_LINE_COLORS.no, label: '歩道・点字ブロックなし' },
  { color: TACTILE_LINE_COLORS.unknown, label: '歩道・点字ブロック未記録' }
]

const POINT_ITEMS = [
  { color: NODE_ROLE_COLORS.signal, label: '音声・振動案内信号' },
  { color: NODE_ROLE_COLORS.kerb, label: '縁石' },
  { color: NODE_ROLE_COLORS['kerb+signal'], label: '縁石＋案内信号' }
]

export default function BarrierFreeLegend() {
  const { state } = useApp()
  const results = state.results || []
  if (state.resultKind !== 'barrier_free' || results.length === 0) return null

  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-md">
      <div className="mb-1 text-xs font-semibold text-slate-700">凡例</div>
      <ul className="space-y-1 text-[11px] text-slate-600">
        {LINE_ITEMS.map((item) => (
          <li key={item.label} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-[3px] w-5 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </li>
        ))}
        {POINT_ITEMS.map((item) => (
          <li key={item.label} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
