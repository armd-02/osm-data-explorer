// @vitest-environment jsdom
/**
 * MobileResultsMap: 地図高さドラッグハンドル（useDraggableHeight）の統合テスト
 *
 * - ハンドル（role=separator）は地図コンテナの直後に描画され、地図コンテナは
 *   既定の高さクラス（h-[200px]）のまま。
 * - ハンドルをドラッグすると、地図コンテナの高さがインラインstyleで上書きされる
 *   （既定クラスは維持）。下方向ドラッグで高さが増える。
 * - 高さ変更に合わせて map.resize() が呼ばれる（MapLibre描画が追随）。
 * - ドラッグ終了時の高さは localStorage のキー mapHeight.results に保存される
 *   （検索タブの mapHeight.mobile・PC の mapHeight.pc とは独立）。
 * - 保存値があればそれを初期高さとして使う（範囲外・不正な値は無視）。
 * - POI（kind="poi"）・バリアフリー（kind="barrier_free"）の両方の結果マップに
 *   適用される（MobileResultsMap 自体に組み込まれているため）。
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import { AppContext } from '../../../context/AppContext'
import { createInitialState } from '../../../state/appReducer'
import MobileResultsMap from '../MobileResultsMap'

const mockState = vi.hoisted(() => ({ api: null }))
vi.mock('maplibre-gl', async () => {
  const mod = await import('../../../test/maplibreMock')
  mockState.api = mod.createMapLibreMock()
  return { default: mockState.api }
})

// 結果マップは親（MobileListTab）の判断でマウントされるが、コンポーネント自体は
// 検索状態に関わらず地図を描画するため、createInitialState のまま検証できる
function renderMap(kind = 'poi') {
  return render(
    <AppContext.Provider value={{ state: createInitialState(), dispatch: vi.fn() }}>
      <MobileResultsMap kind={kind} />
    </AppContext.Provider>
  )
}

const getMap = () => mockState.api._state.maps.at(-1)
const mapContainerOf = (view, kind) => {
  const label = kind === 'barrier_free' ? 'バリアフリー要素マップ' : '検索結果マップ'
  return view.container.querySelector('[role="application"][aria-label="' + label + '"]')
}
const handleOf = (view) => view.container.querySelector('[role="separator"][aria-orientation="horizontal"]')

beforeEach(() => {
  if (mockState.api) mockState.api.resetState()
  // ドラッグで高さの保存（localStorage）が起きるため、テスト間で隔離する
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  localStorage.clear()
})

describe('MobileResultsMap: 高さドラッグハンドル', () => {
  it('地図コンテナの直後にドラッグハンドルが描画され、既定の高さクラスは維持される', () => {
    const view = renderMap('poi')
    const mapContainer = mapContainerOf(view, 'poi')
    expect(mapContainer).toBeTruthy()
    expect(mapContainer.className).toMatch(/h-\[200px\]/)

    const handle = handleOf(view)
    expect(handle).toBeTruthy()
    // 地図コンテナの直後の兄弟要素
    expect(handle.previousElementSibling).toBe(mapContainer)
  })

  it('ハンドル当たり判定の高さは28px以上（h-7）。中央のつかみ線は細いままでよい', () => {
    const view = renderMap('poi')
    const handle = handleOf(view)
    expect(handle.className).toContain('h-7') // 当たり判定 28px 以上
    // 中央のつかみ線（グリップバー）は細いままでよい（h-1）
    expect(handle.firstElementChild.className).toContain('h-1')
  })

  it('ハンドルをドラッグすると地図コンテナの高さがインラインstyleで上書きされ、map.resize() が呼ばれる', async () => {
    const view = renderMap('poi')
    await act(async () => {}) // map生成effectをフラッシュ
    const mapContainer = mapContainerOf(view, 'poi')
    const handle = handleOf(view)
    expect(mapContainer.style.height).toBe('')

    act(() => {
      fireEvent.pointerDown(handle, { clientY: 200 })
      fireEvent.pointerMove(handle, { clientY: 300 }) // 100px下（下方向ドラッグで増大）
      fireEvent.pointerUp(handle)
    })
    expect(mapContainer.style.height).toBe('300px')
    // 既定クラスは維持（上書きはstyleのみ）
    expect(mapContainer.className).toMatch(/h-\[200px\]/)
    // MapLibreの描画が追随（map.resize() が呼ばれる）
    const map = getMap()
    expect(map).toBeTruthy()
    expect(map._calls.some((c) => c.name === 'resize')).toBe(true)
  })

  it('ドラッグ終了時の高さは mapHeight.results キーに保存され、検索タブのキーには保存されない', async () => {
    const view = renderMap('poi')
    await act(async () => {})
    const handle = handleOf(view)

    act(() => {
      fireEvent.pointerDown(handle, { clientY: 200 })
      fireEvent.pointerMove(handle, { clientY: 300 })
      fireEvent.pointerUp(handle)
    })
    expect(localStorage.getItem('mapHeight.results')).toBe('300')
    // 検索タブ（モバイル）のキーとは独立
    expect(localStorage.getItem('mapHeight.mobile')).toBeNull()
    expect(localStorage.getItem('mapHeight.pc')).toBeNull()
  })

  it('高さは 160px〜480px の範囲にクランプされる', async () => {
    let view = renderMap('poi')
    await act(async () => {})
    let mapContainer = mapContainerOf(view, 'poi')
    let handle = handleOf(view)

    // 上限: 200 + 400 = 600 → 480 に丸めクランプ（下方向ドラッグで増大）
    act(() => {
      fireEvent.pointerDown(handle, { clientY: 100 })
      fireEvent.pointerMove(handle, { clientY: 500 })
      fireEvent.pointerUp(handle)
    })
    expect(mapContainer.style.height).toBe('480px')

    // 下限はドラッグ開始高さ（既定200）から検証するため、
    // 直前ドラッグの保存値を残さず（localStorage をクリアして）新しくレンダリングする
    view.unmount()
    localStorage.clear()
    view = renderMap('poi')
    await act(async () => {})
    mapContainer = mapContainerOf(view, 'poi')
    handle = handleOf(view)

    // 下限: 200 - 200 = 0 → 160 に丸めクランプ（上方向ドラッグで減少）
    act(() => {
      fireEvent.pointerDown(handle, { clientY: 300 })
      fireEvent.pointerMove(handle, { clientY: 100 })
      fireEvent.pointerUp(handle)
    })
    expect(mapContainer.style.height).toBe('160px')
  })

  it('localStorage に保存値があればそれを初期高さとして使う', async () => {
    localStorage.setItem('mapHeight.results', '320')
    const view = renderMap('poi')
    const mapContainer = mapContainerOf(view, 'poi')
    // ドラッグなしでも保存値がインラインstyleとして反映される
    expect(mapContainer.style.height).toBe('320px')
  })

  it('範囲外の保存値は無視され、既定高さ（既定クラス h-[200px]）が使われる', async () => {
    localStorage.setItem('mapHeight.results', '999') // maxHeight 480 を超える
    const view = renderMap('poi')
    const mapContainer = mapContainerOf(view, 'poi')
    expect(mapContainer.style.height).toBe('')
    expect(mapContainer.className).toMatch(/h-\[200px\]/)
  })

  it('バリアフリー結果マップ（kind="barrier_free"）にも同じ挙動が適用される', async () => {
    const view = renderMap('barrier_free')
    await act(async () => {})
    const mapContainer = mapContainerOf(view, 'barrier_free')
    expect(mapContainer).toBeTruthy()
    expect(mapContainer.style.height).toBe('')

    const handle = handleOf(view)
    expect(handle).toBeTruthy()

    act(() => {
      fireEvent.pointerDown(handle, { clientY: 200 })
      fireEvent.pointerMove(handle, { clientY: 280 })
      fireEvent.pointerUp(handle)
    })
    expect(mapContainer.style.height).toBe('280px')
    const map = getMap()
    expect(map._calls.some((c) => c.name === 'resize')).toBe(true)
    expect(localStorage.getItem('mapHeight.results')).toBe('280')
  })
})
