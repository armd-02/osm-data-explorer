/* 旧バンドル index-BhQN9WW4.js の代替（セルフヒーリングリダイレクト）
 *
 * (#47続報) 同梱の index-C04O-jfr.js を参照。デプロイでバンドル名が変わった際、
 * 旧名に対応するリダイレクトファイルを置くことで、キャッシュの古いHTMLから
 * 自動的に最新版へ回復する。
 */
(function () {
  try {
    // ループ防止: appv が既に付いているURLではリダイレクトしない
    if (location.search.indexOf('appv=') !== -1) return;
    var p = new URLSearchParams(location.search);
    p.set('appv', String(Date.now()));
    location.replace(location.pathname + '?' + p.toString() + location.hash);
  } catch (e) {
    if (location.search.indexOf('appv=') !== -1) return;
    location.replace(location.pathname + '?appv=' + Date.now() + location.hash);
  }
})();
