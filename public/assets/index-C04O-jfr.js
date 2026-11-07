/* 旧バンドル index-C04O-jfr.js の代替（セルフヒーリングリダイレクト）
 * (#47続報) selfheal/redirect.js を参照。ブラウザキャッシュの古いHTMLが
 * キャッシュ期限切れ後にこのURLをフェッチしてきた際、一意query付きの
 * 最新版へ自動リダイレクトしてページを自己回復させる。
 * 今後のデプロイで本体バンドル名が変わったら、旧名にも同様のファイルを追加する
 * （例: public/assets/index-旧ハッシュ.js）。
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
