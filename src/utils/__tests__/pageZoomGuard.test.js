// @vitest-environment jsdom
/**
 * pageZoomGuard — ブラウザによるページ全体ズーム（ピンチイン・ピンチアウト）の防止
 *
 * - 2本以上の指の touchmove のみ preventDefault する（ページズームをブロック）
 * - 1本指の操作（スクロール・タップ）には一切干渉しない
 * - ドキュメントレベルの監視のため、タッチ起点の場所（地図外の任意の要素）に依存しない
 * - プル・トゥ・リフレッシュガード（1本指専用）と共存して競合しない
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { shouldBlockPageZoom, installPageZoomGuard } from '../pageZoomGuard'
import { installPullToRefreshGuard } from '../pullToRefreshGuard'

// ---- ヘルパー -----------------------------------------------------------

/** タッチを生成する（jsdom の TouchEvent はtouchesが素オブジェクトで動く） */
function makeTouch(target, clientX = 0, clientY = 0, identifier = 1) {
  return { identifier, target, clientX, clientY }
}

function makeTouchEvent(type, touches) {
  return new window.TouchEvent(type, { touches, bubbles: true, cancelable: true })
}

/** 要素に n 本指の touchmove を発火させる */
function dispatchPinchMove(el, n) {
  const touches = []
  for (let i = 1; i <= n; i++) touches.push(makeTouch(el, i * 10, 100, i))
  const ev = makeTouchEvent('touchmove', touches)
  el.dispatchEvent(ev)
  return ev
}

let uninstall = null
let p2rUninstall = null

beforeEach(() => {
  document.body.innerHTML = ''
  document.documentElement.scrollTop = 0
})

afterEach(() => {
  if (uninstall) {
    uninstall()
    uninstall = null
  }
  if (p2rUninstall) {
    p2rUninstall()
    p2rUninstall = null
  }
  document.body.innerHTML = ''
})

// ---- shouldBlockPageZoom ----------------------------------------------------

describe('shouldBlockPageZoom（判定ルール）', () => {
  it('2本指 → true', () => {
    expect(shouldBlockPageZoom({ touches: [{}, {}] })).toBe(true)
  })

  it('3本指以上 → true', () => {
    expect(shouldBlockPageZoom({ touches: [{}, {}, {}] })).toBe(true)
  })

  it('1本指 → false（通常のスクロール・タップ）', () => {
    expect(shouldBlockPageZoom({ touches: [{}] })).toBe(false)
  })

  it('指が離れて touches が空 → false', () => {
    expect(shouldBlockPageZoom({ touches: [] })).toBe(false)
  })

  it('touches が無い / null → false', () => {
    expect(shouldBlockPageZoom({})).toBe(false)
    expect(shouldBlockPageZoom(null)).toBe(false)
  })
})

// ---- installPageZoomGuard（統合） --------------------------------------

describe('installPageZoomGuard（touchイベント統合）', () => {
  function install() {
    uninstall = installPageZoomGuard()
  }

  function makeDiv() {
    const div = document.createElement('div')
    document.body.appendChild(div)
    return div
  }

  it('ピンチ（2本指）の touchmove → preventDefault（ページズームをブロック）', () => {
    install()
    const div = makeDiv()
    expect(dispatchPinchMove(div, 2).defaultPrevented).toBe(true)
  })

  it('3本指の touchmove → preventDefault', () => {
    install()
    const div = makeDiv()
    expect(dispatchPinchMove(div, 3).defaultPrevented).toBe(true)
  })

  it('1本指の touchmove → preventDefaultしない（通常スクロールに干渉しない）', () => {
    install()
    const div = makeDiv()
    expect(dispatchPinchMove(div, 1).defaultPrevented).toBe(false)
  })

  it('指が離れて touches が空 → preventDefaultしない', () => {
    install()
    const div = makeDiv()
    expect(dispatchPinchMove(div, 0).defaultPrevented).toBe(false)
  })

  it('深い子要素からのピンチも効く（バブルでドキュメントへ到達）', () => {
    install()
    const outer = document.createElement('div')
    const inner = document.createElement('div')
    outer.appendChild(inner)
    document.body.appendChild(outer)
    expect(dispatchPinchMove(inner, 2).defaultPrevented).toBe(true)
  })

  it('アンインストール後はブロックされない', () => {
    install()
    const div = makeDiv()
    uninstall()
    uninstall = null
    expect(dispatchPinchMove(div, 2).defaultPrevented).toBe(false)
  })

  it('プル・トゥ・リフレッシュガードと共存して競合しない', () => {
    // P2R ガードは1本指専用、本ガードは2本指以上専用
    p2rUninstall = installPullToRefreshGuard()
    install()
    const div = makeDiv()

    // 1本指で上端から下方に引っ張る → P2R ガードがブロック（本ガードは1本指に無関心）
    div.dispatchEvent(makeTouchEvent('touchstart', [makeTouch(div, 0, 100, 1)]))
    const singleMove = makeTouchEvent('touchmove', [makeTouch(div, 0, 140, 1)])
    div.dispatchEvent(singleMove)
    expect(singleMove.defaultPrevented).toBe(true)

    // ピンチ（2本指）→ 本ガードがブロック（P2R ガードは多指を無視する）
    expect(dispatchPinchMove(div, 2).defaultPrevented).toBe(true)
  })
})
