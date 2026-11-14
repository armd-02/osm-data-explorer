// @vitest-environment jsdom
/**
 * pullToRefreshGuard — モバイルブラウザのプル・トゥ・リフレッシュ防止
 *
 * 上端（scrollTop <= 0）で下方向に引っ張るジェスチャのみ preventDefault し、
 * 通常のスクロールには干渉しない、ことを検証する。
 *
 * jsdom にはレイアウト計算がない（scrollHeight/clientHeight は常に0）ため、
 * スクロール可能なコンテナをテストでは defineProperty で擬似する。
 * getComputedStyle はインラインstyleを解決するため overflow-y の判定はそのまま使える。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  isScrollContainer,
  findNearestScrollContainer,
  shouldBlockPullDown,
  installPullToRefreshGuard,
} from '../pullToRefreshGuard'

// ---- ヘルパー -----------------------------------------------------------

/** スクロール可能コンテナを擬似する div を生成する */
function makeScrollableDiv({ scrollTop = 0, scrollHeight = 500, clientHeight = 200, parent = document.body } = {}) {
  const div = document.createElement('div')
  div.style.overflowY = 'auto'
  parent.appendChild(div)
  Object.defineProperty(div, 'scrollHeight', { value: scrollHeight })
  Object.defineProperty(div, 'clientHeight', { value: clientHeight })
  div.scrollTop = scrollTop
  return div
}

/** タッチイベントを生成する（jsdom の TouchEvent はtouchesが素オブジェクトで動く） */
function makeTouch(target, clientY, identifier = 1) {
  return { identifier, target, clientX: 0, clientY }
}

function makeTouchEvent(type, touches) {
  return new window.TouchEvent(type, { touches, bubbles: true, cancelable: true })
}

/** 要素にtouchstart/touchmoveを発火させる */
function touchOn(el, clientY, identifier = 1) {
  const startEv = makeTouchEvent('touchstart', [makeTouch(el, clientY, identifier)])
  el.dispatchEvent(startEv)
  return startEv
}

function moveOn(el, clientY, identifier = 1) {
  const moveEv = makeTouchEvent('touchmove', [makeTouch(el, clientY, identifier)])
  el.dispatchEvent(moveEv)
  return moveEv
}

let uninstall = null

beforeEach(() => {
  document.body.innerHTML = ''
  document.documentElement.scrollTop = 0
})

afterEach(() => {
  if (uninstall) {
    uninstall()
    uninstall = null
  }
  document.body.innerHTML = ''
})

// ---- isScrollContainer ----------------------------------------------------

describe('isScrollContainer', () => {
  it('overflow-y: auto で内容がはみ出している → true', () => {
    const div = makeScrollableDiv({ scrollHeight: 500, clientHeight: 200 })
    expect(isScrollContainer(div)).toBe(true)
  })

  it('overflow-y: auto でも内容が収まっている → false（親へのチェーンを邪魔しない）', () => {
    const div = makeScrollableDiv({ scrollHeight: 200, clientHeight: 200 })
    expect(isScrollContainer(div)).toBe(false)
  })

  it('overflow-y が visible/hidden → false', () => {
    const div = document.createElement('div')
    div.style.overflowY = 'visible'
    document.body.appendChild(div)
    Object.defineProperty(div, 'scrollHeight', { value: 500 })
    Object.defineProperty(div, 'clientHeight', { value: 200 })
    expect(isScrollContainer(div)).toBe(false)

    div.style.overflowY = 'hidden'
    expect(isScrollContainer(div)).toBe(false)
  })

  it('テキストノード・null → false', () => {
    expect(isScrollContainer(null)).toBe(false)
    expect(isScrollContainer(document.createTextNode('x'))).toBe(false)
  })
})

// ---- findNearestScrollContainer -------------------------------------------

describe('findNearestScrollContainer', () => {
  it('スクロール可能div内の要素 → そのdivを返す', () => {
    const scroller = makeScrollableDiv()
    const inner = document.createElement('div')
    scroller.appendChild(inner)
    expect(findNearestScrollContainer(inner)).toBe(scroller)
  })

  it('ネスト時は最寄り（内側）のコンテナを返す', () => {
    const outer = makeScrollableDiv()
    const inner = makeScrollableDiv({ parent: outer })
    const leaf = document.createElement('div')
    inner.appendChild(leaf)
    expect(findNearestScrollContainer(leaf)).toBe(inner)
  })

  it('内容が収まっているoverflow:auto要素は素通りして親を探す', () => {
    const real = makeScrollableDiv()
    const nonScrolling = makeScrollableDiv({ scrollHeight: 200, clientHeight: 200, parent: real })
    const leaf = document.createElement('div')
    nonScrolling.appendChild(leaf)
    expect(findNearestScrollContainer(leaf)).toBe(real)
  })

  it('スクロール可能コンテナがなければ null（＝ドキュメントに向く）', () => {
    const plain = document.createElement('div')
    document.body.appendChild(plain)
    expect(findNearestScrollContainer(plain)).toBeNull()
  })
})

// ---- shouldBlockPullDown ----------------------------------------------------

