/* 旧バンドル index-BhQN9WW4.js の代替（セルフヒーリングリダイレクト）
 * (#47続報) 同梱の index-C04O-jfr.js / selfheal/redirect.js を参照。
 * デプロイでバンドル名が変わった際、旧名に対応するリダイレクトファイルを置くことで、
 * キャッシュの古いHTMLから自動的に最新版へ回復する。
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
