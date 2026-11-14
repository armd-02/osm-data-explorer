/**
 * ページズーム防止ガード（モバイルブラウザ対応）
 *
 * モバイルブラウザ（Android Chrome / iOS Safari など）では、地図以外のエリア
 * （ヘッダー・検索フォーム・結果一覧・下部ナビなど）でピンチイン・ピンチアウト
 * （2本指ピンチ）すると、地図ではなくページ全体が拡大・縮小されてレイアウトが
 * 崩れてしまう。本アプリの地図（MapLibre）はピンチズームを自前のJSで処理する
 * ので、ページレベルのズームは有害でしかない。
 *
 * 対策は2層（#61の pullToRefreshGuard と同じ考え方）:
 * 1. CSS: html/body に touch-action: pan-x pan-y を指定（styles/index.css）。
 *    ページ全体のネイティブピンチズーム・ダブルタップズームを無効化し、
 *    1本指のパンスクロールは維持する。現行ブラウザ（Chrome / iOS 13以降の
 *    Safari など）はこれで対応できる。
 * 2. JS: ここでのガード。touch-action をサポートしないブラウザ
 *    （iOS 12以前など）でも touch イベントでページズームを止める。
 *
 * JS ガードの挙動:
 * - touchmove（non-passive）をドキュメント全体で監視する。
 * - 画面に2本以上の指があるとき（touches.length >= 2、ピンチ等）のみ
 *   preventDefault() してブラウザ既定のページズームを取消する。
 *
 * 地図のピンチズームを壊さない理由:
 * - MapLibre の自前タッチハンドラは地図キャンバス側（ターゲット要素）に
 *   あり、このドキュメントレベルのハンドラ（バブル段階）より先に実行される。
 *   preventDefault はブラウザ既定のページズーム動作の取消のみで、
 *   アプリ側JSが処理する地図ズームには影響しない。
 * - 1本指の操作（スクロール・タップ）は対象外（touches.length < 2）。
 *   なお touchmove の preventDefault はタップ・クリックの生成を妨げない。
 */

/**
 * ブラウザ既定動作（ページズーム）の取消が必要かを判定する。
 *
 * @param {TouchEvent} e タッチイベント
 * @returns {boolean} 画面に2本以上の指がある（ピンチ等）場合 true
 */
export function shouldBlockPageZoom(e) {
  return !!e && !!e.touches && e.touches.length >= 2
}

/**
 * ガードを指定 window にインストールする。アンインストール関数を返す。
 *
 * ドキュメント全体に touchmove（non-passive）を付ける。
 * preventDefault が使えるよう passive: false を指定する。
 */
export function installPageZoomGuard(win = window) {
  const doc = win.document

  const onTouchMove = (e) => {
    if (shouldBlockPageZoom(e)) e.preventDefault()
  }

  doc.addEventListener('touchmove', onTouchMove, { passive: false })

  return () => {
    doc.removeEventListener('touchmove', onTouchMove)
  }
}
