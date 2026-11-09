// @vitest-environment jsdom
/**
 * (#62) useSearch — バリアフリー検索フローの統合テスト
 *
 * - バリアフリー検索（queryKind: barrier_free）は executeOverpassQuery に
 *   parseBarrierFreeResponse を渡す（既定の parseOverpassResponse では
 *   out geom のウェイが center 参照で落ちるため）
 * - バリアフリー検索では filterByKeyword を適用しない
 *   （歩道・縁石・音声案内ノードは name が無く、絞り込むと結果が消える）
 * - POI 検索は従来どおりキーワード絞り込みを適用（後方互換）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'

const h = vi.hoisted(() => ({
  app: { state: null, dispatch: () => {} },
  actions: [],
  overpassCalls: [],
  overpassResults: []
}))

vi.mock('../../context/AppContext', () => ({
  useApp: () => h.app
}))

vi.mock('../../utils/overpass', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    executeOverpassQuery: async (query, options = {}) => {
      h.overpassCalls.push({ query, options })
      return {
        results: h.overpassResults,
        meta: {
          elementCount: h.overpassResults.length,
          cached: false,
          fallback: false,
          endpoint: 'mock',
          elapsedMs: 1,
          fetchedAt: new Date().toISOString(),
          attempts: []
        }
      }
    }
  }
})

import { useSearch } from '../useSearch'
import { parseBarrierFreeResponse } from '../../utils/barrierFreeResults'
import { buildBarrierFreeQuery } from '../../utils/barrierFree'

const SMALL_BBOX = { south: 34.7, west: 135.5, north: 34.72, east: 135.52 }

/** name タグが無い要素（バリアフリー要素の大多数） */
const unnamedFootway = {
  type: 'way',
  id: 100,
  lat: 34.003,
  lon: 135.01,
  tags: { highway: 'footway', tactile_paving: 'yes' },
  name: null,
  osmId: 'way/100',
  bf: { kind: 'way', tactile: 'yes', lengthM: 152, kerb: null, hasSound: false, hasVibration: false, geometry: [[135.0, 34.0], [135.01, 34.01]] }
}

/** キーワードと完全一致する名称を持つ要素 */
const namedFootway = {
  type: 'way',
  id: 101,
  lat: 34.01,
  lon: 135.02,
  tags: { highway: 'footway', name: '駅前通り' },
  name: '駅前通り',
  osmId: 'way/101',
  bf: { kind: 'way', tactile: null, lengthM: 80, kerb: null, hasSound: false, hasVibration: false, geometry: [[135.01, 34.01], [135.02, 34.01]] }
}

function makeState(overrides = {}) {
  return {
    searchSource: 'map',
    searchMode: 'simple',
    bbox: SMALL_BBOX,
    simpleSearch: { category: '', keyword: '', cuisine: '', purpose: '' },
    municipalitySearch: { category: '', keyword: '', cuisine: '', purpose: '' },
    advancedSearch: { tags: [], keyword: '', useAnd: true },
    ...overrides
  }
}

async function runSearch(criteria = null) {
  const { result } = renderHook(() => useSearch())
  await act(async () => {
    await result.current.search(criteria)
  })
}

