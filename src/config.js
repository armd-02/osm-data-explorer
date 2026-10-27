/**
 * アプリ設定
 * Overpass APIインスタンスの切り替えが可能
 */

export const OVERPASS_ENDPOINTS = {
  public: {
    id: 'public',
    label: 'Overpass API（公式）',
    url: 'https://overpass-api.de/api/interpreter',
    timeout: 30000
  },
  kumi: {
    id: 'kumi',
    label: 'Overpass API (kumi.systems)',
    url: 'https://overpass.kumi.systems/api/interpreter',
    timeout: 30000
  },
  custom: {
    id: 'custom',
    label: 'Overpass API (armd-01)',
    url: 'https://armd-01.sakura.ne.jp/api/interpreter',
    timeout: 30000
  }
}

// デフォルトは公式インスタンス（#52: armd-01インスタンスが500エラーを返すようになったため。
// 旧デフォルトのcustomはフォールバックチェーンの末尾に移動）
export const DEFAULT_ENDPOINT = 'public'

// 一次エンドポイントが失敗した場合のフォールバック順（#52）
export const FALLBACK_ENDPOINT_ORDER = ['public', 'kumi', 'custom']

export const APP_CONFIG = {
  // デフォルトのOverpassエンドポイント
  overpassEndpoint: DEFAULT_ENDPOINT,

  // 検索制限
  maxResults: 5000,        // 最大表示件数
  timeoutMs: 30000,        // デフォルトタイムアウト
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
