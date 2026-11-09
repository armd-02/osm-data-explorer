// @vitest-environment jsdom
/**
 * (#62) バリアフリー凡例の配置テスト（地図本体の「下」に描画されること）
 *
 * 凡例は地図上のオーバーレイ（absolute配置）ではなく、地図本体の下に
 * 通常のレイアウトフローで描画する。
 * - PC: SearchTabContent（App.jsx の施設検索画面）— 凡例は地図コンテナ
 *   （.search-split）の外側かつその後のドキュメント順にある。
 * - モバイル: MobileSearchTab — 同上（地図コンテナは MapView の absolute
 *   容器の親 div）。
 * - 表示条件（barrier_free かつ結果1件以上）を満たさない場合は非表示。
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { AppContext } from '../../context/AppContext'
import { createInitialState } from '../../state/appReducer'
import { SearchTabContent } from '../../App'
import MobileSearchTab from '../mobile/MobileSearchTab'

const mockState = vi.hoisted(() => ({ api: null }))
vi.mock('maplibre-gl', async () => {
  const mod = await import('../../test/maplibreMock')
  mockState.api = mod.createMapLibreMock({ autoLoad: false })
  return { default: mockState.api }
})

class MockResizeObserver { observe() {} unobserve() {} disconnect() {} }

// バリアフリー結果1件（way / 点字ブロックあり）
const BF_RESULT = {
  id: 1, type: 'way',
  tags: { highway: 'footway', tactile_paving: 'yes' },
  lat: 34.6705, lon: 135.4805, name: null, osmId: 'way/1',
  bf: { kind: 'way', tactile: 'yes', lengthM: 120, kerb: null, hasSound: false, hasVibration: false,
    geometry: [[135.48, 34.67], [135.481, 34.6705], [135.482, 34.671]] }
}

const makeBfState = (over = {}) => ({
  ...createInitialState(),
  resultKind: 'barrier_free',
  results: [BF_RESULT],
  ...over
})

// 凡例のルート要素（「凡例」テキストを含む div）
const legendRootOf = (view) => {
  const el = view.queryByText('凡例')
  return el ? el.closest('div') : null
}

// 地図コンテナを特定する
// - PC: .search-split（地図本体のコンテナ）
// - モバイル: MapView の absolute 容器（.absolute.inset-0）の親 div
const mapContainerOf = (view, kind) => {
  if (kind === 'pc') return view.container.querySelector('.search-split')
  const mapRoot = view.container.querySelector('.absolute.inset-0')
  return mapRoot ? mapRoot.parentElement : null
}

beforeEach(() => {
  global.ResizeObserver = global.ResizeObserver || MockResizeObserver
  if (mockState.api) mockState.api.resetState()
  // municipalities.json等のフェッチは空データで応答
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const renderInContext = (view, state) =>
  render(
    <AppContext.Provider value={{ state, dispatch: vi.fn() }}>
      {view}
    </AppContext.Provider>
  )

describe('PC（SearchTabContent）', () => {
  it('凡例は地図コンテナの外側・その後のドキュメント順（地図本体の下）にある', () => {
    const state = makeBfState()
    const view = renderInContext(
      <SearchTabContent searchCollapsed={false} setSearchCollapsed={vi.fn()} showMap setShowMap={vi.fn()} />,
      state
    )

    const mapContainer = mapContainerOf(view, 'pc')
    expect(mapContainer).toBeTruthy()
    const legendRoot = legendRootOf(view)
    expect(legendRoot).toBeTruthy()

    // 地図コンテナ内のオーバーレイになっていない（パン・ズーム操作にも影響しない）
    expect(mapContainer.contains(legendRoot)).toBe(false)
    // 地図コンテナの「後」に描画されている
    expect(mapContainer.compareDocumentPosition(legendRoot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 地図本体の高さは固定（凡例の表示・非表示で地図の高さが変わらない）
    expect(mapContainer.className).toMatch(/h-\[520px\]/)
  })

  it('POI検索の結果では凡例を表示しない', () => {
    const view = renderInContext(
      <SearchTabContent searchCollapsed={false} setSearchCollapsed={vi.fn()} showMap setShowMap={vi.fn()} />,
      makeBfState({ resultKind: 'poi' })
    )
    expect(legendRootOf(view)).toBeNull()
  })

  it('バリアフリー検索でも結果が0件なら凡例を表示しない', () => {
    const view = renderInContext(
      <SearchTabContent searchCollapsed={false} setSearchCollapsed={vi.fn()} showMap setShowMap={vi.fn()} />,
      makeBfState({ results: [] })
    )
    expect(legendRootOf(view)).toBeNull()
  })

  it('凡例の表示・非表示の切替で地図コンテナに影響しない（高さ・クラス不変）', () => {
    const view = renderInContext(
      <SearchTabContent searchCollapsed={false} setSearchCollapsed={vi.fn()} showMap setShowMap={vi.fn()} />,
      makeBfState()
    )
    const mapContainer = mapContainerOf(view, 'pc')
    const before = mapContainer.className
    expect(view.queryByText('凡例')).toBeTruthy()

    // バリアフリー → POI に切替（凡例が非表示になる）
    act(() => {
      view.rerender(
        <AppContext.Provider value={{ state: makeBfState({ resultKind: 'poi' }), dispatch: vi.fn() }}>
          <SearchTabContent searchCollapsed={false} setSearchCollapsed={vi.fn()} showMap setShowMap={vi.fn()} />
        </AppContext.Provider>
      )
    })
    expect(view.queryByText('凡例')).toBeNull()

    // 地図コンテナは変化していない（地図の高さ・操作に影響しない）
    expect(mapContainer.className).toBe(before)
    expect(mapContainer.className).toMatch(/h-\[520px\]/)
  })
})

describe('モバイル（MobileSearchTab）', () => {
  it('凡例は地図コンテナの外側・その後のドキュメント順（地図本体の下）にある', () => {
    const view = renderInContext(
      <MobileSearchTab onViewResults={vi.fn()} />,
      makeBfState()
    )

    const mapContainer = mapContainerOf(view, 'mobile')
    expect(mapContainer).toBeTruthy()
    const legendRoot = legendRootOf(view)
    expect(legendRoot).toBeTruthy()

    expect(mapContainer.contains(legendRoot)).toBe(false)
    expect(mapContainer.compareDocumentPosition(legendRoot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 地図本体の高さは固定（凡例の表示・非表示で地図の高さが変わらない）
    expect(mapContainer.className).toMatch(/h-\[240px\]/)
  })

  it('POI検索の結果では凡例を表示しない', () => {
    const view = renderInContext(
      <MobileSearchTab onViewResults={vi.fn()} />,
      makeBfState({ resultKind: 'poi' })
    )
    expect(legendRootOf(view)).toBeNull()
  })
})