beforeEach(() => {
  h.actions.length = 0
  h.overpassCalls.length = 0
  h.overpassResults.length = 0
  h.app.dispatch = (action) => { h.actions.push(action) }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const dispatched = (type) => h.actions.filter((a) => a.type === type)
const resultsPayload = () => dispatched('SET_RESULTS')[0]?.payload

describe('useSearch: バリアフリー検索 (#62)', () => {
  it('legacy経路: barrier_free カテゴリ → parseBarrierFreeResponse を渡し、キーワード絞り込みをしない', async () => {
    h.app.state = makeState({
      simpleSearch: { category: 'barrier_free', keyword: '駅前通り', cuisine: '', purpose: '' }
    })
    h.overpassResults = [unnamedFootway, namedFootway]

    // legacy方式: 裸のBBOXオブジェクトを渡すと最新のstateからクエリを生成する
    await runSearch({ ...SMALL_BBOX })

    // バリアフリー専用クエリ（buildBarrierFreeQuery の出力と一致）を生成している
    expect(h.overpassCalls[0].query).toBe(buildBarrierFreeQuery(SMALL_BBOX))
    // バリアフリーパーサを渡している
    expect(h.overpassCalls[0].options.parse).toBe(parseBarrierFreeResponse)
    // キーワード絞り込みをしないため、name の無い要素も残る
    expect(resultsPayload()).toHaveLength(2)
    expect(dispatched('SET_RESULT_KIND')[0].payload).toBe('barrier_free')
    expect(dispatched('SET_STATUS').at(-1).payload).toBe('success')
  })

  it('legacy経路: 自治体モード + barrier_free カテゴリ → 専用バリアフリークエリを使い、絞り込みしない', async () => {
    h.app.state = makeState({
      searchSource: 'municipality',
      municipalitySearch: { category: 'barrier_free', keyword: '駅前通り', cuisine: '', purpose: '' }
    })
    h.overpassResults = [unnamedFootway, namedFootway]

    await runSearch({ ...SMALL_BBOX })

    expect(h.overpassCalls[0].query).toBe(buildBarrierFreeQuery(SMALL_BBOX))
    expect(h.overpassCalls[0].options.parse).toBe(parseBarrierFreeResponse)
    expect(resultsPayload()).toHaveLength(2)
    expect(dispatched('SET_RESULT_KIND')[0].payload).toBe('barrier_free')
  })

  it('legacy経路: 目的「バリアフリー」（カテゴリ未選択）でも専用バリアフリークエリを使う', async () => {
    h.app.state = makeState({
      simpleSearch: { category: '', keyword: '', cuisine: '', purpose: 'バリアフリー' }
    })
    h.overpassResults = [unnamedFootway, namedFootway]

    await runSearch({ ...SMALL_BBOX })

    expect(h.overpassCalls[0].query).toBe(buildBarrierFreeQuery(SMALL_BBOX))
    expect(h.overpassCalls[0].options.parse).toBe(parseBarrierFreeResponse)
    expect(resultsPayload()).toHaveLength(2)
    expect(dispatched('SET_RESULT_KIND')[0].payload).toBe('barrier_free')
  })

  it('criteria経路: バリアフリーの criteria（queryKind）→ 同様に絞り込みしない', async () => {
    h.app.state = makeState()
    h.overpassResults = [unnamedFootway, namedFootway]
    const criteria = {
      ok: true,
      bbox: SMALL_BBOX,
      searchSource: 'map',
      searchMode: 'simple',
      category: 'barrier_free',
      keyword: '駅前通り',
      queryKind: 'barrier_free',
      query: 'MOCK_BARRIER_FREE_QUERY'
    }

    await runSearch(criteria)

    expect(h.overpassCalls[0].query).toBe('MOCK_BARRIER_FREE_QUERY')
    expect(h.overpassCalls[0].options.parse).toBe(parseBarrierFreeResponse)
    expect(resultsPayload()).toHaveLength(2)
    expect(dispatched('SET_RESULT_KIND')[0].payload).toBe('barrier_free')
  })

  it('POI検索は従来どおりキーワード絞り込みを適用する（後方互換）', async () => {
    h.app.state = makeState({
      simpleSearch: { category: 'cafe', keyword: '駅前通り', cuisine: '', purpose: '' }
    })
    h.overpassResults = [unnamedFootway, namedFootway]

    await runSearch({ ...SMALL_BBOX })

    // parseオプションなし（既定の parseOverpassResponse）
    expect(h.overpassCalls[0].options.parse).toBeUndefined()
    // name の無い要素は絞り込みで除外される
    expect(resultsPayload()).toHaveLength(1)
    expect(resultsPayload()[0].osmId).toBe('way/101')
    expect(dispatched('SET_RESULT_KIND')[0].payload).toBe('poi')
  })

  it('キーワード未入力のバリアフリー検索 → 全結果が残る', async () => {
    h.app.state = makeState({
      simpleSearch: { category: 'barrier_free', keyword: '', cuisine: '', purpose: '' }
    })
    h.overpassResults = [unnamedFootway, namedFootway]

    await runSearch({ ...SMALL_BBOX })

    expect(resultsPayload()).toHaveLength(2)
  })
})
