// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { AppContext } from '../../context/AppContext'
import EditPanel from '../EditPanel'
import { initialState } from '../../state/appReducer'

/**
 * (A4) 検索0件時の「この地域ではまだ登録がありません」導線
 * - 0件＝失敗ではなく、追加の好機として伝える
 * - (B3) iD/Noteへの即時ジャンプリンクが展開不要で並ぶ
 * - 結果がある場合はパネル自体を表示しない
 */

afterEach(() => cleanup())

function makeState(overrides = {}) {
  return { ...initialState, ...overrides }
}

function Harness({ state }) {
  return (
    <AppContext.Provider value={{ state, dispatch: vi.fn() }}>
      <EditPanel />
    </AppContext.Provider>
  )
}

describe('EditPanel (A4): 0件時の導線', () => {
  it('結果0件（success）なら「この地域ではまだ登録がありません」＋iD/Note即時リンクを表示する', () => {
    render(<Harness state={makeState({ results: [], status: 'success', bbox: { south: 34.8, north: 34.9, west: 135.4, east: 135.6 } })} />)
    // (A4) 0件のポジティブフレーム
    expect(screen.getByText(/この地域ではまだ登録がありません/)).toBeTruthy()
    expect(screen.getByText(/検索結果が見つかりません/)).toBeTruthy()
    // (B3) 展開不要の即時ジャンプ
    const idLink = screen.getByRole('link', { name: /iDエディタで追加する/ })
    expect(idLink.getAttribute('href')).toMatch(/openstreetmap\.org\/edit\?node=map%2F16%2F/)
    const noteLink = screen.getByRole('link', { name: /Noteで報告する/ })
    expect(noteLink.getAttribute('href')).toMatch(/openstreetmap\.org\/notes\/new\?lat=/)
  })

  it('結果がある場合はパネルを表示しない', () => {
    render(<Harness state={makeState({ results: [{ type: 'node', id: 1, name: 'X' }], status: 'success' })} />)
    expect(screen.queryByText(/この地域ではまだ登録がありません/)).toBeNull()
    expect(screen.queryByRole('link', { name: /iDエディタで追加する/ })).toBeNull()
  })

  it('statusがsuccessでなければ表示しない', () => {
    render(<Harness state={makeState({ results: [], status: 'idle' })} />)
    expect(screen.queryByText(/この地域ではまだ登録がありません/)).toBeNull()
  })

  it('展開すると①確認→②iD→③Noteの完全導線が出る', () => {
    render(<Harness state={makeState({ results: [], status: 'success' })} />)
    fireEvent.click(screen.getByRole('button', { name: '展開' }))
    expect(screen.getByText(/周辺を確認する/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /iDエディタで編集/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Note作成画面を開く/ })).toBeTruthy()
  })
})
