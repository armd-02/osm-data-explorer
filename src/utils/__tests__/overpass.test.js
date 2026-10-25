/**
 * executeOverpassQuery の回帰テスト（Issue #17 の完了条件）
 *  - 正常応答
 *  - 空結果
 *  - 429 レート制限
 *  - timeout
 *  - キャッシュキーがエンドポイントを区別する（別インスタンスの混同を防ぐ）
 *
 * fetch をモックし、ネットワークなしで応答シナリオを検証する。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { executeOverpassQuery, clearCache, parseOverpassResponse } from '../overpass'
import { getEndpointLabel } from '../../config'

// ---------- モックヘルパー ----------
function mockResponse({ status = 200, ok = status < 400, body = {}, headers = {} }) {
  return {
    status,
    ok,
    headers: {
      get: (name) => {
        const key = Object.keys(headers).find((k) => k.toLowerCase() === String(name).toLowerCase())
        return key ? headers[key] : null
      }
    },
    json: async () => body
  }
}

function overpassPayload(elements) {
  return {
    version: 0.6,
    generator: 'Overpass API 0.7.62',
    osm3s: { timestamp_osm_base: '2026-10-24T00:00:00Z' },
    elements
  }
}

// ハングする fetch：signal の abort でのみ reject する（timeout 再現用）
function hangingFetch() {
  return vi.fn((_url, opts) => new Promise((_resolve, reject) => {
    opts.signal.addEventListener('abort', () => {
      reject(new DOMException('The operation was aborted', 'AbortError'))
    })
  }))
}

const QUERY = '[out:json][timeout:25]node[amenity=bank](35.676,139.748,35.678,139.750);out;'

// ---------- テスト ----------
describe('executeOverpassQuery', () => {
  beforeEach(() => {
    clearCache()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('正常応答: 結果と取得メタデータを返す', async () => {
    const payload = overpassPayload([
      { type: 'node', id: 1, lat: 35.68, lon: 139.77, tags: { amenity: 'bank', name: 'テスト銀行' } },
      { type: 'way', id: 2, tags: { amenity: 'cafe' }, center: { lat: 35.69, lon: 139.78 }, nodes: [1] }
    ])
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse({ body: payload })))

    const { results, meta } = await executeOverpassQuery(QUERY, { endpoint: 'custom' })

    expect(results).toHaveLength(2)
    expect(results[0].type).toBe('node')
    expect(results[0].id).toBe(1)
    expect(results[1].type).toBe('way')
    expect(meta.cached).toBe(false)
    expect(meta.elementCount).toBe(2)
    expect(meta.endpoint).toBe(getEndpointLabel('custom'))
  })

  it('空結果: results が空配列で meta.empty が true', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse({ body: overpassPayload([]) })))

    const { results, meta } = await executeOverpassQuery(QUERY, { endpoint: 'custom' })

    expect(results).toEqual([])
    expect(meta.empty).toBe(true)
    expect(meta.elementCount).toBe(0)
  })

  it('429: レート制限エラーを送出する (type=rate_limit)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse({
      status: 429, ok: false, body: null, headers: { 'Retry-After': '7' }
    })))

    await expect(
      executeOverpassQuery(QUERY, { endpoint: 'custom' })
    ).rejects.toMatchObject({ type: 'rate_limit' })
  })

  it('timeout: ハングした要求はタイムアウトエラー (type=timeout)', async () => {
    vi.stubGlobal('fetch', hangingFetch())

    await expect(
      executeOverpassQuery(QUERY, { endpoint: 'custom', timeout: 20 })
    ).rejects.toMatchObject({ type: 'timeout' })
  })
})

describe('キャッシュキーのエンドポイント区別（Issue #17 完了条件）', () => {
  beforeEach(() => {
    clearCache()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('別エンドポイントで同じ query でもキャッシュを共有しない', async () => {
    // custom で検索 → その結果が custom::QUERY でキャッシュされる
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse({
      body: overpassPayload([{ type: 'node', id: 100, tags: { name: 'CustomBank' } }])
    })))
    const first = await executeOverpassQuery(QUERY, { endpoint: 'custom' })
    expect(first.results[0].id).toBe(100)
    expect(first.meta.cached).toBe(false)

    // public で同じ query → custom のキャッシュを踏まず、fetch が再実行される
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse({
      body: overpassPayload([{ type: 'node', id: 200, tags: { name: 'PublicBank' } }])
    })))
    const second = await executeOverpassQuery(QUERY, { endpoint: 'public' })

    expect(second.results[0].id).toBe(200)      // public の結果（custom の id=100 ではない）
    expect(second.meta.cached).toBe(false)       // キャッシュ未命中
    expect(second.meta.endpoint).toBe(getEndpointLabel('public'))

    // 同じエンドポイント+query ならキャッシュ命中する（正しく機能している証拠）
    const third = await executeOverpassQuery(QUERY, { endpoint: 'public' })
    expect(third.meta.cached).toBe(true)
    expect(third.results[0].id).toBe(200)
  })
})

describe('parseOverpassResponse: タグ無しノードの除外', () => {
  it('タグが空のnode（匿名ノード）を除外する', () => {
    const data = overpassPayload([
      { type: 'node', id: 368238913, lat: 35.69, lon: 139.77, tags: {} },  // 匿名ノード
      { type: 'node', id: 111, lat: 35.70, lon: 139.78, tags: { name: 'Cafe A', amenity: 'cafe' } },  // 通常ノード
      { type: 'way', id: 222, center: { lat: 35.71, lon: 139.79 }, tags: { name: 'Road X' }, nodes: [368238913, 111] },  // Way
    ])
    const results = parseOverpassResponse(data)
    // 匿名ノード(id=368238913)は除外される
    expect(results.find(r => r.id === 368238913)).toBeUndefined()
    // タグありノードとWayは残る
    expect(results.find(r => r.id === 111)).toBeDefined()
    expect(results.find(r => r.id === 222)).toBeDefined()
    expect(results.length).toBe(2)
  })

  it('タグが空のnodeのみで構成されるレスポンスは空配列を返す', () => {
    const data = overpassPayload([
      { type: 'node', id: 1, lat: 35.0, lon: 139.0, tags: {} },
      { type: 'node', id: 2, lat: 35.1, lon: 139.1, tags: {} },
    ])
    const results = parseOverpassResponse(data)
    expect(results).toEqual([])
  })

  it('タグありノードは正常に保持される', () => {
    const data = overpassPayload([
      { type: 'node', id: 1, lat: 35.0, lon: 139.0, tags: { highway: 'bus_stop' } },
    ])
    const results = parseOverpassResponse(data)
    expect(results.length).toBe(1)
    expect(results[0].id).toBe(1)
    expect(results[0].tags.highway).toBe('bus_stop')
  })
})
