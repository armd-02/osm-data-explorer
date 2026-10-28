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
import { executeOverpassQuery, clearCache, parseOverpassResponse, buildSimpleQuery, buildPoiQuery } from '../overpass'
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

describe('エンドポイント自動フォールバック（#52: 一次ミラー停止時の対処）', () => {
  beforeEach(() => {
    clearCache()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('500: 一次エンドポイント失敗時に自動で次のエンドポイントにフォールバックする', async () => {
    const payload = overpassPayload([
      { type: 'node', id: 1, lat: 35.68, lon: 139.77, tags: { amenity: 'bank', name: 'フォールバック銀行' } }
    ])
    const fetchMock = vi.fn(async (url) => {
      // custom (armd-01.sakura.ne.jp) が500、その次が正常応答
      if (String(url).includes('sakura')) {
        return mockResponse({ status: 500, ok: false, body: { error: 'Internal server error' } })
      }
      return mockResponse({ body: payload })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { results, meta } = await executeOverpassQuery(QUERY, { endpoint: 'custom' })

    expect(results).toHaveLength(1)
    expect(meta.endpoint).toBe(getEndpointLabel('public'))  // public にフォールバックした
    expect(meta.fallback).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('429: レート制限時もフォールバックし、全エンドポイント429ならrate_limitエラー', async () => {
    const fetchMock = vi.fn(async () => mockResponse({
      status: 429, ok: false, body: null, headers: { 'Retry-After': '7' }
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      executeOverpassQuery(QUERY, { endpoint: 'custom' })
    ).rejects.toMatchObject({ type: 'rate_limit' })
    // custom → public → private_coffee の3回すべて試行される（#56: kumiは稼働停止のため後継ドメインに置換）
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('クエリエラー(invalid_query)時はフォールバックしない', async () => {
    const fetchMock = vi.fn(async () => mockResponse({
      body: { version: 0.6, remark: 'syntax error line 1' }
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      executeOverpassQuery(QUERY, { endpoint: 'custom' })
    ).rejects.toMatchObject({ type: 'invalid_query' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('キャンセル済みシグナルの場合は要求せずキャンセルとして終了する', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      executeOverpassQuery(QUERY, { endpoint: 'custom', signal: controller.signal })
    ).rejects.toMatchObject({ type: 'network' })
    expect(fetchMock).not.toHaveBeenCalled()
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

// ---------- (#54) cuisineフィルタのクエリ組み込み ----------
const TEST_BBOX = { south: 34.0, west: 135.0, north: 34.1, east: 135.2 }

describe('cuisineフィルタ（#54: 施設の種類と料理の分離）', () => {
  it('単一カテゴリ（レストラン）+ ラーメン: [amenity=restaurant][cuisine=ramen] がAND連結される', () => {
    const { query } = buildSimpleQuery(TEST_BBOX, 'restaurant', '', 'ramen')
    expect(query).toContain('[amenity=restaurant][cuisine=ramen](')
  })

  it('複数値ORカテゴリ（飲食店）+ cuisine: unionブランチ末尾に[cuisine=X]がAND連結される', () => {
    const { query } = buildSimpleQuery(TEST_BBOX, 'food_drink', '', 'sushi')
    // 8値は1つの正規表現フィルタに統合 → node/way/relation の3ブランチにcuisineがAND連結
    const count = (query.match(/\[cuisine=sushi\]/g) || []).length
    expect(count).toBe(3)
    expect(query).toContain('[amenity~"^(cafe|restaurant|fast_food|bar|pub|izakaya|sushi|food_court)$"][cuisine=sushi](')
  })

  it('3値ORカテゴリ（バー・居酒屋）+ cuisine: 各ブランチに連結される', () => {
    const { query } = buildSimpleQuery(TEST_BBOX, 'bar_izakaya', '', 'ramen')
    expect(query).toContain('[amenity~"^(bar|pub|izakaya)$"][cuisine=ramen](')
  })

  it('自治体POIクエリでも同じくcuisineがAND連結される', () => {
    const { query } = buildPoiQuery(TEST_BBOX, 'restaurant', '', 'udon')
    expect(query).toContain('[amenity=restaurant][cuisine=udon](')
  })

  it('カテゴリ未指定時はcuisineを無視する（全要素取得を維持）', () => {
    const { query } = buildSimpleQuery(TEST_BBOX, '', '', 'ramen')
    expect(query).not.toContain('cuisine')
    expect(query).toContain('node(34.000000,135.000000,34.100000,135.200000)')
  })

  it('非飲食カテゴリ（薬局）+ cuisine: 無視される（cuisineは飲食カテゴリのみ）', () => {
    const { query } = buildSimpleQuery(TEST_BBOX, 'pharmacy', '', 'ramen')
    expect(query).not.toContain('cuisine')
    expect(query).toContain('[amenity=pharmacy](')
  })

  it('cuisine未指定時は従来クエリと同一（後方互換）', () => {
    const withDefault = buildSimpleQuery(TEST_BBOX, 'restaurant', 'kw')
    const withEmpty = buildSimpleQuery(TEST_BBOX, 'restaurant', 'kw', '')
    expect(withDefault.query).toBe(withEmpty.query)
    expect(withDefault.query).toContain('[amenity=restaurant](')
    expect(withDefault.query).not.toContain('cuisine')
  })

  it('特殊文字を含むcuisine値は引用符で囲まれる（Overpass QLエスケープ）', () => {
    // 空白を含む値は "..." で囲む必要がある
    const { query } = buildSimpleQuery(TEST_BBOX, 'restaurant', '', 'fish & chips')
    expect(query).toContain('[cuisine="fish & chips"]')
  })
})

// ---------- Issue #56: 時間予算・診断・リスナー管理 ----------
describe('フォールバック時間配分と診断（#56）', () => {
  beforeEach(() => {
    clearCache()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('全体予算が大きい場合も、各試行はperAttemptTimeoutで切られる（2回目が1msにならない）', async () => {
    // 全エンドポイントがハングする場合: 旧方式なら1回目が全体予算を使い切り、
    // 2回目が1ms程度。新方式では各試行が perAttemptTimeout(30ms) で切り替わる。
    vi.stubGlobal('fetch', hangingFetch())
    const t0 = Date.now()
    await expect(
      executeOverpassQuery(QUERY, {
        endpoint: 'custom',
        totalTimeout: 100000,      // 全体予算100秒（実用上非現実的だが予算切り離しの検証用）
        perAttemptTimeout: 30      // 試行ごとに30ms
      })
    ).rejects.toMatchObject({ type: 'timeout' })
    const elapsed = Date.now() - t0
    // 3試行 × 30ms = 90ms程度で終了する（全体予算100秒を待たない）
    expect(elapsed).toBeLessThan(3000)
  })

  it('各試行のタイムアウトが error.attempts に記録される（試行先・種別・経過時間）', async () => {
    vi.stubGlobal('fetch', hangingFetch())
    let caught
    try {
      await executeOverpassQuery(QUERY, {
        endpoint: 'custom',
        totalTimeout: 100000,
        perAttemptTimeout: 20
      })
    } catch (e) { caught = e }
    expect(caught.type).toBe('timeout')
    // custom → public → private_coffee の3試行すべて記録される
    expect(caught.attempts).toHaveLength(3)
    expect(caught.attempts.map(a => a.outcome)).toEqual(['timeout', 'timeout', 'timeout'])
    expect(caught.attempts[0].elapsedMs).toBeLessThan(2000)
    // 生のクエリ文字列は診断情報に含まれない（個人情報・容量対策）
    expect(JSON.stringify(caught.attempts)).not.toContain(QUERY)
  })

  it('全体予算を使い切った後は残りの候補に送信せず、skipped_budgetとして記録する', async () => {
    // ファイクタイマーで経過時間を決定論的にし、リアルタイムのタイマージッターに依存しない
    vi.useFakeTimers()
    const fetchMock = hangingFetch()
    vi.stubGlobal('fetch', fetchMock)
    const p = executeOverpassQuery(QUERY, {
      endpoint: 'custom',
      totalTimeout: 40,          // 全体予算40ms
      perAttemptTimeout: 15000   // 単体上限15秒（予算が支配的）
    })
    // reject が await 前に発生しても unhandled rejection にならないよう即catch（結果は try 内で取得）
    p.catch(() => {})
    // 1試行目（custom）のタイムアウトタイマーが40msで発火し全予算を消費
    await vi.advanceTimersByTimeAsync(40)
    let caught
    try { await p } catch (e) { caught = e }
    finally { vi.useRealTimers() }
    // 2試行目以降は残り予算0のため送信されず、skipped_budgetとして記録される
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(caught.attempts.some(a => a.outcome === 'skipped_budget')).toBe(true)
  })

  it('成功時は meta.attempts に試行内訳を記録する（フォールバック経路を含む）', async () => {
    const payload = overpassPayload([
      { type: 'node', id: 1, lat: 35.68, lon: 139.77, tags: { amenity: 'bank', name: '診断銀行' } }
    ])
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('sakura')) {
        return mockResponse({ status: 500, ok: false, body: { error: 'Internal server error' } })
      }
      return mockResponse({ body: payload })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { meta } = await executeOverpassQuery(QUERY, { endpoint: 'custom' })
    expect(meta.fallback).toBe(true)
    // custom(500) → public(成功) の2試行が記録される
    expect(meta.attempts).toHaveLength(2)
    expect(meta.attempts[0]).toMatchObject({ endpoint: 'custom', outcome: 'server_error', status: 500 })
    expect(meta.attempts[1]).toMatchObject({ endpoint: 'public', outcome: 'success', status: 200 })
    // クエリ文字列は含まれない
    expect(JSON.stringify(meta.attempts)).not.toContain(QUERY)
  })

  it('全エンドポイント失敗時は error.attempts に3試行の内訳を含める', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    let caught
    try {
      await executeOverpassQuery(QUERY, { endpoint: 'custom' })
    } catch (e) { caught = e }
    expect(caught.type).toBe('network')
    expect(caught.attempts).toHaveLength(3)
    expect(caught.attempts.every(a => a.outcome === 'network')).toBe(true)
    expect(JSON.stringify(caught.attempts)).not.toContain(QUERY)
  })

  it('フォールバック先でキャッシュヒットした場合も fallback フラグがtrueとして記録される', async () => {
    const payload = overpassPayload([
      { type: 'node', id: 7, lat: 35.68, lon: 139.77, tags: { amenity: 'bank', name: 'キャッシュ銀行' } }
    ])
    // 第一段階: public を直接叩いてキャッシュに格納する
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse({ body: payload })))
    await executeOverpassQuery(QUERY, { endpoint: 'public', totalTimeout: 5000, perAttemptTimeout: 2000 })

    // 第二段階: custom が500 → public へフォールバック → キャッシュヒット
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('sakura')) {
        return mockResponse({ status: 500, ok: false, body: { error: 'boom' } } )
      }
      throw new Error('public はキャッシュ済みなので fetch すべきではない')
    }))
    const { results, meta } = await executeOverpassQuery(QUERY, { endpoint: 'custom', totalTimeout: 5000, perAttemptTimeout: 2000 })
    expect(results).toHaveLength(1)
    expect(meta.cached).toBe(true)
    expect(meta.fallback).toBe(true)
    // custom の失敗（500）とキャッシュヒットの内訳が記録される
    expect(meta.attempts[0]).toMatchObject({ endpoint: 'custom', outcome: 'server_error', status: 500 })
  })

  it('実行中の外部キャンセルはフォールバックせず終了し、シグナルにリスナーを残さない', async () => {
    const fetchMock = hangingFetch()
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10)

    await expect(
      executeOverpassQuery(QUERY, { endpoint: 'custom', signal: controller.signal, totalTimeout: 100000, perAttemptTimeout: 5000 })
    ).rejects.toMatchObject({ type: 'network', message: '検索がキャンセルされました' })

    clearTimeout(timer)
    // キャンセル時点で最初の試行のみ送信（public・private_coffee には送信されない）
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
