// @vitest-environment jsdom
/**
 * PCレイアウト構造テスト（上部タブバー廃止 → ハンバーガーメニュー方式）
 *
 * 本作業の契約を固定する:
 * - 上部タブバーは廃止され、PCレイアウトにタブバー（nav）が存在しない
 * - ヘッダー（タイトル行）にタイトル＋ハンバーガーメニューボタンが表示される
 * - 各画面（施設検索・店名→座標CSV・集計・出力・まちデータ帳とは）は
 *   既存コンポーネントをそのまま使用した構成のまま
 * - 既存の挙動（地図の隠す/表示する切替など）が維持されている
 *
 * メニューの操作挙動（開閉・ハイライト・外部クリック等）は
 * HamburgerMenu.test.jsx でカバーしている。
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

  // municipalities.json等のフェッチは空データで応答（検索実行はしない）
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

const IT_TIMEOUT = 15000

// ハンバーガーメニューを開く
function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'メニュー' }))
}

// メニューから項目を選択（画面を切り替わる）
async function selectFromMenu(itemLabel) {
  openMenu()
  await screen.findByRole('menu', { name: 'メニュー' })
  fireEvent.click(screen.getByRole('menuitem', { name: itemLabel }))
}

describe('PCレイアウト構造（タブバー廃止・ハンバーガーメニュー方式）', () => {
  it('上部タブバーが廃止されている（navなし・旧タブ名ボタンなし）', async () => {
    render(<App />)

    // PCレイアウトにタブバー（nav）が存在しない
    expect(screen.queryByRole('navigation')).toBeNull()

    // 旧タブバーの4タブがボタンとして表示されていない（メニューは閉じている）
    for (const label of ['施設検索', '店名→座標CSV', '集計・出力', 'について']) {
      expect(screen.queryByRole('button', { name: label })).toBeNull()
    }
  }, IT_TIMEOUT)

  it('ヘッダーにタイトルとハンバーガーメニューボタンが同じ行に表示される', async () => {
    render(<App />)

    const header = document.querySelector('header')
    expect(header).toBeTruthy()

    const title = screen.getByRole('heading', { name: 'まちデータ帳' })
    const menuBtn = screen.getByRole('button', { name: 'メニュー' })

    // 両方ともヘッダー内（タイトル行）に存在する
    expect(header.contains(title)).toBe(true)
    expect(header.contains(menuBtn)).toBe(true)
  }, IT_TIMEOUT)

  it('デフォルト画面は施設検索: 検索条件・一覧・地図が既存コンポーネントのまま', async () => {
    render(<App />)

    // 検索条件エリア（SearchPanel・折りたたみヘッダー）
    expect(screen.getByText('検索条件')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'この表示範囲で検索' })).toBeTruthy()

    // 一覧エリア（ResultsPanel初期状態: 0件・「まだ登録がない」案内）
    expect(screen.getByText(/件が見つかりました/)).toBeTruthy()
    expect(screen.getByText(/この地域ではまだ登録がありません/)).toBeTruthy()

    // 地図エリア（MapView・「地図を隠す」切替）
    expect(screen.getByText('地図表示')).toBeTruthy()
    expect(screen.getByRole('button', { name: '地図を隠す' })).toBeTruthy()
  }, IT_TIMEOUT)

  it('地図の隠す/表示する切替: 既存の挙動が維持されている', async () => {
    render(<App />)

    // 地図を隠す
    fireEvent.click(screen.getByRole('button', { name: '地図を隠す' }))
    expect(screen.getByRole('button', { name: '地図を表示' })).toBeTruthy()
    expect(screen.queryByText('地図表示')).toBeNull()
    expect(screen.queryByRole('button', { name: '地図を隠す' })).toBeNull()

    // 地図を表示（戻す）
    fireEvent.click(screen.getByRole('button', { name: '地図を表示' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '地図を隠す' })).toBeTruthy()
      expect(screen.getByText('地図表示')).toBeTruthy()
    })
  }, IT_TIMEOUT)

  it('店名→座標CSV画面: BatchMatchがそのまま表示される', async () => {
    render(<App />)

    await selectFromMenu('店名→座標CSV')

    // BatchMatchの主要UI（照合ボタン・入力欄・操作ガイド）
    expect(await screen.findByRole('button', { name: '照合' })).toBeTruthy()
    expect(screen.getByPlaceholderText(/施設名を1行に1件入力/)).toBeTruthy()
    expect(screen.getByText(/対象地域をOSM検索/)).toBeTruthy()
  }, IT_TIMEOUT)

  it('集計・出力画面（検索結果なし）: StatisticsPanel・ExportBarは未表示（既存のnull返却挙動）', async () => {
    render(<App />)

    await selectFromMenu('集計・出力')

    // 検索結果が無い場合、StatisticsPanelは描画されない（内部でnull返却）
    await waitFor(() => {
      // メニューが閉じ・画面が切替われたことを確認
      expect(screen.queryByRole('menu')).toBeNull()
    })
    expect(screen.queryByText('カテゴリ別')).toBeNull()
    expect(screen.queryByText('タグ別')).toBeNull()
  }, IT_TIMEOUT)

  it('「まちデータ帳とは」画面: AboutPanelがそのまま表示される（セクションタブ・概要）', async () => {
    render(<App />)

    await selectFromMenu('まちデータ帳とは')

    // AboutPanelのセクションタブ（既存のナビ）
    expect(await screen.findByRole('button', { name: 'データ品質' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '出典・ライセンス' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'API制約' })).toBeTruthy()

    // 概要セクションの内容（デフォルト表示）
    expect(screen.getByText('まちデータ帳とは')).toBeTruthy()
    expect(screen.getByText('現在の設定')).toBeTruthy()
  }, IT_TIMEOUT)
})
