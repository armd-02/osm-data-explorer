import { useState, useEffect } from 'react'

/**
 * (#59) モバイル判定の幅のしきい値（px）
 *
 * 1024px 以上はPCレイアウト（現行の並列レイアウトのまま変更なし）、
 * それ未満はモバイル専用レイアウト（下部ナビゲーション）。
 * 1023.98 は Tailwind の lg ブレークポイント（1024px）と揃えるための値。
 */
export const MOBILE_MAX_WIDTH = 1023.98
export const MOBILE_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`

function getMatches() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia(MOBILE_QUERY).matches
  } catch {
    return false
  }
}

/**
 * (#59) モバイルビューポート（幅 < 1024px）かどうか
 *
 * matchMedia を使うことで、横画面への回転やキーボード表示による幅変化に追従する。
 * jsdom テストでは window.matchMedia のスタブで結果を確定できる。
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(getMatches)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    let mql
    try {
      mql = window.matchMedia(MOBILE_QUERY)
    } catch {
      return undefined
    }
    const onChange = (e) => setIsMobile(e.matches)
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    }
    if (typeof mql.addListener === 'function') {
      mql.addListener(onChange)
      return () => mql.removeListener(onChange)
    }
    return undefined
  }, [])

  return isMobile
}
