// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useIsMobile, MOBILE_MAX_WIDTH, MOBILE_QUERY } from '../useIsMobile'

/**
 * (#59) useIsMobile — ビューポート幅ベースのレイアウト切替フック
 * - max-width: 1023.98px（Tailwind lgブレークポイント 1024px と整合）
 * - matchMedia change イベントで追従（回転・キーボード表示）
 * - matchMedia 未対応環境ではfalse（PCレイアウトにフォールバック）
 */

let mediaMatches = true
let listeners = []

function setupMatchMedia(matches = true, supported = true) {
  mediaMatches = matches
  listeners = []
  if (!supported) {
    delete window.matchMedia
    return
  }
  window.matchMedia = (query) => ({
    matches: mediaMatches,
    media: query,
    addEventListener: (type, cb) => {
      if (type === 'change') listeners.push(cb)
    },
    removeEventListener: (type, cb) => {
      listeners = listeners.filter((l) => l !== cb)
    },
  })
}

beforeEach(() => setupMatchMedia())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  setupMatchMedia()
})

describe('useIsMobile', () => {
  it('ブレークポイント定数（1024px未満をモバイル）', () => {
    expect(MOBILE_MAX_WIDTH).toBeCloseTo(1023.98)
    expect(MOBILE_QUERY).toBe('(max-width: 1023.98px)')
  })

  it('幅<1024pxならtrue、>=1024pxならfalse', () => {
    setupMatchMedia(true)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)

    setupMatchMedia(false)
    const { result: r2 } = renderHook(() => useIsMobile())
    expect(r2.current).toBe(false)
  })

  it('matchMedia change イベントで値を追従する（回転時）', () => {
    setupMatchMedia(false) // PCスタート
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)

    // 縦→横回転で幅が1024px未満に
    act(() => {
      mediaMatches = true
      listeners.forEach((cb) => cb({ matches: true }))
    })
    expect(result.current).toBe(true)

    // 元に戻る
    act(() => {
      mediaMatches = false
      listeners.forEach((cb) => cb({ matches: false }))
    })
    expect(result.current).toBe(false)
  })

  it('リスナはアンマウント時に解除される（リークしない）', () => {
    setupMatchMedia(true)
    const { unmount } = renderHook(() => useIsMobile())
    expect(listeners.length).toBe(1)
    unmount()
    expect(listeners.length).toBe(0)
  })

  it('matchMedia未対応環境ではfalse（PCレイアウトにフォールバック）', () => {
    setupMatchMedia(true, false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })
})
