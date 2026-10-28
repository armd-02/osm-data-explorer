import React from 'react'
import { useApp } from '../context/AppContext'
import { downloadCSV, downloadGeoJSON } from '../utils/export'
import { applyResultFilters, hasActiveFilters } from '../utils/resultFilters'

/**
 * エクスポートボタンバー（CSV / GeoJSON）
 * (#44) フィルタが有効なときは「一覧で表示中の件数」と一致させて出力し、
 *       「M件中、N件を出力」と明示する。
 */
function ExportBar() {
  const { state } = useApp()
  const { results, fetchMeta, searchSource, selectedMunicipality, resultFilters } = state

  if (!results || results.length === 0) return null

  // (#44) 表示中の件数 = 出力件数
  const filtered = applyResultFilters(results, resultFilters)
  const filtersOn = hasActiveFilters(resultFilters)
  const exportDisabled = filtered.length === 0

  // (#44) 自治体モードではファイル名に自治体名を含める
  const prefix = searchSource === 'municipality' && selectedMunicipality?.name
    ? `osm-${selectedMunicipality.displayName || selectedMunicipality.name}`
    : 'osm-results'

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-50 border-t border-slate-200">
      <span className="text-[11px] text-slate-500">出力:</span>
      <span className="text-[10px] text-slate-500">
        {filtersOn ? `${results.length}件中、${filtered.length}件を出力` : `${results.length}件を出力`}
      </span>
      <button
        onClick={() => downloadCSV(filtered, fetchMeta, prefix)}
        disabled={exportDisabled}
        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] rounded font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        title={exportDisabled ? 'フィルタに一致する施設がありません' : 'CSVダウンロード（Excel対応・UTF-8 BOM付き）'}
      >
        📄 CSV
      </button>
      <button
        onClick={() => downloadGeoJSON(filtered, fetchMeta)}
        disabled={exportDisabled}
        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] rounded font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        title={exportDisabled ? 'フィルタに一致する施設がありません' : 'GeoJSONダウンロード（QGIS等対応）'}
      >
        🗺️ GeoJSON
      </button>
      {searchSource === 'municipality' && selectedMunicipality?.name && (
        <span className="text-[10px] text-slate-500">
          📍 {selectedMunicipality.displayName || selectedMunicipality.name}
        </span>
      )}
      <span className="text-[10px] text-slate-400 ml-auto">
        ODbL / © OpenStreetMap contributors
      </span>
    </div>
  )
}

export default ExportBar
