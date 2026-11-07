/* 旧バンドル index-C04O-jfr.js の代替（セルフヒーリングリダイレクト）
 *
 * (#47続報) GitHub Pagesはデプロイでサイト全体を差し替えるため、旧バンドルは
 * サーバーから消える（404）。一方、ブラウザのディスクキャッシュ（max-age=600）に
 * 旧バンドルが残っている間は、キャッシュがフレッシュの間だけ旧コードが動き続ける。
 * キャッシュの有効期限（10分）が切れた時点で、ブラウザがこのURLをサーバーに
 * 取り出しに来る。その時、404の代わりにこのリダイレクトスクリプトを返すことで、
 * ページを一意query（appv）付きの最新版へ自動的にリロードし、自動で回復させる。
 *
 * 今後のデプロイで本体バンドル名が変わったら、旧名にも同様のファイルを追加する
 * （例: public/assets/index-旧ハッシュ.js）。
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
