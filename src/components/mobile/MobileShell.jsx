import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import { getMapInstance } from '../../hooks/useMapRef'
import StatusBanner from '../StatusBanner'
import MobileBottomNav from './MobileBottomNav'
import MobileSearchTab from './MobileSearchTab'
import MobileListTab from './MobileListTab'
import MobileOtherTab from './MobileOtherTab'
import MobileFacilityDetail from './MobileFacilityDetail'

/**
 * (#59) モバイルシェル
 *
 * - 上部: ヘッダー + StatusBanner（全タブで共通表示。
 *   エラーはタブを離れても画面に戻ってくる）
 * - 中央: 3タブ（検索/一覧/その他）。非活性タブは hidden で
 *   アンマウントしないため、検索条件・フィルタ状態がタブ切替をまたいで保持される。
 *   (#60) MapLibre マップは検索タブ内に常設（地図モード時のみレンダリング）
 * - 下部: 下部ナビゲーション（3タブ）
 * - 施設詳細: ボトムシート（オーバーレイ。主ナビのタブではない）
 *
 * 検索完了時は結果（一覧）タブへ、エラー時は検索タブへ自動切替する。
 */
export default function MobileShell() {
  const { state, dispatch } = useApp()
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

  // 検索タブに戻ったとき: 地図の表示領域が0だったMapLibreを resize() で修正
  // （検索タブは hidden のままアンマウントされないため、戻った瞬間にサイズが古い）
  // (#60) MapLibreのresize()（旧LeafletのinvalidateSize()相当）
  useEffect(() => {
    if (tab !== 'search') return
    const map = getMapInstance()
    if (map && typeof map.resize === 'function') map.resize()
  }, [tab])

  const openDetail = (result, origin) => setDetail({ result, origin })
  const closeDetail = () => setDetail(null)

  // 詳細シートから「地図で見る」: 検索タブ（地図モード）へ移動し、
  // activeResultId 経由で MapView が施設へパンする（地図マウント前に切替を
  // 送っても、MapView側のeffectがマウント後に適用するため遅延処理不要）
  const showOnMap = (result) => {
    setDetail(null)
    if (state.searchSource !== 'map') {
      dispatch({ type: 'SET_SEARCH_SOURCE', payload: 'map' })
    }
    setTab('search')
    if (result.lat == null || result.lon == null) return
    dispatch({ type: 'SET_ACTIVE_RESULT', payload: `${result.type}/${result.id}` })
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
        <h1 className="text-sm font-semibold text-slate-800">まちデータ帳</h1>
      </header>

      <StatusBanner />

      <main className="flex-1 min-h-0 relative">
        <div className="absolute inset-0" {...panelProps('search')}>
          <MobileSearchTab
            onViewResults={() => setTab('list')}
            onMarkerClick={(r) => openDetail(r, 'map')}
          />
        </div>
        <div className="absolute inset-0" {...panelProps('list')}>
          <MobileListTab onOpenDetail={openDetail} />
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
