// @vitest-environment jsdom
/**
 * 都道府県ブロック地図（タイルグリッド）のテスト
 *
 * 検証内容:
 * 1. TILE_GRID の妥当性: 47都道府県すべてが配置され、タイル位置の重複がない
 * 2. コンポーネント単体: レンダリング・クリック・キーボード操作・aria-pressed
 * 3. MunicipalitySearch 統合:
 *    - タイル選択 → 市区町村select出現 → 検索（従来フローへ接続）
 *    - 別県タイル選択で市区町村選択がリセットされる
 *    - URL復元（selectedMunicipality同期）で選択県タイルがハイライトされる
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import App from '../../App'
import PrefectureTileMap, { TILE_GRID, CELL } from '../PrefectureTileMap'
import { clearCache } from '../../utils/overpass'

// MapLibre GLはWebGLが必要でjsdomでは初期化できないためモジュール全体をモックする。
// vi.mockファクトリはファイル先頭にホイスされるため、共通モックは動的importで参照。
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
    window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  }
  if (mockState.api) mockState.api.resetState()
})

// ---- fixture ----
const MUNI_DATA = {
  count: 5,
  source: 'test-fixture',
  municipalities: [
    { name: '高槻市', code: '272078', prefecture: '大阪府', prefCode: '27', adminLevel: 8, osmId: 101, bbox: { south: 34.78051, west: 135.55719, north: 34.97667, east: 135.67264 }, displayName: '高槻市' },
    { name: '吹田市', code: '272051', prefecture: '大阪府', prefCode: '27', adminLevel: 8, osmId: 102, bbox: { south: 34.73111, west: 135.45811, north: 34.83111, east: 135.55811 }, displayName: '吹田市' },
    { name: '大阪市', code: '271004', prefecture: '大阪府', prefCode: '27', adminLevel: 7, osmId: 103, bbox: { south: 34.56, west: 135.34, north: 34.72, east: 135.52 }, displayName: '大阪市' },
    { name: '豊中市', code: '272035', prefecture: '大阪府', prefCode: '27', adminLevel: 8, osmId: 104, bbox: { south: 34.75, west: 135.4, north: 34.8, east: 135.47 }, displayName: '豊中市' },
    { name: '奈良市', code: '292015', prefecture: '奈良県', prefCode: '29', adminLevel: 7, osmId: 201, bbox: { south: 34.54, west: 135.79, north: 34.66, east: 135.9 }, displayName: '奈良市' }
  ]
}

const overpassCalls = []

let mockFetch
beforeEach(() => {
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
          { type: 'node', id: 1, lat: 34.8, lon: 135.5, tags: { amenity: 'cafe', name: 'Test Cafe' } }
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

function getSelectByLabel(label) {
  const el = screen.getByText(label)
  let node = el
  while (node && node.tagName !== 'DIV') node = node.parentElement
  return node?.querySelector('select')
}

function getInputByLabel(label) {
  const el = screen.getByText(label)
  let node = el
  while (node && node.tagName !== 'DIV') node = node.parentElement
  return node?.querySelector('input')
}

// サジェストリスト内の候補（role=option）を取得
function getSuggestOptions() {
  return screen.getAllByRole('option').filter(o => o.closest('[role="listbox"]'))
}

// 市区町村入力欄に名前の入力→候補クリックで選択
async function pickMunicipality(munText) {
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
  return input
}

// ---- 1. TILE GRID 定義 ----
describe('TILE_GRID 定義', () => {
  it('47都道府県すべてが配置されている', () => {
    for (let i = 1; i <= 47; i++) {
      const code = String(i).padStart(2, '0')
      expect(TILE_GRID[code], `prefCode ${code} 未配置`).toBeTruthy()
    }
  })

  it('タイル位置（row,col）に重複がない', () => {
    const seen = new Set()
    for (const [code, [row, col]] of Object.entries(TILE_GRID)) {
      const key = `${row},${col}`
      expect(seen.has(key), `位置 ${key} が ${code} で重複`).toBe(false)
      seen.add(key)
    }
    expect(seen.size).toBe(47)
  })
})

// ---- 2. コンポーネント単体 ----
describe('PrefectureTileMap（コンポーネント）', () => {
  const PREFS = [
    { code: '01', name: '北海道' },
    { code: '13', name: '東京都' },
    { code: '27', name: '大阪府' }
  ]

  it('配置済み都道府県のタイルがボタンとしてレンダされる', () => {
    render(<PrefectureTileMap prefectures={PREFS} value="" onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: '北海道' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '東京都' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '大阪府' })).toBeTruthy()
  })

  it('レイアウト未定義コードのタイルはレンダされない', () => {
    render(<PrefectureTileMap prefectures={[{ code: '99', name: 'テスト県' }]} value="" onSelect={() => {}} />)
    expect(screen.queryByRole('button', { name: 'テスト県' })).toBeNull()
  })

  it('クリックで onSelect(code) が呼ばれる', () => {
    const onSelect = vi.fn()
    render(<PrefectureTileMap prefectures={PREFS} value="" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: '大阪府' }))
    expect(onSelect).toHaveBeenCalledWith('27')
  })

  it('Enter キーで選択される', () => {
    const onSelect = vi.fn()
    render(<PrefectureTileMap prefectures={PREFS} value="" onSelect={onSelect} />)
    fireEvent.keyDown(screen.getByRole('button', { name: '東京都' }), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('13')
  })

  it('Space キーで選択される', () => {
    const onSelect = vi.fn()
    render(<PrefectureTileMap prefectures={PREFS} value="" onSelect={onSelect} />)
    fireEvent.keyDown(screen.getByRole('button', { name: '東京都' }), { key: ' ' })
    expect(onSelect).toHaveBeenCalledWith('13')
  })

  it('その他のキーでは選択されない', () => {
    const onSelect = vi.fn()
    render(<PrefectureTileMap prefectures={PREFS} value="" onSelect={onSelect} />)
    fireEvent.keyDown(screen.getByRole('button', { name: '東京都' }), { key: 'a' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('選択済みタイルは aria-pressed=true、それ以外は false', () => {
    render(<PrefectureTileMap prefectures={PREFS} value="27" onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: '大阪府' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '東京都' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: '北海道' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('選択済みタイルの rect が選択色で描画される', () => {
    const { container } = render(<PrefectureTileMap prefectures={PREFS} value="27" onSelect={() => {}} />)
    const selTile = screen.getByRole('button', { name: '大阪府' })
    const selRect = selTile.querySelector('rect')
    expect(selRect.getAttribute('fill')).toBe('#2563eb')
    const baseTile = screen.getByRole('button', { name: '東京都' })
    expect(baseTile.querySelector('rect').getAttribute('fill')).toBe('#f1f5f9')
  })

  it('mobile variant: 横スクロールなし — コンテナ幅に収まる縮小表示', () => {
    const { container } = render(
      <PrefectureTileMap prefectures={PREFS} value="" onSelect={() => {}} variant="mobile" />
    )
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    const cls = svg.getAttribute('class') || ''
    // 画面幅いっぱいの縮小表示 + 幅上限（タイルサイズ40〜45px帯）+ 中央寄せ
    expect(cls).toContain('w-full')
    expect(cls).toContain('max-w-[300px]')
    expect(cls).toContain('mx-auto')
    expect(cls).toContain('block')
    // 横はみ出しの原因だった固定幅・overflow指定が残っていない
    expect(svg.style.width).toBe('')
    expect(container.querySelector('.overflow-auto')).toBeNull()
    expect(container.querySelector('.max-h-\\[380px\\]')).toBeNull()
  })

  it('mobile variant: タイルサイズは約40〜45px（タップ可能サイズを維持）', () => {
    const all47 = Object.entries(TILE_GRID).map(([code]) => ({ code, name: `県${code}` }))
    const { container } = render(
      <PrefectureTileMap prefectures={all47} value="" onSelect={() => {}} variant="mobile" />
    )
    const svg = container.querySelector('svg')
    const [, , w] = svg.getAttribute('viewBox').split(' ').map(Number)
    // 幅が上限300pxの時の実寸タイルサイズ（viewBox内のCELL=56をスケール換算）
    const tileSize = 300 * (CELL / w)
    expect(tileSize).toBeGreaterThanOrEqual(40)
    expect(tileSize).toBeLessThanOrEqual(45.5) // 約40〜45px
  })

  it('pc variant: SVGは最大幅制限+中央寄せ（広い画面で巨大化しない）', () => {
    const { container } = render(
      <PrefectureTileMap prefectures={PREFS} value="" onSelect={() => {}} variant="pc" />
    )
    const cls = container.querySelector('svg').getAttribute('class') || ''
    expect(cls).toContain('max-w-[300px]') // 幅の上限
    expect(cls).toContain('mx-auto')       // 中央寄せ
    expect(cls).toContain('w-full')        // 狭い画面では従来どおり画面幅いっぱい
    expect(cls).toContain('block')         // auto marginによる中央寄せにはblock必須
  })

  it('実寸で47都道府県がスクロールなしで1画面に収まる（幅上限時の高さが760px以下）', () => {
    // 47都道府県すべて（名前はダミーでよい。重要なのはTILE_GRID配置）
    const all47 = Object.entries(TILE_GRID).map(([code]) => ({ code, name: `県${code}` }))
    const { container } = render(
      <PrefectureTileMap prefectures={all47} value="" onSelect={() => {}} variant="pc" />
    )
    const svg = container.querySelector('svg')
    const [, , w, h] = svg.getAttribute('viewBox').split(' ').map(Number)
    // 幅が上限300pxの時の実寸高さ（viewBoxの縦横比を維持してスケール）
    const renderedHeight = 300 * (h / w)
    // 標準的な画面（高さ768px以上、ブラウザUIを除いた表示域≒760px）に収まる
    expect(renderedHeight).toBeLessThanOrEqual(760)
  })
})

// ---- 3. MunicipalitySearch 統合 ----
describe('MunicipalitySearch 統合（ブロック地図選択）', () => {
  it('タイル選択 → 市区町村入力欄出現 → 検索: BBOX検索が従来通り発行される', async () => {
    renderApp()
    fireEvent.click(screen.getByText('自治体から探す'))

    // ブロック地図の大阪府タイルをクリック
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '大阪府' })).toBeTruthy()
    }, { timeout: 3000 })
    fireEvent.click(screen.getByRole('button', { name: '大阪府' }))

    // 市区町村入力欄が出現し、高槻市を選択（従来フローへの接続）
    const input = await pickMunicipality('高槻市')
    expect(input.value).toBe('高槻市')
    fireEvent.click(screen.getByText('検索する'))

    await waitFor(() => expect(overpassCalls.length).toBe(1), { timeout: 5000 })
    expect(overpassCalls[0]).toContain('34.78051')
    expect(overpassCalls[0]).toContain('135.67264')
  }, 15000)

  it('別県タイル選択で市区町村選択がリセットされる', async () => {
    renderApp()
    fireEvent.click(screen.getByText('自治体から探す'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '大阪府' })).toBeTruthy()
    }, { timeout: 3000 })

    // 大阪府 → 高槻市
    fireEvent.click(screen.getByRole('button', { name: '大阪府' }))
    await pickMunicipality('高槻市')
    await waitFor(() => expect(getInputByLabel('市区町村').value).toBe('高槻市'), { timeout: 3000 })

    // (#55) 県選択でタイル地図が折りたためるため、別県を選ぶにはまず再展開する
    fireEvent.click(screen.getByRole('button', { name: /変更/ }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '奈良県' })).toBeTruthy()
    }, { timeout: 3000 })

    // 奈良県タイルを選択 → 市区町村入力・選択がクリアされる
    fireEvent.click(screen.getByRole('button', { name: '奈良県' }))
    await waitFor(() => {
      const s = getInputByLabel('市区町村')
      expect(s).toBeTruthy()
      expect(s.value).toBe('')
    }, { timeout: 3000 })

    // フォーカスで奈良県の全自治体候補が出る（高槻市は含まれない）
    fireEvent.focus(getInputByLabel('市区町村'))
    await waitFor(() => {
      const opts = getSuggestOptions().map(o => o.textContent)
      expect(opts.some(t => t.startsWith('奈良市'))).toBe(true)
      expect(opts.some(t => t.startsWith('高槻市'))).toBe(false)
    }, { timeout: 3000 })
  }, 15000)

  it('URL復元: selectedMunicipality同期で選択県タイルがハイライトされる', async () => {
    // 高槻市（大阪府 27）の共有URL
    renderApp('src=m&mun=272078&c=cafe&b=34.780510,135.557190,34.976670,135.672640')

    // 大阪府タイルが aria-pressed=true でハイライトされる
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '大阪府' }).getAttribute('aria-pressed')).toBe('true')
    }, { timeout: 5000 })

    // 選択色で描画されている
    expect(screen.getByRole('button', { name: '大阪府' }).querySelector('rect').getAttribute('fill')).toBe('#2563eb')
    // 他県タイルは未選択
    expect(screen.getByRole('button', { name: '奈良県' }).getAttribute('aria-pressed')).toBe('false')

    // 従来どおり市区町村入力欄も同期されている（高槻市名が表示される）
    await waitFor(() => {
      const s = getInputByLabel('市区町村')
      expect(s).toBeTruthy()
      expect(s.value).toBe('高槻市')
    }, { timeout: 5000 })
  }, 15000)

  it('キーボード操作でタイル選択 → 市区町村selectが出現する', async () => {
    renderApp()
    fireEvent.click(screen.getByText('自治体から探す'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '大阪府' })).toBeTruthy()
    }, { timeout: 3000 })

    // Enter キーで選択
    fireEvent.keyDown(screen.getByRole('button', { name: '大阪府' }), { key: 'Enter' })

    // 市区町村入力欄が出現する
    await waitFor(() => {
      const s = getInputByLabel('市区町村')
      expect(s).toBeTruthy()
    }, { timeout: 3000 })
  }, 15000)
})
