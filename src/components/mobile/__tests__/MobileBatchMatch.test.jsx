// @vitest-environment jsdom
/**
 * (モバイル対応) 店名→座標 一括照合のモバイルレイアウトのテスト
 *
 * - 縦流れフロー（入力→照合→施設選択→候補→ミニ地図→確定/取消）
 * - #31: タブ往復（コンポーネントのhidden化）で状態が保持される
 * - 確定/取消の意味（確定=地図用CSVに座標付与、取消=解除）
 *
 * MapLibre GLはjsdomで動かない（WebGL必須）ためBatchMatchMapをモックする。
 */
import React, { useReducer, useEffect } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AppContext } from '../../../context/AppContext'
import { appReducer, createInitialState } from '../../../state/appReducer'
import { BatchMatchProvider } from '../../../context/BatchMatchContext.jsx'
import MobileBatchMatch from '../MobileBatchMatch'

vi.mock('../../BatchMatchMap', () => ({
  default: () => <div data-testid="mini-map" />
}))

const OSM_RESULTS = [
  { type: 'node', id: 101, lat: 34.7, lon: 135.5, tags: { name: '田中ラーメン', amenity: 'restaurant' } },
  { type: 'way', id: 202, lat: 34.71, lon: 135.51, tags: { name: '山本カフェ', shop: 'cafe' } },
  { type: 'node', id: 303, lat: 34.72, lon: 135.52, tags: { name: '鈴木薬局', amenity: 'pharmacy' } }
]

function Harness({ preActions = [], children }) {
  const [state, dispatch] = useReducer(appReducer, createInitialState())
  useEffect(() => {
    preActions.forEach((a) => dispatch(a))
  }, [])
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <BatchMatchProvider>{children}</BatchMatchProvider>
    </AppContext.Provider>
  )
}

// #31: プロバイダはタブ往復でもアンマウントされず（hiddenのみ）の状態保持を再現
function KeepMountedHarness({ visible, preActions = [], children }) {
  const [state, dispatch] = useReducer(appReducer, createInitialState())
  useEffect(() => {
    preActions.forEach((a) => dispatch(a))
  }, [])
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <BatchMatchProvider>
        {visible && children}
      </BatchMatchProvider>
    </AppContext.Provider>
  )
}

function renderWithResults(ui, preActions) {
  return render(
    <Harness preActions={preActions}>{ui}</Harness>
  )
}

beforeEach(() => {
  cleanup()
  vi.spyOn(window, 'alert').mockImplementation(() => {})
})

describe('MobileBatchMatch: 入力・照合', () => {
  it('textarea・CSV取込・照合ボタンを表示し、入力が空なら照合は無効', () => {
    render(<Harness><MobileBatchMatch /></Harness>)
    const ta = screen.getByRole('textbox', { name: /店名リスト/ })
    expect(ta).toBeTruthy()
    expect(screen.getByText(/CSV取込/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /照合実行/ }).disabled).toBe(true)
  })

  it('OSM結果が未取得のまま照合すると案内が表示される', async () => {
        render(<Harness><MobileBatchMatch /></Harness>)
    fireEvent.change(screen.getByRole('textbox', { name: /店名リスト/ }), { target: { value: '田中ラーメン' } })
    fireEvent.click(screen.getByRole('button', { name: /照合実行/ }))
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('検索'))
  })

  it('照合実行で施設リストとサマリーが表示される', async () => {
        renderWithResults(<MobileBatchMatch />, [{ type: 'SET_RESULTS', payload: OSM_RESULTS }])
    fireEvent.change(screen.getByRole('textbox', { name: /店名リスト/ }), { target: { value: '田中ラーメン\n山本カフェ' } })
    fireEvent.click(screen.getByRole('button', { name: /照合実行/ }))
    await waitFor(() => {
      expect(screen.getByText('田中ラーメン', { selector: 'span' })).toBeTruthy()
    })
    expect(screen.getByText(/要確認 2/)).toBeTruthy()
    expect(screen.getByText(/確認済 0/)).toBeTruthy()
    expect(screen.getByText(/候補なし 0/)).toBeTruthy()
  })
})

