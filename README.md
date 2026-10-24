# OSM Data Explorer

OpenStreetMapのデータを、地図・日本語カテゴリ・店舗名から検索し、一覧確認・集計・CSV/GeoJSONダウンロードができるWebツールです。

OSMのタグ構造やOverpass QLの知識がなくても使えるように設計されています。

## 機能

### 検索
- **簡単検索**: 日本語カテゴリ（20種）+ キーワード + 地名/BBOX
- **詳細検索**: OSMタグ条件（AND/OR）・存在/欠損条件
- **表記揺れ対応**: かな→ローマ字変換による部分一致検索
- **URL共有**: 検索条件をURLにエンコード・復元

### 結果確認
- 地図上のマーカ + 一覧の連動表示
- OSM ID・型・URLの確認
- 完全一致/部分一致のバッジ
- 一括照合: 店舗名リストの一括マッチング

### 分析・出力
- **集計**: 型別・タグ別・属性欠損率
- **CSV出力**: UTF-8 BOM（Excel対応）・数式注入対策
- **GeoJSON出力**: 地理情報システムで利用可能
- **照合CSV**: OSM ID・URL・一致理由付き

### OSM編集導線
- iDエディタへのリンク
- OSM Note作成の導線
- データ品質・出典・API制約の明示

## 技術スタック

| 項目 | 技術 |
|------|------|
| フレームワーク | React 18 (JavaScript) |
| ビルドツール | Vite 6 |
| 地図 | Leaflet 1.9 |
| スタイル | Tailwind CSS 4 |
| 状態管理 | React Context + useReducer |
| データソース | Overpass API / Nominatim |
| 公開 | GitHub Pages |

## セットアップ

```bash
# 依存関係のインストール
npm install

# 開発サーバー
npm run dev

# 本番ビルド
npm run build

# プレビュー
npm run preview
```

## 設定

Overpass APIエンドポイントや制限値は `src/config.js` で変更できます。

```javascript
export const APP_CONFIG = {
  overpassEndpoint: 'public',  // 'public' | 'kumi' | 'custom'
  maxResults: 5000,
  timeoutMs: 30000,
  maxBboxAreaKm2: 40000,
  cacheEnabled: true,
  cacheMaxEntries: 20,
  nominatimRateLimitMs: 1000
}
```

## プロジェクト構造

```
src/
├── App.jsx                 # メインアプリ（タブ切替・URL復元）
├── config.js               # 設定（エンドポイント・制限値）
├── components/
│   ├── Layout.jsx          # 全体レイアウト（ヘッダー・フッター）
│   ├── SearchPanel.jsx     # 検索パネル（簡単/詳細の切替）
│   ├── SimpleSearch.jsx    # 簡単検索フォーム
│   ├── AdvancedSearch.jsx  # 詳細検索フォーム
│   ├── MapView.jsx         # 地図表示（Leaflet）
│   ├── MapToolbar.jsx      # 地図ツールバー（矩形描画）
│   ├── ResultsPanel.jsx    # 検索結果一覧
│   ├── StatisticsPanel.jsx # 集計パネル（3タブ）
│   ├── BatchMatch.jsx      # 一括照合
│   ├── ExportBar.jsx       # CSV/GeoJSON出力
│   ├── EditPanel.jsx       # OSM編集導線
│   ├── AboutPanel.jsx      # データ品質・出典・制約
│   ├── ShareButton.jsx     # URL共有
│   └── StatusBanner.jsx    # 状態表示
├── context/
│   └── AppContext.js       # 状態管理Context
├── data/
│   └── categories.js       # 日本語カテゴリ定義
├── hooks/
│   ├── useMapRef.js        # 地図インスタンス共有
│   └── useSearch.js        # 検索ロジック
└── utils/
    ├── overpass.js         # Overpass API連携・クエリ生成
    ├── geo.js              # 地理計算（面積・Nominatim）
    ├── export.js           # CSV/GeoJSON出力
    ├── statistics.js       # 集計計算
    ├── batchMatch.js       # 一括照合
    └── urlState.js         # URLエンコード/デコード
```

## データ出典

- **OpenStreetMap** (© OpenStreetMap contributors)
- ライセンス: [Open Database License (ODbL)](https://www.openstreetmap.org/copyright)
- データは取得時点のスナップショットであり、現地状態と異なる場合があります

## 利用上の注意

- 検索結果が0件でも「OSMに未登録」とは限りません（表記違いの可能性）
- Overpass APIにレート制限・タイムアウトがあります
- 大量の結果や広い範囲では部分取得になる場合があります
- 出力ファイルには出典・取得日時が自動的に含まれます

## ライセンス

[MIT License](LICENSE)
