/**
 * アプリ設定
 * Overpass APIインスタンスの切り替えが可能
 */

export const OVERPASS_ENDPOINTS = {
  custom: {
    id: 'custom',
    label: 'Overpass API (armd-01)',
    url: 'https://armd-01.sakura.ne.jp/api/interpreter'
  },
  public: {
    id: 'public',
    label: 'Overpass API（公式）',
    url: 'https://overpass-api.de/api/interpreter'
  },
  // kumi.systems の後継ドメイン（OSMウィキで公式確認: "Previously known as overpass.kumi.systems"）。
  // 2026-10-28時点ではWebフロントは稼働中だがインタープリタが応答しない状態。
  // オペレータはレート制限なし・複数サーバー運用を明記しており、復旧次第フォールバック候補として機能する。
  private_coffee: {
    id: 'private_coffee',
    label: 'Overpass API (private.coffee)',
    url: 'https://overpass.private.coffee/api/interpreter'
  }
}

// デフォルトは自前プロキシ（armd-01）。#56:
// 2026-10-28 以降、自前プロキシは BBOX の有無を問わず全クエリを自前Overpassサーバーへ転送する。
// 過去の HTTP 500 はルーティング変更前の結果であり、自前Overpass本体の障害を示さない。
// （BBOXあり・BBOXなしとも 2026-10-28 に HTTP 200 で応答することを実測確認済み）
export const DEFAULT_ENDPOINT = 'custom'

// 一次エンドポイントが失敗した場合のフォールバック順（#56: 自前優先に戻す）。
// 2026-10-28 検証結果（詳細はPR説明参照）:
//   - kumi.systems: 稼働停止 → 後継ドメイン overpass.private.coffee に置換
//   - maps.mail.ru: クエリが504（バックエンド停止）→ 候補から除外
//   - overpass.osm.ch: 稼働中だがスイス限定データセット → 本アプリ（日本中心）に不適 → 除外
export const FALLBACK_ENDPOINT_ORDER = ['custom', 'public', 'private_coffee']

export const APP_CONFIG = {
  // デフォルトのOverpassエンドポイント
  overpassEndpoint: DEFAULT_ENDPOINT,

  // 検索制限
  maxResults: 5000,        // 最大表示件数
  // (#56) フォールバックの時間配分：単体試行の上限と検索全体の上限を別に設ける。
  // 旧方式（30秒を全エンドポイントで共有）では、最初の通信が30秒消費すると
  // 2回目以降の許容が1ms程度になり実用上フォールバックできない問題があった。
  totalTimeoutMs: 45000,      // 検索全体（全エンドポイント通算）の時間予算
  perAttemptTimeoutMs: 15000, // エンドポイント1件あたりの試行上限
  maxBboxAreaKm2: 40000,   // 検索禁止の面積閾値

  // キャッシュ
  cacheEnabled: true,
  cacheMaxEntries: 20,     // キャッシュ最大件数

  // Nominatim
  nominatimRateLimitMs: 1000
}

/**
 * 現在のOverpassエンドポイントURLを取得
 */
export function getOverpassUrl(endpointId) {
  const endpoint = OVERPASS_ENDPOINTS[endpointId] || OVERPASS_ENDPOINTS[DEFAULT_ENDPOINT]
  if (endpoint.id === 'custom' && !endpoint.url) {
    return OVERPASS_ENDPOINTS.public.url
  }
  return endpoint.url
}

/**
 * エンドポイントラベルを取得
 */
export function getEndpointLabel(endpointId) {
  const endpoint = OVERPASS_ENDPOINTS[endpointId] || OVERPASS_ENDPOINTS[DEFAULT_ENDPOINT]
  return endpoint.label
}
