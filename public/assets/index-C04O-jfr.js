/* 旧バンドル index-C04O-jfr.js の代替（セルフヒーリングリダイレクト）
 * (#47続報) selfheal/redirect.js を参照。ブラウザキャッシュの古いHTMLが
 * キャッシュ期限切れ後にこのURLをフェッチしてきた際、一意query付きの
 * 最新版へ自動リロードしてページを自己回復させる。
 *
 * 今後のデプロイで本体バンドル名が変わったら、旧名にも同様のファイルを追加する
 * （例: public/assets/index-旧ハッシュ.js）。
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
