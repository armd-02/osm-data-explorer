import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import { getMapInstance } from '../hooks/useMapRef'

/**
 * OSM編集・Note作成の導線
 * 検索結果が0件または候補が不十分な場合に表示
 */
function EditPanel() {
  const { state } = useApp()
  const { results, bbox, activeResultId } = state
  const [expanded, setExpanded] = useState(false)
  const [noteText, setNoteText] = useState('')

  // 地図の中心座標取得
  const getCenter = () => {
    const map = getMapInstance()
    if (map) {
      const c = map.getCenter()
      return { lat: c.lat, lon: c.lng, zoom: map.getZoom() }
    }
    if (bbox) {
      return {
        lat: (bbox.south + bbox.north) / 2,
        lon: (bbox.west + bbox.east) / 2,
        zoom: 16
      }
    }
    return { lat: 34.6937, lon: 135.5023, zoom: 16 }
  }

  // 表示条件: 結果が0件のとき、または結果があるが「編集を提案」したいとき
  const showPanel = results.length === 0 && state.status === 'success'

  if (!showPanel && !expanded) return null

  const center = getCenter()
  const idUrl = `https://www.openstreetmap.org/edit?node=map%2F${Math.round(center.zoom)}%2F${center.lon.toFixed(6)}%2F${center.lat.toFixed(6)}`
  const noteUrl = `https://www.openstreetmap.org/notes/new?lat=${center.lat.toFixed(6)}&lon=${center.lon.toFixed(6)}`
  const mapUrl = "https://www.openstreetmap.org/?mlat=" + center.lat.toFixed(6) + "&mlon=" + center.lon.toFixed(6) + "#map/" + center.zoom + "/" + center.lat.toFixed(4) + "/" + center.lon.toFixed(4)

  // Note文案のプレフィル
  const facilityName = activeResultId
    ? results.find(r => r.id === activeResultId)?.name
    : null

  const defaultNote = facilityName
    ? `${facilityName}の情報がOSMに未登録であるか、不正確である可能性があります。現地確認のうえ、修正をお願いします。`
    : 'この付近のOSMデータに誤りまたは不足がある可能性があります。現地確認のうえ、修正をお願いします。'

  if (!expanded && !showPanel) return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mx-3 mb-2">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium text-amber-800">📝 OSMデータの改善</span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-auto text-[11px] text-amber-700 hover:text-amber-900"
        >
          {expanded ? '閉じる' : '展開'}
        </button>
      </div>

      {!expanded ? (
        <p className="text-xs text-amber-700">
          検索結果が見つかりません。OSMに未登録か、表記が異なる可能性があります。
        </p>
      ) : (
        <div className="space-y-3">
          {/* 確認導線 */}
          <div>
            <p className="text-[11px] font-medium text-amber-800 mb-1.5">① 周辺を確認する</p>
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800"
            >
              🔍 OSM地図で周辺を確認
            </a>
            <p className="text-[10px] text-amber-700 mt-1">
              既存の同名施設や近くの類似施設がないか確認してください。
            </p>
          </div>

          {/* iDエディタ */}
          <div>
            <p className="text-[11px] font-medium text-amber-800 mb-1.5">② 直接編集する（OSMアカウント必要）</p>
            <a
              href={idUrl}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800"
            >
              ✏️ iDエディタで編集
            </a>
            <p className="text-[10px] text-amber-700 mt-1">
              ・OSMアカウントが必要です（無料）
              ・現地確認可能な情報のみ登録してください
              ・イベント限定情報は恒常的POIとして登録しないでください
            </p>
          </div>

          {/* OSM Note */}
          <div>
            <p className="text-[11px] font-medium text-amber-800 mb-1.5">③ Noteで報告する（アカウント不要）</p>
            <textarea
              value={noteText || defaultNote}
              onChange={(e) => setNoteText(e.target.value)}
              className="w-full h-16 text-xs border border-amber-200 rounded px-2 py-1.5 bg-white resize-none focus:outline-none focus:ring-1 focus:ring-amber-400"
              placeholder="報告内容を入力..."
            />
            <div className="flex items-center gap-2 mt-1.5">
              <a
                href={noteUrl}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs rounded font-medium"
              >
                📌 Note作成画面を開く
              </a>
              <span className="text-[10px] text-amber-700">
                ※ 上記文案はOSMのNote作成画面にコピーして使用できます
              </span>
            </div>
            <p className="text-[10px] text-amber-700 mt-1">
              ・NoteはOSM地物の新規登録ではありません（報告・依頼です）
              ・個人情報・宣伝・イベント限定情報は投稿しないでください
              ・近隣の既存Noteを確認し、重複報告を避けましょう
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default EditPanel