describe('shouldBlockPullDown（判定ルール）', () => {
  const atTop = { scrollTop: 0 }
  const belowTop = { scrollTop: 120 }

  it('下方向（deltaY > 0）＋ 上端 → true', () => {
    expect(shouldBlockPullDown(atTop, document, 40)).toBe(true)
  })

  it('下方向だがコンテナが上端でない（scrollTop > 0） → false（吸収可能なので通常スクロール）', () => {
    expect(shouldBlockPullDown(belowTop, document, 40)).toBe(false)
  })

  it('上方向（deltaY < 0） → false', () => {
    expect(shouldBlockPullDown(atTop, document, -40)).toBe(false)
  })

  it('移動なし（deltaY = 0） → false', () => {
    expect(shouldBlockPullDown(atTop, document, 0)).toBe(false)
  })

  it('scroller=null（ドキュメント）: document上端＋下方向 → true', () => {
    document.documentElement.scrollTop = 0
    expect(shouldBlockPullDown(null, document, 40)).toBe(true)
  })

  it('scroller=null（ドキュメント）: documentが上端でない → false', () => {
    document.documentElement.scrollTop = 100
    expect(shouldBlockPullDown(null, document, 40)).toBe(false)
  })
})

// ---- installPullToRefreshGuard（統合） --------------------------------------

describe('installPullToRefreshGuard（touchイベント統合）', () => {
  function install() {
    uninstall = installPullToRefreshGuard()
  }

  it('上端のコンテナ内で下方向に引っ張る → preventDefault（P2Rをブロック）', () => {
    install()
    const scroller = makeScrollableDiv({ scrollTop: 0 })
    const inner = document.createElement('div')
    scroller.appendChild(inner)

    touchOn(inner, 100)
    const ev = moveOn(inner, 140) // 40px下
    expect(ev.defaultPrevented).toBe(true)
  })

  it('コンテナが上端でない（scrollTop > 0）→ 下方向でも通常スクロール（preventDefaultしない）', () => {
    install()
    const scroller = makeScrollableDiv({ scrollTop: 100 })
    touchOn(scroller, 100)
    const ev = moveOn(scroller, 140)
    expect(ev.defaultPrevented).toBe(false)
  })

  it('上方向の移動 → preventDefaultしない', () => {
    install()
    const scroller = makeScrollableDiv({ scrollTop: 0 })
    touchOn(scroller, 140)
    const ev = moveOn(scroller, 100) // 上方向
    expect(ev.defaultPrevented).toBe(false)
  })

  it('ジェスチャ中にコンテナが上端に到達すると、以降の下方移動はブロックされる（scrollTopを実値で読む）', () => {
    install()
    const scroller = makeScrollableDiv({ scrollTop: 100 })
    touchOn(scroller, 100)
    const ev1 = moveOn(scroller, 120) // 上端ではない → 通行
    expect(ev1.defaultPrevented).toBe(false)

    scroller.scrollTop = 0 // 慣性スクロール等で上端に到達
    const ev2 = moveOn(scroller, 140) // さらに下方 → ブロック
    expect(ev2.defaultPrevented).toBe(true)
  })

  it('スクロール可能コンテナの外（非スクロール領域）で下方に引っ張る → ドキュメント上端ならブロック', () => {
    install()
    const plain = document.createElement('div')
    document.body.appendChild(plain)
    document.documentElement.scrollTop = 0

    touchOn(plain, 100)
    const ev = moveOn(plain, 140)
    expect(ev.defaultPrevented).toBe(true)
  })

  it('ドキュメントが上端でない場合はブロックしない（ページがスクロール可能なら通常通り）', () => {
    install()
    const plain = document.createElement('div')
    document.body.appendChild(plain)
    document.documentElement.scrollTop = 50

    touchOn(plain, 100)
    const ev = moveOn(plain, 140)
    expect(ev.defaultPrevented).toBe(false)
  })

  it('多指（ピンチ等）は無視する', () => {
    install()
    const scroller = makeScrollableDiv({ scrollTop: 0 })
    // 2本指のtouchstart
    const startEv = makeTouchEvent('touchstart', [
      makeTouch(scroller, 100, 1),
      makeTouch(scroller, 110, 2),
    ])
    scroller.dispatchEvent(startEv)
    const moveEv = makeTouchEvent('touchmove', [
      makeTouch(scroller, 140, 1),
      makeTouch(scroller, 150, 2),
    ])
    scroller.dispatchEvent(moveEv)
    expect(moveEv.defaultPrevented).toBe(false)
  })

  it('touchstartなしのtouchmoveは無視する', () => {
    install()
    const scroller = makeScrollableDiv({ scrollTop: 0 })
    const ev = moveOn(scroller, 140)
    expect(ev.defaultPrevented).toBe(false)
  })

  it('アンインストール後はブロックされない', () => {
    install()
    const scroller = makeScrollableDiv({ scrollTop: 0 })
    uninstall()
    uninstall = null

    touchOn(scroller, 100)
    const ev = moveOn(scroller, 140)
    expect(ev.defaultPrevented).toBe(false)
  })
})
