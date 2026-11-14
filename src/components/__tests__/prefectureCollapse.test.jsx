// @vitest-environment jsdom
/**
 * (#55) 自治体検索 — 都道府県選択ブロックの折りたたみテスト
 *
 * 要件:
 * 1. ページを開いたときは、折りたたまず開いた状態（タイルグリッド表示）
 * 2. 都道府県を選択したら、閉じる（要約ボタン表示）
 * 3. 閉じたあと、市町村を入力するテキスト欄にフォーカスを移動する
 *
 * 補足: 閉じた状態から要約ボタンで再展開できること（折りたたみ式の基本動作）も検証する。
 * PC・モバイル両variantで検証する。
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import MunicipalitySearch from '../MunicipalitySearch'
import { AppContext } from '../../context/AppContext'

// jsdomにないAPIのスタブ
class MockResizeObserver { observe() {} unobserve() {} disconnect() {} }

/**
 * municipalities.json フィクスチャ（municipalityFlow.test.jsxと同形式）
 */
const MUNI_DATA = {
  count: 4,
  source: 'test-fixture',
  municipalities: [
    { name: '高槻市', code: '272078', prefecture: '大阪府', prefCode: '27', adminLevel: 8, osmId: 101, bbox: { south: 34.78051, west: 135.55719, north: 34.97667, east: 135.67264 }, displayName: '高槻市' },
    { name: '吹田市', code: '272051', prefecture: '大阪府', prefCode: '27', adminLevel: 8, osmId: 102, bbox: { south: 34.73111, west: 135.45811, north: 34.83111, east: 135.55811 }, displayName: '吹田市' },
    { name: '大阪市', code: '271004', prefecture: '大阪府', prefCode: '27', adminLevel: 7, osmId: 103, bbox: { south: 34.56, west: 135.34, north: 34.72, east: 135.52 }, displayName: '大阪市' },
    { name: '豊中市', code: '272035', prefecture: '大阪府', prefCode: '27', adminLevel: 8, osmId: 104, bbox: { south: 34.75, west: 135.4, north: 34.8, east: 135.47 }, displayName: '豊中市' }
  ]
}

beforeEach(() => {
  global.ResizeObserver = global.ResizeObserver || MockResizeObserver
  global.fetch = vi.fn(async (url) => {
    if (String(url).includes('municipalities.json')) {
      return { ok: true, json: async () => MUNI_DATA }
    }
    return { ok: true, json: async () => ({}) }
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderSearch(variant = 'pc') {
  const value = {
    state: { municipalitySearch: null, selectedMunicipality: null },
    dispatch: vi.fn()
  }
  return render(
    <AppContext.Provider value={value}>
      <MunicipalitySearch variant={variant} />
    </AppContext.Provider>
  )
}

// データ読み込み完了（タイルグリッド表示）を待つ
async function waitLoaded() {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: '大阪府' })).toBeTruthy()
  }, { timeout: 3000 })
}

// 市区町村テキスト入力欄を取得（id="mun-input-{variant}"）
function getMunInput(container, variant = 'pc') {
  return container.querySelector(`#mun-input-${variant}`)
}

describe('(#55) 都道府県選択の折りたたみ（PC variant）', () => {
  it('要件1: ページを開いたときは開いた状態（タイルグリッド表示）', async () => {
    const { container } = renderSearch()
    await waitLoaded()
    expect(container.querySelector('svg')).toBeTruthy()
    expect(screen.getByRole('button', { name: '大阪府' })).toBeTruthy()
  })

  it('要件2: 都道府県を選択（タイルクリック）したら閉じる', async () => {
    const { container } = renderSearch()
    await waitLoaded()
    fireEvent.click(screen.getByRole('button', { name: '大阪府' }))
    // タイルグリッドが非表示に
    await waitFor(() => expect(container.querySelector('svg')).toBeNull(), { timeout: 3000 })
    // 選択した県名＋「変更」の要約ボタンが表示される
    const summary = screen.getByRole('button', { name: /大阪府/ })
    expect(summary).toBeTruthy()
    expect(screen.getByText('変更 ▾')).toBeTruthy()
  })

  it('要件2: (sr-only)都道府県select経由の選択でも閉じる', async () => {
    const { container } = renderSearch()
    await waitLoaded()
    const prefSelect = document.getElementById('pref-select-pc')
    fireEvent.change(prefSelect, { target: { value: '27' } })
    await waitFor(() => expect(container.querySelector('svg')).toBeNull(), { timeout: 3000 })
  })

  it('要件3: 閉じたあと、市区町村入力欄にフォーカスが移動する', async () => {
    const { container } = renderSearch()
    await waitLoaded()
    fireEvent.click(screen.getByRole('button', { name: '大阪府' }))
    await waitFor(() => {
      const munInput = getMunInput(container)
      expect(munInput).toBeTruthy()
      expect(document.activeElement).toBe(munInput)
    }, { timeout: 3000 })
  })

  it('補足: 閉じた状態から要約ボタンクリックで再展開できる', async () => {
    const { container } = renderSearch()
    await waitLoaded()
    fireEvent.click(screen.getByRole('button', { name: '大阪府' }))
    await waitFor(() => expect(container.querySelector('svg')).toBeNull(), { timeout: 3000 })
    fireEvent.click(screen.getByRole('button', { name: /変更/ }))
    await waitFor(() => expect(container.querySelector('svg')).toBeTruthy(), { timeout: 3000 })
  })
})

describe('(#55) 都道府県選択の折りたたみ（モバイル variant）', () => {
  it('開いた状態で表示→タイル選択で閉じる→市区町村入力欄にフォーカス', async () => {
    const { container } = renderSearch('mobile')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '大阪府' })).toBeTruthy()
    }, { timeout: 3000 })

    fireEvent.click(screen.getByRole('button', { name: '大阪府' }))
    await waitFor(() => {
      expect(container.querySelector('svg')).toBeNull()
      const munInput = getMunInput(container, 'mobile')
      expect(munInput).toBeTruthy()
      expect(document.activeElement).toBe(munInput)
    }, { timeout: 3000 })
  })
})
