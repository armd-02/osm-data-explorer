import React from 'react'
import { useApp } from '../context/AppContext'
import { downloadCSV, downloadGeoJSON } from '../utils/export'
import { applyResultFilters, hasActiveFilters } from '../utils/resultFilters'

/**
 * エクスポートボタンバー（CSV / GeoJSON）
 * (#44) 「一覧を保存」を前面に: CSV（Excelで開ける）を主操作とし、
 *       GeoJSONは補足の高度な形式として控えめに表示する。
 *       フィルタが有効なときは「一覧で表示中の件数」と一致させて出力し、
 *       保存前に出力件数を明示する。
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
    <div className="flex items-center flex-wrap gap-x-2 gap-y-1 px-4 py-2 bg-slate-50 border-t border-slate-200">
      <span className="text-[11px] text-slate-500">
        {filtersOn ? `${results.length}件中、${filtered.length}件を保存します` : `${filtered.length}件を保存します`}
      </span>
      <button
        onClick={() => downloadCSV(filtered, fetchMeta, prefix)}
        disabled={exportDisabled}
        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-md font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        title={exportDisabled ? 'フィルタに一致する施設がありません' : '一覧をCSVとして保存します（Excelで開けます・UTF-8 BOM付き）'}
      >
        📄 一覧を保存（CSV）
      </button>
      <button
        onClick={() => downloadGeoJSON(filtered, fetchMeta)}
        disabled={exportDisabled}
        className="px-2.5 py-1.5 bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 text-[11px] rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        title={exportDisabled ? 'フィルタに一致する施設がありません' : 'GeoJSONとして保存（QGIS等の地図ツール向け）'}
      >
        GeoJSON（高度な形式）
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
