import { useRef, useState } from 'react'

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

// ドラッグ中のresizeコールバックのスロットリング間隔（毎moveでの地図
// 再描画は重いので、ドラッグ中は最大100ms毎に1回。終了時は必ず呼ぶ）
const RESIZE_THROTTLE_MS = 100

// 地図高さの永続化キー（PC・モバイルで分ける）
export const MAP_HEIGHT_STORAGE_KEY_PC = 'mapHeight.pc'
export const MAP_HEIGHT_STORAGE_KEY_MOBILE = 'mapHeight.mobile'

/**
 * 保存値を読む。不正（数値でない）・範囲外（minHeight〜maxHeight を超える）
 * なら null を返す（呼び出し側は初期値を使う）。
 * localStorage が使えない環境（プライバシーモード等）でも安全に動く。
 */
function readStored(storageKey, defaultHeight, minHeight, maxHeight) {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw == null) return null
    const n = Number(raw)
    if (!Number.isFinite(n)) return null
    if (n < minHeight || n > maxHeight) return null
    return Math.round(n)
  } catch {
    return null
  }
}

function writeStored(storageKey, height) {
  try {
    localStorage.setItem(storageKey, String(height))
  } catch {
    // 保存不可（容量・プライバシーモード等）は無視
  }
}

/**
 * コンテナの高さをドラッグで変更するためのフック（マウス・タッチ両対応）
 *
 * - Pointer Events ベース（mouse/touch で実装を分けない）
 * - height: 現在の高さ(px)。未操作かつ保存値もなければ null（呼び出し側は
 *   既定のクラス高さを使い続けるため、デフォルト表示は既存の固定高さと同一）
 * - containerStyle: 高さが数値なら既定クラスを上書きするインラインスタイル
 * - handleProps: ドラッグハンドル要素にスプレッドするprops
 *   （touch-action: none でタッチ中のページスクロールを防止、
 *    pointer capture でハンドル外れた後もドラッグを継続）
 * - storageKey（任意）: 指定するとドラッグ終了時の高さを localStorage に
 *   保存し、初回レンダリングで読み戻す。保存値が不正・範囲外なら初期値
 *   （defaultHeight）を使う。
 * - onResize（任意）: 高さ変更の通知コールバック（引数は新しい高さpx）。
 *   ドラッグ中は RESIZE_THROTTLE_MS 間隔でスロットリング、ドラッグ終了時
 *   には最終高さで必ず呼ばれる。地図描画の追随（map.resize()等）に使う。
 *
 * ドラッグ計算: 上方向ドラッグで高さを大きく、下方向で小さくする。
 * 変更後の高さは minHeight〜maxHeight の範囲に丸めてクランプされる。
 */
export function useDraggableHeight({ defaultHeight, minHeight = 160, maxHeight = 800, storageKey = null, onResize = null } = {}) {
  const [height, setHeight] = useState(() =>
    storageKey ? readStored(storageKey, defaultHeight, minHeight, maxHeight) : null
  )
  const dragRef = useRef(null)
  // 直前に適用した高さ（pointerup 時の保存に使う。state のコミットタイミング
  // に依存せず、最後の move の値を確実に保存するため）
  const lastHeightRef = useRef(null)
  const lastResizeAtRef = useRef(0)

  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startHeight: height ?? defaultHeight }
    e.currentTarget?.setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e) => {
    const drag = dragRef.current
    if (!drag) return
    const next = clamp(Math.round(drag.startHeight - (e.clientY - drag.startY)), minHeight, maxHeight)
    lastHeightRef.current = next
    setHeight(next)
    // 地図の描画追随: ドラッグ中はスロットリング（毎moveでのresizeを避ける）
    if (onResize) {
      const now = Date.now()
      if (now - lastResizeAtRef.current >= RESIZE_THROTTLE_MS) {
        lastResizeAtRef.current = now
        onResize(next)
      }
    }
  }

  const endDrag = (e) => {
    dragRef.current = null
    e.currentTarget?.releasePointerCapture?.(e.pointerId)
    if (storageKey && lastHeightRef.current != null) {
      writeStored(storageKey, lastHeightRef.current)
    }
    // ドラッグ終了時は必ず最終高さで通知（描画が確実に追いつく）
    if (onResize && lastHeightRef.current != null) {
      lastResizeAtRef.current = Date.now()
      onResize(lastHeightRef.current)
    }
  }

  const handleProps = {
    role: 'separator',
    'aria-orientation': 'horizontal',
    title: 'ドラッグで高さを変更',
    style: { touchAction: 'none', cursor: 'row-resize' },
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  }

  const containerStyle = height != null ? { height: `${height}px` } : undefined

  return { height, containerStyle, handleProps }
}

export default useDraggableHeight
