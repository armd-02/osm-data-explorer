/* セルフヒーリングリダイレクト（旧バンドルURLの代替ファイル）
 *
 * (#47続報) GitHub Pagesはデプロイでサイト全体を差し替えるため、旧バンドルは
 * サーバーから消える（404）。ブラウザのディスクキャッシュ（max-age=600）の
 * キャッシュされた古いHTMLが期限切れ後に旧バンドルURLをフェッチしてきた時、
 * 404の代わりにこのスクリプトを返すことで、一意query（appv）付きの最新版へ
 * 自動リダイレクトし、ページを自己回復させる。
 *
 * ループ防止（二重ガード）:
 *  1. localStorageのタイムスタンプ（__sh_last_redirect）: 直近10秒以内に
 *     リダイレクト済みなら実行しない（通常時の高速ガード）。
 *  2. URLの shn= カウ…localStorage が使えない環境（ブロックされている等）で
 *     も機能する最終ガード。shn が上限（3回）に達したらリダイレクトを停止。
 *     各リダイレクトで appv= に新しいタイムスタンプを設定するため、汚染された
 *     キャッシュキー（旧 appv 値のURLが古いHTMLを返すケース）からでも
 *     新しいキーへ逃げられる。
 *
 * 本ファイルはデプロイワークフロー（self-healing step）が自動的に
 * dist/ に配置するテンプレートでもある。
 * public/assets/ 配下の既知旧バンドル用ファイルとコード部分は同一でなければならない
 * （redirectSync.test.js が検証する）。
 */
(function () {
  var MAX_SH = 3;
  var now = Date.now();
  var p = new URLSearchParams(location.search);
  var n = parseInt(p.get('shn') || '0', 10);
  if (isNaN(n) || n >= MAX_SH) {
    console.warn('[selfheal] redirect limit reached (shn=' + n + '), stopping');
    return;
  }
  try {
    var K = '__sh_last_redirect';
    if (now - Number(localStorage.getItem(K) || 0) < 10000) return;
    localStorage.setItem(K, String(now));
  } catch (e) {
    /* localStorage 不可: shn カウンタがループガードとなる */
  }
  p.set('shn', String(n + 1));
  p.set('appv', String(now));
  location.replace(location.pathname + '?' + p.toString() + location.hash);
})();
