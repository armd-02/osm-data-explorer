import React from 'react'
import { useApp } from '../context/AppContext'
import { downloadCSV, downloadGeoJSON } from '../utils/export'

/**
 * エクスポートボタンバー（CSV / GeoJSON）
 */
function ExportBar() {
  const { state } = useApp()
  const { results, fetchMeta } = state

  if (!results || results.length === 0) return null

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-50 border-t border-slate-200">
      <span className="text-[11px] text-slate-500">出力:</span>
      <button
        onClick={() => downloadCSV(results, fetchMeta)}
        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] rounded font-medium transition-colors"
        title="CSVダウンロード（Excel対応・UTF-8 BOM付き）"
      >
        📄 CSV
      </button>
      <button
        onClick={() => downloadGeoJSON(results, fetchMeta)}
        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] rounded font-medium transition-colors"
        title="GeoJSONダウンロード（QGIS等対応）"
      >
        🗺️ GeoJSON
      </button>
      <span className="text-[10px] text-slate-400 ml-auto">
        ODbL / © OpenStreetMap contributors
      </span>
    </div>
  )
}

export default ExportBar
