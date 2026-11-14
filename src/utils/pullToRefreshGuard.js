/**
 * プル・トゥ・リフレッシュ防止ガード（モバイルブラウザ対応）
 *
 * モバイルブラウザ（Android Chrome / iOS Safari / iOS Chrome など）では、
 * ページ上部で下方向に引っ張るとブラウザがページをリロードする
 * （プル・トゥ・リフレッシュ）。本アプリは検索結果・入力内容がメモリ上の
 * React state にしかないため、リロードで全部消えてしまう。
 *
 * 対策は2層:
 * 1. CSS: html/body に overscroll-behavior-y: none を指定
 *    （styles/index.css）。スクロールチェーンをドキュメントで遮断し、
 *    内部スクロール容器の上端越えがページリロードにつながらない。
 *    Android Chrome / Firefox 等ではこれで有効。
 * 2. JS: ここでのガード。iOS では CSS の overscroll-behavior が
 *    ルート要素でプル・トゥ・リフレッシュを止めない既知の問題が
 *    ある（WebKit bug 275947、未修正）ため、touch イベントで保険をかける。
 *
 * JS ガードの挙動:
 * - touchstart（1本指）で、タッチした要素の親方向に最寄りの
 *   「縦方向スクロール可能なコンテナ」を特定する（なければドキュメント）。
 * - touchmove で指が下方向（deltaY > 0）に動いていて、そのコンテナが
 *   上端（scrollTop <= 0）にある場合だけ preventDefault() する。
 * - すなわち「上端で下方向に引っ張る」= ページリロードにつながる
 *   ジェスチャのみを遮断し、通常のスクロールには一切干渉しない。
 * - コンテナの scrollTop は move ごとに実値を読むため、ジェスチャ中に
 *   コンテナが上端に到達した時点で遮断が効き始める。
 * - 多指（ピンチ等）は対象外（touches.length !== 1 で無視）。
 *
 * 地図（MapLibre canvas）やドラッグハンドルは touch-action: none により
 * ブラウザのスクロール自体が発生しないため、このガードで阻害されない。
 * （preventDefault はブラウザ既定のスクロール動作の取消のみで、
 *  アプリ側の touch 処理には影響しない）
 */

const SCROLLABLE_OVERFLOW_Y = new Set(['auto', 'scroll', 'overlay'])

/**
 * 要素が「縦方向に実際にスクロール可能なコンテナ」かを判定する。
 *
 * 計算済みの overflow-y が auto/scroll/overlay であることに加え、
 * 内容が箱を越えていること（scrollHeight > clientHeight）を要求する。
 * 後者を省くと、内容が収まっている overflow:auto 要素までが
 * コンテナとして誤認され、親コンテナへの正当なスクロールチェーンを
 * 邪魔して通常のスクロールを壊す（例: 結果が少ない時の結果枠）。
 */
export function isScrollContainer(el, win = window) {
  if (!el || el.nodeType !== 1) return false
  const style = win.getComputedStyle(el)
  const overflowY = style.overflowY
  if (!SCROLLABLE_OVERFLOW_Y.has(overflowY)) return false
  return el.scrollHeight > el.clientHeight + 1
}

/**
 * タッチ起点の要素から親方向に登り、最寄りのスクロール可能コンテナを返す。
 * 存在しなければ null（＝ジェスチャがドキュメント自体に向いている）。
 */
export function findNearestScrollContainer(target, doc = window.document, win = window) {
  let node = target
  while (node && node !== doc && node !== doc.documentElement) {
    if (isScrollContainer(node, win)) return node
    node = node.parentNode
  }
  return null
}

/**
 * 既定動作の取消（preventDefault）が必要かを判定する。
 *
 * @param {Element|null} scroller 関連するスクロールコンテナ（null = ドキュメント）
 * @param {Document} doc ドキュメント（scroller が null のとき読む）
 * @param {number} deltaY 指の縦移動量（下方向 = 正）
 * @returns {boolean} true の場合、ブラウザ既定のスクロールを取消すべき
 */
export function shouldBlockPullDown(scroller, doc, deltaY) {
  if (deltaY <= 0) return false
  const se = scroller || (doc && (doc.scrollingElement || doc.documentElement))
  if (!se) return false
  return se.scrollTop <= 0
}

/**
 * ガードを指定 window にインストールする。アンインストール関数を返す。
 *
 * ドキュメント全体に touchstart（passive）/ touchmove（non-passive）を
 * 付ける。preventDefault が使えるよう touchmove は passive: false。
 */
export function installPullToRefreshGuard(win = window) {
  const doc = win.document
  let startY = null
  let scroller = null

  const onTouchStart = (e) => {
    if (!e.touches || e.touches.length !== 1) {
      startY = null
      scroller = null
      return
    }
    startY = e.touches[0].clientY
    scroller = findNearestScrollContainer(e.target, doc, win)
  }

  const onTouchMove = (e) => {
    if (startY == null || !e.touches || e.touches.length !== 1) return
    const deltaY = e.touches[0].clientY - startY
    if (shouldBlockPullDown(scroller, doc, deltaY)) e.preventDefault()
  }

  doc.addEventListener('touchstart', onTouchStart, { passive: true })
  doc.addEventListener('touchmove', onTouchMove, { passive: false })

  return () => {
    doc.removeEventListener('touchstart', onTouchStart)
    doc.removeEventListener('touchmove', onTouchMove)
  }
}
