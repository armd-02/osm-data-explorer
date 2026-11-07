/* セルフヒーリングリダイレクト（旧バンドルURLの代替ファイル）
 *
 * (#47続報) GitHub Pagesはデプロイでサイト全体を差し替えるため、旧バンドルは
 * サーバーから消える（404）。ブラウザのディスクキャッシュ（max-age=600）の
 * 古いHTMLが期限切れ後に旧バンドルURLをフェッチしてきた時、404の代わりに
 * このスクリプトを返すことで、一意query（appv）付きの最新版へ自動リロードし、
 * ページを自己回復させる。
 *
 * ループ防止: 直近10秒以内にリダイレクト済みの場合（localStorageのタイムスタンプ）
 * は再リダイレクトしない。localStorageが使えない環境では従来どおり
 * 「URLにappv=が既出ならしない」判定にフォールバック。
 *
 * 本ファイルはデプロイワークフロー（self-healing step）が自動的に
 * dist/ に配置するテンプレートでもある。
 */
(function () {
  var now = Date.now();
  try {
    var K = '__sh_last_redirect';
    if (now - Number(localStorage.getItem(K) || 0) < 10000) return;
    localStorage.setItem(K, String(now));
    var p = new URLSearchParams(location.search);
    p.set('appv', String(now));
    location.replace(location.pathname + '?' + p.toString() + location.hash);
  } catch (e) {
    if (location.search.indexOf('appv=') !== -1) return;
    location.replace(location.pathname + '?appv=' + now + location.hash);
  }
})();
