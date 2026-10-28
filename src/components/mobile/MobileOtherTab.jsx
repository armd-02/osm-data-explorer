import React, { useState } from 'react'
import BatchMatch from '../BatchMatch'
import StatisticsPanel from '../StatisticsPanel'
import AboutPanel from '../AboutPanel'
import ExportBar from '../ExportBar'

/**
 * (#59) モバイル「その他」タブ
 *
 * 集計・出力・店名→座標一括対応・説明をまとめて配置する。
 * 内部で3つのサブタブ（ボタン）を持つ。
 */

const SUBTABS = [
  { id: 'batch', label: '店名→座標' },
  { id: 'stats', label: '集計・出力' },
  { id: 'about', label: '使い方' },
]

export default function MobileOtherTab() {
  const [sub, setSub] = useState('batch')

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 bg-white border-b border-slate-200 px-2 pt-2">
        <div className="flex gap-1" role="tablist" aria-label="その他の機能">
          {SUBTABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={sub === t.id}
              onClick={() => setSub(t.id)}
              className={`min-h-[44px] flex-1 text-[13px] rounded-lg transition-colors ${
                sub === t.id
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {sub === 'batch' && <BatchMatch />}
        {sub === 'stats' && (
          <div className="p-3 space-y-3">
            <StatisticsPanel />
            <ExportBar />
          </div>
        )}
        {sub === 'about' && (
          <div className="p-4">
            <AboutPanel />
          </div>
        )}
      </div>
    </div>
  )
}
