import React, { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { computeStatistics, statsToCSV } from '../utils/statistics'
import { downloadFile } from '../utils/export'

/**
 * 集計・分類・属性欠損分析パネル
 */
function StatisticsPanel() {
  const { state } = useApp()
  const { results, fetchMeta } = state
  const [tab, setTab] = useState('overview') // 'overview' | 'tags' | 'missing'

  const stats = useMemo(() => computeStatistics(results, fetchMeta), [results, fetchMeta])

  if (!results || results.length === 0) return null

  const downloadStats = () => {
    const csv = statsToCSV(stats)
    const dateStr = new Date().toISOString().slice(0, 10)
    downloadFile(csv, `osm-stats-${dateStr}.csv`, 'text/csv;charset=utf-8')
  }

  return (
    <div className="h-full flex flex-col">
      {/* タブ */}
      <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 border-b border-slate-200">
        {[
          { id: 'overview', label: '概要' },
          { id: 'tags', label: 'タグ別' },
          { id: 'missing', label: '欠損' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              tab === t.id ? 'bg-primary-100 text-primary-700 font-medium' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={downloadStats}
          className="ml-auto px-2 py-1 text-[11px] text-slate-500 hover:text-primary-600 transition-colors"
          title="集計結果をCSVでダウンロード"
        >
          ⬇ 集計CSV
        </button>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'overview' && <OverviewTab stats={stats} fetchMeta={fetchMeta} />}
        {tab === 'tags' && <TagsTab stats={stats} />}
        {tab === 'missing' && <MissingTab stats={stats} />}
      </div>
    </div>
  )
}

/** 概要タブ */
function OverviewTab({ stats, fetchMeta }) {
  const total = stats.total
  return (
    <div className="space-y-3">
      {/* 基本情報 */}
      <div className="bg-white rounded-md border border-slate-200 p-3">
        <h3 className="text-xs font-medium text-slate-600 mb-2">検索結果の概要</h3>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-lg font-bold text-slate-800">{total.toLocaleString()}</p>
            <p className="text-[10px] text-slate-400">総件数</p>
          </div>
          <div>
            <p className="text-lg font-bold text-slate-800">{stats.hasName.toLocaleString()}</p>
            <p className="text-[10px] text-slate-400">名前あり</p>
          </div>
          <div>
            <p className="text-lg font-bold text-amber-600">{stats.noName.toLocaleString()}</p>
            <p className="text-[10px] text-slate-400">名前なし</p>
          </div>
        </div>
      </div>

      {/* 型別 */}
      <div className="bg-white rounded-md border border-slate-200 p-3">
        <h3 className="text-xs font-medium text-slate-600 mb-2">OSM型別</h3>
        <div className="space-y-1">
          {Object.entries(stats.byType).map(([type, count]) => {
            const pct = total > 0 ? (count / total * 100) : 0
            const colors = { node: 'bg-green-500', way: 'bg-blue-500', relation: 'bg-purple-500' }
            return (
              <div key={type} className="flex items-center gap-2">
                <span className="text-[11px] text-slate-600 w-16">{type}</span>
                <div className="flex-1 h-3 bg-slate-100 rounded overflow-hidden">
                  <div className={`h-full ${colors[type] || 'bg-slate-400'} rounded transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[11px] text-slate-600 w-12 text-right">{count.toLocaleString()}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 取得情報 */}
      {fetchMeta?.fetchedAt && (
        <div className="bg-slate-50 rounded-md p-2.5">
          <p className="text-[10px] text-slate-500">
            取得: {new Date(fetchMeta.fetchedAt).toLocaleString('ja-JP')}
            {fetchMeta.endpoint && ` / ${fetchMeta.endpoint}`}
            {fetchMeta.cached && '（キャッシュ）'}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            出典: OpenStreetMap (ODbL) / © OpenStreetMap contributors
          </p>
        </div>
      )}
    </div>
  )
}

/** タグ別タブ */
function TagsTab({ stats }) {
  const tags = Object.entries(stats.byTag)
  if (tags.length === 0) {
    return <p className="text-xs text-slate-400 text-center py-4">分析可能なタグがありません</p>
  }

  return (
    <div className="space-y-3">
      {tags.map(([tag, data]) => {
        const maxCount = data.values[0]?.[1] || 1
        return (
          <div key={tag} className="bg-white rounded-md border border-slate-200 p-2.5">
            <h3 className="text-[11px] font-medium text-slate-600 mb-1.5">
              {tag} <span className="text-slate-400">({data.total}件)</span>
            </h3>
            <div className="space-y-0.5">
              {data.values.slice(0, 8).map(([val, count]) => (
                <div key={val} className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-600 w-20 truncate">{val}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded overflow-hidden">
                    <div className="h-full bg-primary-400 rounded" style={{ width: `${(count / maxCount * 100)}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-500 w-8 text-right">{count}</span>
                </div>
              ))}
              {data.values.length > 8 && (
                <p className="text-[10px] text-slate-400 pl-20">+ {data.values.length - 8}件</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** 欠損タブ */
function MissingTab({ stats }) {
  const attrs = Object.entries(stats.missingAttributes)
  if (attrs.length === 0) {
    return <p className="text-xs text-slate-400 text-center py-4">分析できる属性がありません</p>
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-500">
        主要属性の有無・欠損率。値が低いほどデータ品質が低い可能性があります。
      </p>
      <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-2.5 py-1.5 text-slate-500 font-medium">属性</th>
              <th className="text-right px-2.5 py-1.5 text-slate-500 font-medium">あり</th>
              <th className="text-right px-2.5 py-1.5 text-slate-500 font-medium">なし</th>
              <th className="text-right px-2.5 py-1.5 text-slate-500 font-medium">有率</th>
            </tr>
          </thead>
          <tbody>
            {attrs.map(([tag, data]) => (
              <tr key={tag} className="border-t border-slate-100">
                <td className="px-2.5 py-1.5 text-slate-700">{tag}</td>
                <td className="px-2.5 py-1.5 text-right text-slate-600">{data.present}</td>
                <td className="px-2.5 py-1.5 text-right text-slate-600">{data.missing}</td>
                <td className={`px-2.5 py-1.5 text-right font-medium ${
                  data.rate >= 50 ? 'text-green-600' : data.rate >= 20 ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {data.rate}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default StatisticsPanel
