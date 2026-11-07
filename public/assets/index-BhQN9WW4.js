/* 旧バンドル index-BhQN9WW4.js の代替（セルフヒーリングリダイレクト）
 * (#47続報) 同梱の index-C04O-jfr.js / selfheal/redirect.js を参照。
 * デプロイでバンドル名が変わった際、旧名に対応するリダイレクトファイルを置くことで、
 * キャッシュの古いHTMLから自動的に最新版へ回復する。
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
