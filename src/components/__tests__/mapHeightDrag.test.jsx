// @vitest-environment jsdom
/**
 * 地図高さドラッグハンドル（useDraggableHeight）の統合テスト
 *
 * - PC（SearchTabContent）: ハンドル（role=separator）は地図コンテナ
 *   （.search-split）の直後に描画され、地図コンテナは既定の高さクラス
 *   （h-[520px]）のまま。
 * - モバイル（MobileSearchTab・地図モード）: 同上（既定 h-[240px]）。
 * - ハンドルをドラッグすると、地図コンテナの高さがインラインstyleで
 *   上書きされる（既定クラスは維持）。
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
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

beforeEach(() => {
  global.ResizeObserver = global.ResizeObserver || MockResizeObserver
  if (mockState.api) mockState.api.resetState()
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
  // ドラッグで高さの保存（localStorage）が起きるため、テスト間で隔離する
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  localStorage.clear()
})

const renderInContext = (view, state) =>
  render(
    <AppContext.Provider value={{ state, dispatch: vi.fn() }}>
      {view}
    </AppContext.Provider>
  )

// 地図コンテナを特定する
const mapContainerOf = (view, kind) => {
  if (kind === 'pc') return view.container.querySelector('.search-split')
  const mapRoot = view.container.querySelector('.absolute.inset-0')
  return mapRoot ? mapRoot.parentElement : null
}

describe('PC（SearchTabContent）', () => {
  it('地図コンテナの直後にドラッグハンドルが描画され、既定の高さクラスは維持される', () => {
    const view = renderInContext(
      <SearchTabContent searchCollapsed={false} setSearchCollapsed={vi.fn()} showMap setShowMap={vi.fn()} />,
      createInitialState()
    )
    const mapContainer = mapContainerOf(view, 'pc')
    expect(mapContainer).toBeTruthy()
    expect(mapContainer.className).toMatch(/h-\[520px\]/)

    const handle = view.container.querySelector('[role="separator"][aria-orientation="horizontal"]')
    expect(handle).toBeTruthy()
    // 地図コンテナの直後の兄弟要素
    expect(handle.previousElementSibling).toBe(mapContainer)
  })

  it('ハンドル当たり判定の高さは28px以上（h-7）。中央のつかみ線は細いままでよい', () => {
    const view = renderInContext(
      <SearchTabContent searchCollapsed={false} setSearchCollapsed={vi.fn()} showMap setShowMap={vi.fn()} />,
      createInitialState()
    )
    const handle = view.container.querySelector('[role="separator"][aria-orientation="horizontal"]')
    expect(handle.className).toContain('h-7') // 当たり判定 28px 以上
    // 中央のつかみ線（グリップバー）は細いままでよい（h-1）
    expect(handle.firstElementChild.className).toContain('h-1')
  })

  it('ハンドルをドラッグすると地図コンテナの高さがインラインstyleで上書きされる', () => {
    const view = renderInContext(
      <SearchTabContent searchCollapsed={false} setSearchCollapsed={vi.fn()} showMap setShowMap={vi.fn()} />,
      createInitialState()
    )
    const mapContainer = mapContainerOf(view, 'pc')
    const handle = view.container.querySelector('[role="separator"][aria-orientation="horizontal"]')
    expect(mapContainer.style.height).toBe('')

    act(() => {
      fireEvent.pointerDown(handle, { clientY: 500 })
      fireEvent.pointerMove(handle, { clientY: 400 }) // 100px上（ハンドル＝地図下端なので縮小）
      fireEvent.pointerUp(handle)
    })
    expect(mapContainer.style.height).toBe('420px')
    // 既定クラスは維持（上書きはstyleのみ）
    expect(mapContainer.className).toMatch(/h-\[520px\]/)
    // MapLibreの描画が追随（map.resize() が呼ばれる）
    const map = mockState.api._state.maps[0]
    expect(map).toBeTruthy()
    expect(map._calls.some((c) => c.name === 'resize')).toBe(true)
  })

  it('地図の隠す/表示する切替は不変（隠すとハンドルも一緒に消え、表示で復帰）', () => {
    const view = renderInContext(
      <SearchTabContent searchCollapsed={false} setSearchCollapsed={vi.fn()} showMap={false} setShowMap={vi.fn()} />,
      createInitialState()
    )
    // 非表示: 地図コンテナもハンドルも描画されず、「地図を表示」ボタンだけ
    expect(view.container.querySelector('.search-split')).toBeNull()
    expect(view.container.querySelector('[role="separator"]')).toBeNull()
    expect(view.queryByText('地図を表示')).toBeTruthy()
    expect(view.queryByText('地図を隠す')).toBeNull()

    // 表示に戻す: 地図とハンドルが復帰し、「地図を隠す」ボタンが戻る
    act(() => {
      view.rerender(
        <AppContext.Provider value={{ state: createInitialState(), dispatch: vi.fn() }}>
          <SearchTabContent searchCollapsed={false} setSearchCollapsed={vi.fn()} showMap={true} setShowMap={vi.fn()} />
        </AppContext.Provider>
      )
    })
    expect(view.container.querySelector('.search-split')).toBeTruthy()
    expect(view.container.querySelector('[role="separator"]')).toBeTruthy()
    expect(view.queryByText('地図を隠す')).toBeTruthy()
    expect(view.queryByText('地図を表示')).toBeNull()
  })

  it('PCは 280px〜1000px の範囲にクランプされる', () => {
    const view = renderInContext(
      <SearchTabContent searchCollapsed={false} setSearchCollapsed={vi.fn()} showMap setShowMap={vi.fn()} />,
      createInitialState()
    )
    const mapContainer = mapContainerOf(view, 'pc')
    const handle = view.container.querySelector('[role="separator"][aria-orientation="horizontal"]')

    // 上限: 520 + 481 = 1001 → 1000 に丸めクランプ（下方向ドラッグで増大）
    act(() => {
      fireEvent.pointerDown(handle, { clientY: 19 })
      fireEvent.pointerMove(handle, { clientY: 500 })
      fireEvent.pointerUp(handle)
    })
    expect(mapContainer.style.height).toBe('1000px')

    // 下限: 1000 - 721 = 279 → 280 に丸めクランプ（上方向ドラッグで減少）
    act(() => {
      fireEvent.pointerDown(handle, { clientY: 821 })
      fireEvent.pointerMove(handle, { clientY: 100 })
      fireEvent.pointerUp(handle)
    })
    expect(mapContainer.style.height).toBe('280px')
  })
})

describe('モバイル（MobileSearchTab・地図モード）', () => {
  it('地図コンテナの直後にドラッグハンドルが描画され、既定の高さクラスは維持される', () => {
    const view = renderInContext(
      <MobileSearchTab onViewResults={vi.fn()} />,
      createInitialState() // searchSourceは既定 'map'
    )
    const mapContainer = mapContainerOf(view, 'mobile')
    expect(mapContainer).toBeTruthy()
    expect(mapContainer.className).toMatch(/h-\[240px\]/)

    const handle = view.container.querySelector('[role="separator"][aria-orientation="horizontal"]')
    expect(handle).toBeTruthy()
    expect(handle.previousElementSibling).toBe(mapContainer)
  })

  it('ハンドル当たり判定の高さは28px以上（h-7）。中央のつかみ線は細いままでよい', () => {
    const view = renderInContext(
      <MobileSearchTab onViewResults={vi.fn()} />,
      createInitialState()
    )
    const handle = view.container.querySelector('[role="separator"][aria-orientation="horizontal"]')
    expect(handle.className).toContain('h-7') // 当たり判定 28px 以上
    // 中央のつかみ線（グリップバー）は細いままでよい（h-1）
    expect(handle.firstElementChild.className).toContain('h-1')
  })

  it('ハンドルをドラッグすると地図コンテナの高さがインラインstyleで上書きされる', () => {
    const view = renderInContext(
      <MobileSearchTab onViewResults={vi.fn()} />,
      createInitialState()
    )
    const mapContainer = mapContainerOf(view, 'mobile')
    const handle = view.container.querySelector('[role="separator"][aria-orientation="horizontal"]')
    expect(mapContainer.style.height).toBe('')

    act(() => {
      fireEvent.pointerDown(handle, { clientY: 200 })
      fireEvent.pointerMove(handle, { clientY: 300 }) // 100px下（ハンドル＝地図下端なので増大）
      fireEvent.pointerUp(handle)
    })
    expect(mapContainer.style.height).toBe('340px')
    expect(mapContainer.className).toMatch(/h-\[240px\]/)
    // MapLibreの描画が追随（map.resize() が呼ばれる）
    const map = mockState.api._state.maps[0]
    expect(map).toBeTruthy()
    expect(map._calls.some((c) => c.name === 'resize')).toBe(true)
  })

  it('モバイルは 160px〜480px の範囲にクランプされる', () => {
    const view = renderInContext(
      <MobileSearchTab onViewResults={vi.fn()} />,
      createInitialState()
    )
    const mapContainer = mapContainerOf(view, 'mobile')
    const handle = view.container.querySelector('[role="separator"][aria-orientation="horizontal"]')

    // 上限: 240 + 241 = 481 → 480 に丸めクランプ（下方向ドラッグで増大）
    act(() => {
      fireEvent.pointerDown(handle, { clientY: 259 })
      fireEvent.pointerMove(handle, { clientY: 500 })
      fireEvent.pointerUp(handle)
    })
    expect(mapContainer.style.height).toBe('480px')

    // 下限: 480 - 321 = 159 → 160 に丸めクランプ（上方向ドラッグで減少）
    act(() => {
      fireEvent.pointerDown(handle, { clientY: 421 })
      fireEvent.pointerMove(handle, { clientY: 100 })
      fireEvent.pointerUp(handle)
    })
    expect(mapContainer.style.height).toBe('160px')
  })
})
