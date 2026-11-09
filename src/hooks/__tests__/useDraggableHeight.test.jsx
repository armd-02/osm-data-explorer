// @vitest-environment jsdom
/**
 * useDraggableHeight — コンテナの高さをドラッグで変更するフック
 *
 * - 未操作は height=null（既定クラスのままで、デフォルト表示は不変）
 * - ハンドル（地図の下端）はポインタと同方向に動く: 下方向ドラッグで増大、
 *   上方向で減少（クランプ: minHeight〜maxHeight）
 * - pointerup/pointercancel でドラッグ終了（以降のmoveは反映されない）
 * - handleProps に touch-action: none（タッチ中のページスクロール防止）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { useDraggableHeight } from '../useDraggableHeight'

function TestMap({ over = {} }) {
  const { height, containerStyle, handleProps } = useDraggableHeight({
    defaultHeight: 520,
    minHeight: 200,
    maxHeight: 900,
    ...over,
  })
  return (
    <div>
      <div data-testid="container" style={containerStyle}>map</div>
      <div data-testid="handle" {...handleProps} />
      <span data-testid="height">{height ?? 'default'}</span>
    </div>
  )
}

beforeEach(() => localStorage.clear())

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('useDraggableHeight', () => {
  it('未操作は既定高さ（height=null、インラインstyleなし）', () => {
    const view = render(<TestMap />)
    expect(view.getByTestId('height').textContent).toBe('default')
    expect(view.getByTestId('container').style.height).toBe('')
  })

  it('上方向ドラッグで高さが小さくなる（520 → 420）', () => {
    const view = render(<TestMap />)
    const handle = view.getByTestId('handle')
    fireEvent.pointerDown(handle, { clientY: 500 })
    fireEvent.pointerMove(handle, { clientY: 400 }) // 100px上
    expect(view.getByTestId('container').style.height).toBe('420px')
    fireEvent.pointerUp(handle)
  })

  it('下方向ドラッグで高さが大きくなる（520 → 620）', () => {
    const view = render(<TestMap />)
    const handle = view.getByTestId('handle')
    fireEvent.pointerDown(handle, { clientY: 100 })
    fireEvent.pointerMove(handle, { clientY: 200 }) // 100px下
    expect(view.getByTestId('container').style.height).toBe('620px')
    fireEvent.pointerUp(handle)
  })

  it('maxHeight を超えるドラッグは上限値にクランプされる', () => {
    const view = render(<TestMap />)
    const handle = view.getByTestId('handle')
    fireEvent.pointerDown(handle, { clientY: 100 })
    fireEvent.pointerMove(handle, { clientY: 700 }) // 520+600=1120 → 900
    expect(view.getByTestId('container').style.height).toBe('900px')
    fireEvent.pointerUp(handle)
  })

  it('minHeight を下回るドラッグは下限値にクランプされる', () => {
    const view = render(<TestMap />)
    const handle = view.getByTestId('handle')
    fireEvent.pointerDown(handle, { clientY: 700 })
    fireEvent.pointerMove(handle, { clientY: 100 }) // 520-600=-80 → 200
    expect(view.getByTestId('container').style.height).toBe('200px')
    fireEvent.pointerUp(handle)
  })

  it('ドラッグ終了後のpointermoveは高さに影響しない', () => {
    const view = render(<TestMap />)
    const handle = view.getByTestId('handle')
    fireEvent.pointerDown(handle, { clientY: 500 })
    fireEvent.pointerMove(handle, { clientY: 400 })
    fireEvent.pointerUp(handle)
    fireEvent.pointerMove(handle, { clientY: 100 })
    expect(view.getByTestId('container').style.height).toBe('420px')
  })

  it('2回目のドラッグは1回目で変更された高さを基準にする', () => {
    const view = render(<TestMap />)
    const handle = view.getByTestId('handle')
    // 1回目: 520 → 420（100px上）
    fireEvent.pointerDown(handle, { clientY: 500 })
    fireEvent.pointerMove(handle, { clientY: 400 })
    fireEvent.pointerUp(handle)
    // 2回目: 420から100px上 → 320
    fireEvent.pointerDown(handle, { clientY: 400 })
    fireEvent.pointerMove(handle, { clientY: 300 })
    expect(view.getByTestId('container').style.height).toBe('320px')
    fireEvent.pointerUp(handle)
  })

  it('handlePropsにtouch-action:noneとrow-resizeカーソルを含む', () => {
    const view = render(<TestMap />)
    const handle = view.getByTestId('handle')
    expect(handle.style.touchAction).toBe('none')
    expect(handle.style.cursor).toBe('row-resize')
    expect(handle.getAttribute('role')).toBe('separator')
  })
})

describe('localStorage永続化', () => {
  const KEY = 'test.mapHeight'

  it('保存値（範囲内）があればそれを初期高さとして使う', () => {
    localStorage.setItem(KEY, '640')
    const view = render(<TestMap over={{ storageKey: KEY }} />)
    expect(view.getByTestId('container').style.height).toBe('640px')
  })

  it('保存値が不正（数値でない）なら初期値（既定クラス）を使う', () => {
    localStorage.setItem(KEY, 'abc')
    const view = render(<TestMap over={{ storageKey: KEY }} />)
    expect(view.getByTestId('height').textContent).toBe('default')
    expect(view.getByTestId('container').style.height).toBe('')
  })

  it('保存値が範囲外なら初期値（既定クラス）を使う', () => {
    localStorage.setItem(KEY, '1500') // > maxHeight 900
    const view = render(<TestMap over={{ storageKey: KEY }} />)
    expect(view.getByTestId('height').textContent).toBe('default')
    expect(view.getByTestId('container').style.height).toBe('')
  })

  it('ドラッグ終了時に高さをlocalStorageに保存する', () => {
    const view = render(<TestMap over={{ storageKey: KEY }} />)
    const handle = view.getByTestId('handle')
    fireEvent.pointerDown(handle, { clientY: 500 })
    fireEvent.pointerMove(handle, { clientY: 400 })
    fireEvent.pointerUp(handle)
    expect(localStorage.getItem(KEY)).toBe('420')
  })

  it('ハンドルへのタップ（移動なし）は保存しない・onResizeも発火しない', () => {
    const onResize = vi.fn()
    const view = render(<TestMap over={{ onResize, storageKey: KEY }} />)
    const handle = view.getByTestId('handle')
    fireEvent.pointerDown(handle, { clientY: 500 })
    fireEvent.pointerUp(handle)
    expect(onResize).not.toHaveBeenCalled()
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(view.getByTestId('container').style.height).toBe('')
  })

  it('storageKey未指定ならlocalStorageに保存しない', () => {
    const view = render(<TestMap />)
    const handle = view.getByTestId('handle')
    fireEvent.pointerDown(handle, { clientY: 500 })
    fireEvent.pointerMove(handle, { clientY: 400 })
    fireEvent.pointerUp(handle)
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})

describe('onResize（地図描画の追随）', () => {
  it('ドラッグ終了時に最終高さで必ず呼ばれる', () => {
    const onResize = vi.fn()
    const view = render(<TestMap over={{ onResize }} />)
    const handle = view.getByTestId('handle')
    fireEvent.pointerDown(handle, { clientY: 500 })
    fireEvent.pointerMove(handle, { clientY: 400 })
    fireEvent.pointerUp(handle)
    expect(onResize).toHaveBeenLastCalledWith(420)
    expect(onResize.mock.calls.length).toBeGreaterThanOrEqual(1)
  })

  it('ドラッグ中は100ms毎に最大1回スロットリングされる', () => {
    const onResize = vi.fn()
    const nowSpy = vi.spyOn(Date, 'now')
    let t = 1_000_000
    nowSpy.mockImplementation(() => t)

    const view = render(<TestMap over={{ onResize }} />)
    const handle = view.getByTestId('handle')

    // 最初のmoveは呼ばれる（510）。100ms以内の2回目はスロットリング
    fireEvent.pointerDown(handle, { clientY: 500 })
    fireEvent.pointerMove(handle, { clientY: 490 })
    fireEvent.pointerMove(handle, { clientY: 480 })
    expect(onResize).toHaveBeenCalledTimes(1)
    expect(onResize).toHaveBeenLastCalledWith(510)

    // 100ms経過後のmoveは呼ばれる（490）
    t += 100
    fireEvent.pointerMove(handle, { clientY: 470 })
    expect(onResize).toHaveBeenCalledTimes(2)
    expect(onResize).toHaveBeenLastCalledWith(490)

    // pointerupは100msが経っていなくても必ず最終高さで呼ばれる
    fireEvent.pointerUp(handle)
    expect(onResize).toHaveBeenCalledTimes(3)
    expect(onResize).toHaveBeenLastCalledWith(490)

    nowSpy.mockRestore()
  })

  it('高さが変わらないうち（クランプで頭打ち）に終了してもonResize・保存はしない', () => {
    const onResize = vi.fn()
    const key = 'test.mapHeight.clamp'
    localStorage.setItem(key, '900') // 上限の保存値から始める
    const view = render(<TestMap over={{ onResize, storageKey: key }} />)
    const handle = view.getByTestId('handle')
    // 下方向（大きくする方向）にドラッグ → 上限900で頭打ち（不変）
    fireEvent.pointerDown(handle, { clientY: 500 })
    fireEvent.pointerMove(handle, { clientY: 600 })
    expect(view.getByTestId('container').style.height).toBe('900px')
    fireEvent.pointerUp(handle)
    expect(onResize).not.toHaveBeenCalled()
    expect(localStorage.getItem(key)).toBe('900')
  })
})