describe('MobileBatchMatch: 施設選択・候補・確定/取消', () => {
  async function matchAndSelect() {
        renderWithResults(<MobileBatchMatch />, [{ type: 'SET_RESULTS', payload: OSM_RESULTS }])
    fireEvent.change(screen.getByRole('textbox', { name: /店名リスト/ }), { target: { value: '田中ラーメン' } })
    fireEvent.click(screen.getByRole('button', { name: /照合実行/ }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /田中ラーメン/ })).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: /田中ラーメン/ }))
  }

  it('施設を選択するとOSM候補（完全一致）と確定ボタンが表示される', async () => {
    await matchAndSelect()
    expect(screen.getByText('完全一致')).toBeTruthy()
    expect(screen.getByRole('button', { name: '確定' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /地図で確認/ })).toBeTruthy()
    // ミニ地図も表示される
    expect(screen.getByTestId('mini-map')).toBeTruthy()
  })

  it('確定すると✓確認済になり、取消で解除できる', async () => {
    await matchAndSelect()
    fireEvent.click(screen.getByRole('button', { name: '確定' }))
    // 施設行が確認済バッジに
    expect(await screen.findByText('✓ 確認済')).toBeTruthy()
    // サマリーが更新される
    expect(screen.getByText(/確認済 1/)).toBeTruthy()
    // 地図用CSVボタンの件数も更新
    expect(screen.getByRole('button', { name: /地図用CSV（確定 1 件）/ })).toBeTruthy()

    // 取消 → 要確認に戻る
    fireEvent.click(screen.getByRole('button', { name: '✓ 取消' }))
    expect(await screen.findByText('… 要確認')).toBeTruthy()
    expect(screen.getByText(/確認済 0/)).toBeTruthy()
    expect(screen.getByText(/要確認 1/)).toBeTruthy()
  })

  it('候補なしの施設には説明が表示される（確定ボタンなし）', async () => {
        renderWithResults(<MobileBatchMatch />, [{ type: 'SET_RESULTS', payload: OSM_RESULTS }])
    fireEvent.change(screen.getByRole('textbox', { name: /店名リスト/ }), { target: { value: '存在しない店' } })
    fireEvent.click(screen.getByRole('button', { name: /照合実行/ }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /存在しない店/ })).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: /存在しない店/ }))
    expect(screen.getByText(/一致する候補が見つかりませんでした/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '確定' })).toBeNull()
  })
})

describe('MobileBatchMatch: 状態保持 (#31)', () => {
  it('タブ往復（hidden化）しても入力・照合結果・確定状態は保持される', async () => {
        const { rerender } = render(
      <KeepMountedHarness visible={true} preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }]}>
        <MobileBatchMatch />
      </KeepMountedHarness>
    )
    // 入力→照合→確定
    fireEvent.change(screen.getByRole('textbox', { name: /店名リスト/ }), { target: { value: '田中ラーメン' } })
    fireEvent.click(screen.getByRole('button', { name: /照合実行/ }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /田中ラーメン/ })).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: /田中ラーメン/ }))
    fireEvent.click(screen.getByRole('button', { name: '確定' }))
    expect(await screen.findByText('✓ 確認済')).toBeTruthy()

    // 別タブへ（コンポーネントはhidden化＝アンマウントされない）
    rerender(
      <KeepMountedHarness visible={false} preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }]}>
        <MobileBatchMatch />
      </KeepMountedHarness>
    )
    // 戻って状態が維持されている
    rerender(
      <KeepMountedHarness visible={true} preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }]}>
        <MobileBatchMatch />
      </KeepMountedHarness>
    )
    expect(screen.getByRole('textbox', { name: /店名リスト/ }).value).toBe('田中ラーメン')
    expect(screen.getByText('✓ 確認済')).toBeTruthy()
    expect(screen.getByText(/確認済 1/)).toBeTruthy()
  })
})
