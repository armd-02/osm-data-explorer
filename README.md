# OSM Data Explorer

**街に何があるのかを、誰でも探して、一覧で確認し、必要な情報を持ち帰れる**ことを目指すWebサービスです。

地図・地域・施設名・日本語カテゴリからOpenStreetMap（OSM）由来の施設を検索し、登録されている住所・公式サイトなどの確認、絞り込み、CSV/GeoJSONダウンロードができます。利用者にOSMタグやOverpass QLの知識は要求しません。

- **主な利用者**：地域住民、街歩き・イベントの企画者、地域団体、学校、地域情報の制作者など。
- **基本の使い方**：街を選ぶ → 店舗・施設を一覧で見る → 名称・種類などで絞る → 公式サイトを開く／CSVで持ち帰る。
- **補助機能**：手元の店名リストをOSMの候補と照合し、確認した店の緯度・経度をCSVに付ける。
- **OSMの位置付け**：利用者が意識するのは出典・ライセンス表記など必要な場面のみ。掲載情報が現実の施設を網羅するとは限りません。

**[サイトを開く](https://armd-02.github.io/osm-data-explorer/)** · **[ロードマップIssue #16](https://github.com/armd-02/osm-data-explorer/issues/16)**

## 開発ロードマップ（2026年10月26日時点）

完成済みの実装と、実際のイベントで使用可能なことの検証は区別しています。M0を優先し、地域ポータルは将来構想とします。

| 段階 | 優先する成果 | 状態 |
| --- | --- | --- |
| **M0：店名→座標付きCSV** | 2026年11月の「ひがよどアートフェス」向けオンラインマップ用。店名一覧から候補を確認・確定し、座標・OSM ID付きCSVを出力 | **実装・公開済み**。実際の店舗名簿での受け入れ確認が必要（[#42](https://github.com/armd-02/osm-data-explorer/issues/42)） |
| **M1：自治体別施設検索** | 都道府県→基礎自治体を選び、**自治体BBOX**で店舗・施設の一覧を取得。地図の表示範囲から検索する機能も残す | **次の開発対象**（[#44](https://github.com/armd-02/osm-data-explorer/issues/44)） |
| **M1.1：行政区域内検索** | Overpassのareaデータが利用可能になった後、自治体境界に従って検索する | **環境整備後**。M1の完成を待たせない |
| **M2：Wikidata連携** | OSMの`wikidata`タグなどを手掛かりに、Wikidata、Wikipedia、Wikimedia Commonsの関連情報・写真へつなぐ | 将来構想 |
| **M3：街ごとのポータル** | 市区町村・駅周辺などの地域ページを固定URLで提供。施設一覧は定期更新を検討 | 将来構想 |
| **M4：地域住民による情報追加** | LocalWikiのように紹介文・歴史・写真等を編集できるようにし、基本情報はOSMと同期 | 将来構想 |

### M1の検索範囲と自治体データ

自治体名・自治体コード・行政界のOSM relation ID・BBOXは、既存の[OSM Japan Changesの自治体GeoJSON](https://github.com/K-Sakanoshita/osm-japan-changes/blob/main/public/data/municipalities.min.geojson)を基にした軽量な選択用JSONとして利用する計画です。自治体選択時に毎回Overpass APIから境界を取得する必要はありません。

M1では**「自治体を選ぶ」と「検索に使うBBOX」を分離**します。選択した自治体のBBOXを直接検索条件とし、地図に`fitBounds`した後の表示範囲で置き換えません。地図から検索するモードでは、従来どおり「検索する」を押した時点の表示範囲を使います。

**BBOXは行政区域そのものではありません。** 隣接自治体の施設も含まれます。離島を含む自治体などは検索範囲が過大になることがあります。armd-01のOverpassには現在areaデータが未生成のため、M1ではarea検索を前提とせず、生成後のM1.1で対応します。検索は店舗・公共施設などのPOIを中心とし、道路・建物などを無条件に全件取得しないようにします。

### 将来の地域ポータルとWikidata

目指すのは**「何も編集しなくても基本情報が掲載され、地元の人が編集するほど街の情報が豊かになるポータル」**です。施設の名称・場所・公式サイトなどの基本項目はOSMから更新し、地域固有の紹介・歴史・写真は別データとして保持します。Wikidata QIDは、明示的に対応付いた施設を中心に利用し、名前の一致だけで自動紐付けしません。

長期的には独自の施設IDとOSM型・IDとの紐付け履歴を持ち、閉店した施設を通常の一覧から除外しつつ、地域の記録や編集履歴を残す構造を検討します。**OSMの検索結果から消えただけで閉店と断定しない**方針です。

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
- **店名リスト→座標付きCSV**: 確認済みの店舗について緯度・経度、OSM型とIDを含む地図作成用CSVを出力

### 分析・出力
- **集計**: 型別・タグ別・属性欠損率
- **CSV出力**: UTF-8 BOM（Excel対応）・数式注入対策
- **GeoJSON出力**: 地理情報システムで利用可能
- **照合CSV**: OSM ID・URL・一致理由付き

### OSM編集導線
- iDエディタへのリンク
- OSM Note作成の導線
- データ品質・出典・API制約の明示

## M0：店名リストから座標付きCSVを作る（2026年11月「ひがよどアートフェス」向け）

1. 「施設検索」で対象地域を表示し、カフェや店舗など必要な種類の施設を検索する。
2. 「店名→座標CSV」へ移動し、1行1店舗名を貼り付けるか、CSV/TSVを読み込む。
3. 「照合」で候補一覧を作り、候補の位置を地図で確認して「確定」を押す。
4. 「地図用CSV」をクリックして `name,lat,lon,status,matched_name,osm_type,osm_id,osm_url,source` をダウンロードする。

> 現在のM0実装は、**先に対象地域の施設をOverpassで検索する方式**です。店名リストだけを渡すと全国から自動探索する機能ではありません。実際の祭り用名簿を使った全工程のブラウザ検証は[#42](https://github.com/armd-02/osm-data-explorer/issues/42)で管理します。

**誤った地図ピンを避けるため、未確認候補や候補なしの行は座標・OSM IDを空欄のまま出力します。** CSVは入力行の順序を保持します。地図へインポートする場合は、`status=確認済み` の行だけを利用してください。way/relationの位置は代表座標であり、入口の位置を保証するものではありません。

地図にOSM由来データを使用する場合は、地図等にOpenStreetMap contributorsへの帰属表示を行い、ODbLの条件を確認してください。

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
npm ci

# 開発サーバー
npm run dev

# テスト
npm test

# 本番ビルド
npm run build

# プレビュー
npm run preview
```

## 設定

Overpass APIエンドポイントや制限値は `src/config.js` で変更できます。

```javascript
export const APP_CONFIG = {
  overpassEndpoint: 'custom', // 現在の既定値。'public' | 'kumi' | 'custom'
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
    ├── locationCsv.js       # 地図制作用の座標付きCSV
    ├── searchBbox.js        # 地図BBOX解決
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
