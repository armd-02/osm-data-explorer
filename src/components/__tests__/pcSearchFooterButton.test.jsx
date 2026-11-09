// @vitest-environment jsdom
/**
 * PCレイアウト: 「検索する」ボタンの固定フッター配置（モバイル版との配置統一）
 *
 * PC「施設検索」画面（SearchTabContent）の検索ボタンの配置契約を固定する:
 * - ボタンはスロールーム（.search-workspace）の外・画面下端の固定フッターにある
 *   （スクロールしても常に視認可能 — モバイル版と同一方式・P0再発防止）
 * - 固定フッターは「上に境界線・白背景・左右上下に余白」のバー（shrink-0）
 * - fullWidth版（横幅いっぱい・min 48px の大型タップターゲット）が使われている
 * - ラベルは検索ソースで切り替わる: 地図モード「この表示範囲で検索」/
 *   自治体モード「検索する」（モバイル版と同一規則）
 * - 検索条件カードのヘッダー行には検索ボタンが残っていない
 *   （折りたたみトグル＋共有URLのみ）
 *
 * ボタンの動作（criteria/status/onSearch/onCancel）は SearchActionButton 側の
 * テスト（SearchActionButton.test.jsx）と pcMapSearchButton.test.jsx がカバーするため、
 * ここでは配置・ラベルの検証に専念する。
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import App from '../../App'

// MapLibre GLはWebGLが必要でjsdomでは初期化できないためモジュール全体をモックする。
const mockState = vi.hoisted(() => ({ api: null }))
vi.mock('maplibre-gl', async () => {
  const mod = await import('../../test/maplibreMock')
  mockState.api = mod.createMapLibreMock()
  return { default: mockState.api }
})

class MockResizeObserver { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => {
  global.ResizeObserver = global.ResizeObserver || MockResizeObserver
  if (!window.matchMedia) {
    // matches: false → PCレイアウト（モバイル切替しない）
    window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  }
  if (mockState.api) mockState.api.resetState()
  window.history.replaceState(null, '', '/')

  // municipalities.jsonには妥当なフィクスチャを返す（MunicipalitySearchの
  // data.municipalities 反復が空オブジェクトでクラッシュするのを防ぐ）。
  // それ以外のフェッチは空データで応答（検索実行はしない）。
  const MUNI_DATA = {
    count: 1,
    municipalities: [
      { name: '高槻市', code: '272078', prefecture: '大阪府', prefCode: '27', adminLevel: 8, osmId: 101, bbox: { south: 34.78051, west: 135.55719, north: 34.97667, east: 135.67264 }, displayName: '高槻市' }
    ]
  }
  global.fetch = vi.fn(async (url) => {
    const u = String(url)
    if (u.includes('municipalities.json')) {
      return { ok: true, json: async () => MUNI_DATA }
    }
    return { ok: true, json: async () => ({}) }
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

const IT_TIMEOUT = 15000

/**
 * ボタンから上位をたどって固定フッター（shrink-0 + border-t + bg-white）を特定する。
 * （地図のドラッグハンドルやサイトフッターも shrink-0/border-t を持つため、
 *   ボタンの祖先関係で絞る）
 */
function findFixedFooter(btn) {
  let el = btn.parentElement
  while (el) {
    const cls = typeof el.className === 'string' ? el.className : ''
    if (cls.includes('shrink-0') && cls.includes('border-t') && cls.includes('bg-white')) return el
    el = el.parentElement
  }
  return null
}

describe('PC: 検索ボタンの固定フッター配置（モバイル版との統一）', () => {
  it('フッター（スロールーム外）にfullWidth版の大きな検索ボタンが表示される', async () => {
    render(<App />)

    const btn = screen.getByRole('button', { name: 'この表示範囲で検索' })

    // fullWidth版: 横幅いっぱい・min 48px の大型タップターゲット
    expect(btn.className).toContain('w-full')
    expect(btn.className).toContain('min-h-[48px]')

    // 固定フッター内（上に境界線・白背景・shrink-0でスクロールしない）
    const footer = findFixedFooter(btn)
    expect(footer).toBeTruthy()
    expect(footer.className).toContain('shrink-0')
    expect(footer.className).toContain('border-t')
    expect(footer.className).toContain('bg-white')

    // スロールーム（.search-workspace）の外に存在する
    const workspace = document.querySelector('.search-workspace')
    expect(workspace).toBeTruthy()
    expect(workspace.contains(btn)).toBe(false)

    // 地図ロード完了後にボタンが有効化される（押下時点範囲で検索できる）
    await waitFor(() => {
      const b = screen.getByRole('button', { name: 'この表示範囲で検索' })
      expect(b.hasAttribute('disabled')).toBe(false)
    }, { timeout: 5000 })
  }, IT_TIMEOUT)

  it('ラベルは検索ソースで切り替わる: 地図モード「この表示範囲で検索」⇄ 自治体モード「検索する」', async () => {
    render(<App />)

    // 既定（地図モード）: 「この表示範囲で検索」のみ
    expect(screen.getByRole('button', { name: 'この表示範囲で検索' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '検索する' })).toBeNull()

    // 自治体モードへ切替 → 「検索する」に切り替わる
    fireEvent.click(screen.getByText('自治体から探す'))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '検索する' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'この表示範囲で検索' })).toBeNull()
    }, { timeout: 5000 })

    // 地図モードへ戻す → 「この表示範囲で検索」に復帰
    fireEvent.click(screen.getByText('地図から探す'))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'この表示範囲で検索' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: '検索する' })).toBeNull()
    }, { timeout: 5000 })
  }, IT_TIMEOUT)

  it('検索条件カードのヘッダー行に検索ボタンが残っていない（折りたたみトグル＋共有URLのみ）', () => {
    render(<App />)

    // ヘッダー行（「検索条件」ラベルの親div: flex items-center gap-2 px-3）
    const label = screen.getByText('検索条件')
    const headerRow = label.parentElement
    expect(headerRow).toBeTruthy()
    expect(headerRow.className).toContain('px-3')

    // フッターの検索ボタンはヘッダー行に含まれない
    const searchBtn = screen.getByRole('button', { name: 'この表示範囲で検索' })
    expect(headerRow.contains(searchBtn)).toBe(false)

    // 行内のボタンは折りたたみトグルと「共有URL」の2つだけ
    const rowButtons = [...headerRow.querySelectorAll('button')]
    expect(rowButtons.length).toBe(2)
    expect(rowButtons[1].textContent).toContain('共有URL')
  }, IT_TIMEOUT)
})
