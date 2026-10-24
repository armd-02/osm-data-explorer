# OSM Data Explorer

OpenStreetMap（OSM）のデータを、GISの知識がなくても検索・集計・ダウンロードできる日本語ウェブツールです。

## 目的

OSMやGISに詳しくない人でも直感的に使える、日本語を基本とした検索・集計サイトです。
十三アートフェスの店舗探しのほか、一般的なOSMデータ調査にも利用できます。

## 機能

- **かんたん検索**: カテゴリ選択 + キーワードでOSMデータを検索
- **詳細検索**: OSMタグ条件（AND/OR/存在/欠損）を指定して精密検索
- **地図連動**: 検索結果を地図上に表示、一覧と連動
- **範囲指定**: 地図の表示範囲（BBOX）で検索範囲を決定
- **集計**: 結果の件数・種別・属性欠損のサマリー表示
- **ダウンロード**: CSV / GeoJSON形式でのエクスポート（開発中）

## 開発方法

### 環境要件
- Node.js 18以上
- npm

### セットアップ

```bash
git clone https://github.com/armd-02/osm-data-explorer.git
cd osm-data-explorer
npm install
```

### 開発サーバー起動

```bash
npm run dev
```

ブラウザで http://localhost:5173 が開きます。

### 本番ビルド

```bash
npm run build
```

`dist/` ディレクトリに静的ファイルが出力されます。

### プレビュー

```bash
npm run preview
```

## GitHub Pages 公開

本プロジェクトはGitHub Pagesで公開されます。

1. リポジトリの Settings → Pages でソースを `main` ブランチの `/dist` に設定
2. CI（GitHub Actions）で `npm run build` を実行し `dist/` をデプロイ
3. 公開URL: https://armd-02.github.io/osm-data-explorer/

## 技術スタック

| 項目 | 技術 |
|------|------|
| フレームワーク | React 18 |
| ビルドツール | Vite 6 |
| スタイル | Tailwind CSS 4 |
| 地図 | Leaflet |
| データソース | Overpass API |
| 公開 | GitHub Pages（静的フロントエンド） |

## データ出典

- 地図タイル: © OpenStreetMap contributors
- OSMデータ: OpenStreetMap (ODbLライセンス)
- Overpass API: https://overpass-api.de/

## ライセンス

[LICENSE](./LICENSE) を参照してください。
