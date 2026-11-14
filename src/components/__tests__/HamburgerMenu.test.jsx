// @vitest-environment jsdom
/**
 * ハンバーガーメニュー（タイトル行右端）E2Eテスト
 *
 * PC版の上部タブバーを廃止した後の代替として、タイトル行右端のハンバーガーメニュー
 * （≡）から「施設検索」「店名→座標CSV」「集計・出力」の画面を切り替える。
 *
 * 検証内容:
 * 1. PCレイアウトにメニューボタンが表示され、クリックで3項目のメニューが開く
 *    （一番下に区切りを入れて小さく表示される「まちデータ帳とは」を含む）
 * 2. 「施設検索」→ 検索画面（検索条件フォーム）
 * 3. 「店名→座標CSV」→ 一括照合画面
 * 4. 「集計・出力」→ 集計画面（検索結果がある場合）
 * 5. 「まちデータ帳とは」（画面切替とは別扱い）→ 使い方（About）画面
 * 6. 選択後メニューが閉じる・現在の画面に対応する項目がハイライトされる
 * 7. 外部クリック・Escキーで閉じる
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import App from '../../App'
import { clearCache } from '../../utils/overpass'

// MapLibre GLはWebGLが必要でjsdomでは初期化できないためモジュール全体をモックする。
// vi.mockファクトリはファイル先頭にホイスされるため、共通モックは動的importで参照。
const mockState = vi.hoisted(() => ({ api: null }))
vi.mock('maplibre-gl', async () => {
  const mod = await import('../../test/maplibreMock')
  mockState.api = mod.createMapLibreMock()
  return { default: mockState.api }
})

// jsdomにないAPIのスタブ
class MockResizeObserver { observe() {} unobserve() {} disconnect() {} }

// municipalities.json フィクスチャ（municipalityFlow.test.jsx と同一形式）
const MUNI_DATA = {
  count: 2,
  source: 'test-fixture',
  municipalities: [
    { name: '高槻市', code: '272078', prefecture: '大阪府', prefCode: '27', adminLevel: 8, osmId: 101, bbox: { south: 34.78051, west: 135.55719, north: 34.97667, east: 135.67264 }, displayName: '高槻市' },
    { name: '吹田市', code: '272051', prefecture: '大阪府', prefCode: '27', adminLevel: 8, osmId: 102, bbox: { south: 34.73111, west: 135.45811, north: 34.83111, east: 135.55811 }, displayName: '吹田市' }
  ]
}

const overpassCalls = []

let mockFetch
beforeEach(() => {
  global.ResizeObserver = global.ResizeObserver || MockResizeObserver
  if (!window.matchMedia) {
    // matches: false → PCレイアウト（モバイル切替しない）
    window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  }
  if (mockState.api) mockState.api.resetState()
  overpassCalls.length = 0
  clearCache()

  mockFetch = vi.fn(async (url, options) => {
    const u = String(url)
    if (u.includes('municipalities.json')) {
      return { ok: true, json: async () => MUNI_DATA }
    }
    if (u.includes('interpreter')) {
      const body = options?.body || ''
      const query = String(body).replace(/^data=/, '').replace(/\+/g, ' ')
      overpassCalls.push(decodeURIComponent(query))
      return {
        ok: true,
        status: 200,
        headers: new Map(),
        json: async () => ({ version: 0.6, elements: [
          { type: 'node', id: 1, lat: 34.8, lon: 135.5, tags: { amenity: 'cafe', name: 'Test Cafe' } },
          { type: 'node', id: 2, lat: 34.81, lon: 135.51, tags: { shop: 'convenience', name: 'Test Shop' } }
        ] })
      }
    }
    return { ok: true, json: async () => ({}) }
  })
  global.fetch = mockFetch
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

function renderApp(query = '') {
  window.history.replaceState(null, '', query ? `?${query}` : '/')
  render(<App />)
}

// selectを取得（ラベル→親div内のselect）
const getSelectByLabel = (label) => {
  const el = screen.getByText(label)
  let node = el
  while (node && node.tagName !== 'DIV') node = node.parentElement
  return node?.querySelector('select')
}

// 市区町村テキスト入力欄を取得（ラベル→親div内のinput）
const getInputByLabel = (label) => {
  const el = screen.getByText(label)
  let node = el
  while (node && node.tagName !== 'DIV') node = node.parentElement
  return node?.querySelector('input')
}

// サジェストリスト内の候補（role=option）を取得
const getSuggestOptions = () =>
  screen.getAllByRole('option').filter(o => o.closest('[role="listbox"]'))

// 都道府県→市区町村を選択（テキスト入力＋サジェスト）
async function selectMunicipality(prefText, munText) {
  await waitFor(() => {
    expect(screen.getByText('都道府県')).toBeTruthy()
  }, { timeout: 3000 })
  const prefSelect = getSelectByLabel('都道府県')
  const prefOpt = [...prefSelect.querySelectorAll('option')].find(o => o.textContent === prefText)
  expect(prefOpt).toBeTruthy()
  fireEvent.change(prefSelect, { target: { value: prefOpt.value } })

  // 市区町村入力欄の出現を待ってから名前の入力と候補クリック
  const input = await waitFor(() => {
    const i = getInputByLabel('市区町村')
    expect(i).toBeTruthy()
    return i
  }, { timeout: 3000 })
  fireEvent.change(input, { target: { value: munText } })
  const munOpt = await waitFor(() => {
    const opt = getSuggestOptions().find(o => o.textContent.startsWith(munText))
    expect(opt).toBeTruthy()
    return opt
  }, { timeout: 3000 })
  fireEvent.click(munOpt)
}

// ハンバーガーメニューを開く
function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'メニュー' }))
}

// メニューから項目を選択して閉じる
async function selectFromMenu(itemLabel) {
  openMenu()
  await screen.findByRole('menu', { name: 'メニュー' })
  fireEvent.click(screen.getByRole('menuitem', { name: itemLabel }))
}

// 自治体モードで検索を実行し、結果表示（一覧タブへの自動切替）を待つ
async function runMunicipalitySearch() {
  fireEvent.click(screen.getByText('自治体から探す'))
  await selectMunicipality('大阪府', '高槻市')
  fireEvent.click(screen.getByText('検索する'))
  await screen.findByText('Test Cafe', {}, { timeout: 8000 })
}

const IT_TIMEOUT = 15000

describe('PC版 ハンバーガーメニュー', () => {
  it('タイトル行にメニューボタンが表示され、クリックで3項目のメニューが開く', async () => {
    renderApp()

    const menuBtn = screen.getByRole('button', { name: 'メニュー' })
    expect(menuBtn).toBeTruthy()
    expect(menuBtn.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(menuBtn)

    const menu = await screen.findByRole('menu', { name: 'メニュー' })
    expect(menu).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '施設検索' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '店名→座標CSV' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '集計・出力' })).toBeTruthy()
    // 画面切替とは別扱いの「まちデータ帳とは」（区切りの下・小さい表示）
    const footerItem = screen.getByRole('menuitem', { name: 'まちデータ帳とは' })
    expect(footerItem).toBeTruthy()
    expect(footerItem.className).toContain('text-xs')
    // 区切り線がフッター項目の上に存在すること
    const divider = footerItem.previousElementSibling
    expect(divider).toBeTruthy()
    expect(divider.className).toContain('border-t')
  }, IT_TIMEOUT)

  it('「施設検索」を選択 → 検索画面（検索条件フォーム）へ切り替わる', async () => {
    renderApp()

    // まず一括照合画面へ移動
    await selectFromMenu('店名→座標CSV')
    expect(await screen.findByRole('button', { name: '照合' })).toBeTruthy()

    // メニューから「施設検索」を選択
    await selectFromMenu('施設検索')

    // 検索画面が表示される（検索条件フォーム・検索ボタン）
    expect(screen.getByText('検索条件')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'この表示範囲で検索' })).toBeTruthy()
    // 一括照合画面はhiddenで非表示（アクセシビリティツリーからも除外）
    expect(screen.queryByRole('button', { name: '照合' })).toBeNull()
  }, IT_TIMEOUT)

  it('「店名→座標CSV」を選択 → 一括照合画面へ切り替わる', async () => {
    renderApp()

    await selectFromMenu('店名→座標CSV')

    // 一括照合画面が表示される（照合ボタン・操作ガイド）
    expect(await screen.findByRole('button', { name: '照合' })).toBeTruthy()
    expect(screen.getByText(/「施設検索」タブで対象地域をOSM検索/)).toBeTruthy()
    // メニューは閉じている
    expect(screen.queryByRole('menu')).toBeNull()
  }, IT_TIMEOUT)

  it('「集計・出力」を選択 → 集計画面へ切り替わる（検索結果がある場合）', async () => {
    renderApp()

    // 検索を実行 → 成功で一覧タブへ自動切替（結果表示）
    await runMunicipalitySearch()

    await selectFromMenu('集計・出力')

    // StatisticsPanelが表示される（内部タブ「カテゴリ別」で確認）
    expect(await screen.findByText('カテゴリ別')).toBeTruthy()
    // メニューは閉じている
    expect(screen.queryByRole('menu')).toBeNull()
  }, IT_TIMEOUT)

  it('現在の画面に対応するメニュー項目がハイライトされる（aria-current）', async () => {
    renderApp()

    // 初期は検索画面 → 「施設検索」がハイライト
    openMenu()
    await screen.findByRole('menu', { name: 'メニュー' })
    expect(screen.getByRole('menuitem', { name: '施設検索' }).getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('menuitem', { name: '店名→座標CSV' }).getAttribute('aria-current')).toBeNull()

    // 一括照合画面へ移動 → 「店名→座標CSV」がハイライト
    fireEvent.click(screen.getByRole('menuitem', { name: '店名→座標CSV' }))
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    openMenu()
    await screen.findByRole('menu', { name: 'メニュー' })
    expect(screen.getByRole('menuitem', { name: '店名→座標CSV' }).getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('menuitem', { name: '施設検索' }).getAttribute('aria-current')).toBeNull()
  }, IT_TIMEOUT)

  it('「まちデータ帳とは」を選択 → 使い方（About）画面へ切り替わる', async () => {
    renderApp()

    await selectFromMenu('まちデータ帳とは')

    // AboutPanelが表示される（概要セクションの見出しで確認）
    expect(await screen.findByText('まちデータ帳とは')).toBeTruthy()
    // メニューは閉じている
    expect(screen.queryByRole('menu')).toBeNull()
  }, IT_TIMEOUT)

  it('外部クリック・Escキーでメニューが閉じる', async () => {
    renderApp()

    // 外部クリックで閉じる
    openMenu()
    await screen.findByRole('menu', { name: 'メニュー' })
    // コンポーネントはmousedownで外部クリックを検出する
    fireEvent.mouseDown(document.body)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())

    // Escキーで閉じる
    openMenu()
    await screen.findByRole('menu', { name: 'メニュー' })
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  }, IT_TIMEOUT)
})
