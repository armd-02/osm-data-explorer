import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import { getMapInstance } from '../../hooks/useMapRef'
import StatusBanner from '../StatusBanner'
import MobileBottomNav from './MobileBottomNav'
import MobileSearchTab from './MobileSearchTab'
import MobileListTab from './MobileListTab'
import MobileMapTab from './MobileMapTab'
import MobileOtherTab from './MobileOtherTab'
import MobileFacilityDetail from './MobileFacilityDetail'

/**
 * (#59) モバイルシェル
 *
 * - 上部: ヘッダー + StatusBanner（全タブで共通表示。
 *   エラーはタブを離れても画面に戻ってくる）
 * - 中央: 4タブ（検索/一覧/地図/その他）。非活性タブは hidden で
 *   アンマウントしないため、Leaflet マップインスタンス・検索条件・
 *   フィルタ状態がタブ切替をまたいで保持される
 * - 下部: 下部ナビゲーション（4タブ）
 * - 施設詳細: ボトムシート（オーバーレイ。主ナビのタブではない）
 *
 * 検索完了時は結果（一覧）タブへ、エラー時は検索タブへ自動切替する。
 */
export default function MobileShell() {
  const { state } = useApp()
  const [tab, setTab] = useState('search')
  const [detail, setDetail] = useState(null) // { result, origin }

  // 検索完了（loading → success/error）でタブを自動切替
  const prevStatusRef = useRef(state.status)
  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = state.status
    if (prev !== 'loading' || state.status === prev) return
    setTab(state.status === 'success' ? 'list' : 'search')
  }, [state.status])

  // 地図タブを開いたとき: 再描画 + 直近の検索BBOXにフィット
  // （表示領域が0だったLeafletは invalidateSize が必要）
  const lastFitBboxRef = useRef(null)
  useEffect(() => {
    if (tab !== 'map') return
    const map = getMapInstance()
    if (!map) return
    if (typeof map.invalidateSize === 'function') map.invalidateSize()
    const bbox = state.bbox
    if (!bbox) return
    const key = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`
    if (key === lastFitBboxRef.current) return
    if (typeof map.fitBounds !== 'function') return
    map.fitBounds([[bbox.south, bbox.west], [bbox.north, bbox.east]], { padding: [20, 20] })
    lastFitBboxRef.current = key
  }, [tab, state.bbox])

  const openDetail = (result, origin) => setDetail({ result, origin })
  const closeDetail = () => setDetail(null)

  // 詳細シートから「地図で見る」: 地図タブへ移動し施設にパン
  // （マップは hidden だがアンマウントしていないため常に操作可能）
  const showOnMap = (result) => {
    setDetail(null)
    setTab('map')
    if (result.lat == null || result.lon == null) return
    const map = getMapInstance()
    if (!map) return
    if (typeof map.panTo === 'function') map.panTo([result.lat, result.lon])
    if (typeof map.setZoom === 'function' && typeof map.getZoom === 'function' && map.getZoom() < 16) {
      map.setZoom(16)
    }
  }

  const selectTab = (id) => {
    if (detail) setDetail(null)
    setTab(id)
  }

  // 非活性タブは hidden 属性で隠す（アンマウントしない＝状態保持）。
  // Tailwindの hidden クラスではなく HTML hidden 属性を使うことで、
  // アクセシビリティツリー（およびテストクエリ）からも除外される。
  const panelProps = (id) => (tab === id ? {} : { hidden: true })

  return (
    <div className="flex flex-col h-dvh bg-slate-50 text-slate-800">
      <header className="shrink-0 bg-white border-b border-slate-200 px-4 py-2.5">
        <h1 className="text-sm font-semibold text-slate-800">OSMデータ検索</h1>
      </header>

      <StatusBanner onViewResults={() => setTab('list')} />

      <main className="flex-1 min-h-0 relative">
        <div className="absolute inset-0" {...panelProps('search')}>
          <MobileSearchTab onViewResults={() => setTab('list')} />
        </div>
        <div className="absolute inset-0" {...panelProps('list')}>
          <MobileListTab onOpenDetail={openDetail} />
        </div>
        <div className="absolute inset-0" {...panelProps('map')}>
          <MobileMapTab onMarkerClick={(r) => openDetail(r, 'map')} />
        </div>
        <div className="absolute inset-0" {...panelProps('other')}>
          <MobileOtherTab />
        </div>
      </main>

      <MobileBottomNav active={tab} onSelect={selectTab} />

      {detail && (
        <MobileFacilityDetail detail={detail} onClose={closeDetail} onShowOnMap={showOnMap} />
      )}
    </div>
  )
}
