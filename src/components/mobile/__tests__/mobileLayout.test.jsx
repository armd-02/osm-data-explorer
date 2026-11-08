// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, cleanup, act } from '@testing-library/react'
import App from '../../../App'
import { getMapInstance } from '../../../hooks/useMapRef'
import { clearCache } from '../../../utils/overpass'
import { CATEGORY_GROUPS, getCategoriesForPurpose } from '../../../data/categories'

// (#59) モバイルレイアウト E2E テスト
//
// - ビューポート幅による PC/モバイル レイアウト切替（matchMedia スタブで制御）
// - モバイル3タブ（検索/一覧/その他）の遷移と状態保持（#60: 地図は検索タブ内に内蔵）
// - 検索タブ内の地図モード検索 → クエリに地図BBOXが反映される
// - 検索成功時の「一覧」タブ自動切替
// - 検索タブの「この表示範囲で検索」明示トリガー（地図移動だけでは検索しない）
// - 施設カードタップ → 詳細ボトムシート → 「地図で見る」
// - マーカータップ → 詳細ボトムシート
// - 自治体モード検索
// - エラー時: バannerがタブ切替をまたいで表示される
//
// MapLibre GLはWebGLが必要でjsdomでは初期化できないためモジュール全体をモックする。
// vi.mockファクトリはファイル先頭にホイスされるため、共通モックは動的importで参照。
// マップインスタンスの操作は mockState.api._state.maps から取得できる。
const mockState = vi.hoisted(() => ({ api: null }))
vi.mock('maplibre-gl', async () => {
  const mod = await import('../../../test/maplibreMock')
  mockState.api = mod.createMapLibreMock()
  return { default: mockState.api }
})

// ===== テスト用データ =====
const MUNI_DATA = {
  municipalities: [
    { code: '271000', prefCode: '27', prefecture: '大阪府', name: '東大阪市', adminLevel: 8, bbox: { south: 34.56, west: 135.34, north: 34.72, east: 135.52 } },
    { code: '27109', prefCode: '27', prefecture: '大阪府', name: '大阪市', adminLevel: 7, bbox: { south: 34.56, west: 135.34, north: 34.72, east: 135.52 }, displayName: '大阪市（都府県）' },
    { code: '27102', prefCode: '27', prefecture: '大阪府', name: '大阪市北区', adminLevel: 8, bbox: { south: 34.78051, west: 135.47011, north: 34.79045, east: 135.50012 } },
    { code: '27103', prefCode: '27', prefecture: '大阪府', name: '大阪市中央区', adminLevel: 8, bbox: { south: 34.66000, west: 135.47000, north: 34.69000, east: 135.50000 } },
  ]
}

const OVERPASS_ELEMENTS = [
  { type: 'node', id: 1001, lat: 34.85, lon: 135.5, tags: { name: 'テスト珈琲店', amenity: 'cafe', cuisine: 'coffee', 'addr:city': '大阪市', 'addr:suburb': '梅田', 'addr:street': '1-1', phone: '+81-6-1234-5678', website: 'https://example.com/coffee', wheelchair: 'yes', 'wheelchair:description:ja': '段差なし' } },
  { type: 'node', id: 1002, lat: 34.86, lon: 135.51, tags: { name: 'ラーメン屋テスト', amenity: 'restaurant', cuisine: 'ramen' } },
  { type: 'way', id: 2001, center: { lat: 34.87, lon: 135.52 }, tags: { name: 'テスト書店', shop: 'books' } },
]

// ===== フック =====
let mediaMatches = true
let mediaListeners = []
let overpassCalls = []
let overpassStatus = 200

function setupMatchMedia() {
  mediaListeners = []
  window.matchMedia = (query) => ({
    matches: mediaMatches,
    media: query,
    addEventListener: (type, cb) => {
      if (type === 'change') mediaListeners.push(cb)
    },
    removeEventListener: (type, cb) => {
      mediaListeners = mediaListeners.filter((l) => l !== cb)
    },
  })
}

function fireMediaChange(matches) {
  mediaMatches = matches
  mediaListeners.forEach((cb) => cb({ matches }))
}

function setupFetchMock() {
  const mockFetch = vi.fn(async (url, options = {}) => {
    const u = String(url)
    if (u.includes('municipalities.json')) {
      return { ok: true, status: 200, headers: new Map(), json: async () => MUNI_DATA }
    }
    if (u.includes('interpreter') || u.includes('sakura') || u.includes('overpass')) {
      const body = options.body || ''
      const q = new URLSearchParams(body).get('data') || body
      overpassCalls.push(q)
      if (overpassStatus !== 200) {
        return { ok: false, status: overpassStatus, headers: new Map(), json: async () => ({}) }
      }
      return {
        ok: true,
        status: 200,
        headers: new Map(),
        json: async () => ({ version: 0.6, generator: 'Overpass API', osm3s: {}, elements: OVERPASS_ELEMENTS }),
      }
    }
    return { ok: false, status: 404, headers: new Map(), json: async () => ({}) }
  })
  vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch)
}

function renderApp(query = '') {
  window.history.replaceState(null, '', query ? `?${query}` : '/')
  render(<App />)
}

const IT_TIMEOUT = 15000

// 下部ナビからタブを操作
function navButtons() {
  return within(screen.getByRole('navigation', { name: 'モバイルナビゲーション' }))
}
function clickTab(label) {
  fireEvent.click(navButtons().getByRole('button', { name: label }))
}
function tabIsCurrent(label) {
  const btn = navButtons().getByRole('button', { name: label })
  return btn.getAttribute('aria-current') === 'page'
}

// labelテキストから対応するselectを取得（municipalityFlow.test.jsx と同じパターン）
function getSelectByLabel(label) {
  const el = screen.getByText(label)
  let node = el
  while (node && node.tagName !== 'DIV') node = node.parentElement
  return node?.querySelector('select')
}

/**
 * (#44) 目的チップ→カテゴリチップ でカテゴリを選択する
 * 例: selectCategoryChip('カフェ') → 「食べる」をタップ → 「カフェ」をタップ
 */
function selectCategoryChip(catLabel) {
  for (const g of CATEGORY_GROUPS) {
    const cats = getCategoriesForPurpose(g.name) || []
    const cat = cats.find((c) => c.label === catLabel)
    if (!cat) continue
    fireEvent.click(screen.getByRole('button', { name: g.name }))
    fireEvent.click(screen.getByRole('button', { name: catLabel }))
    return true
  }
  throw new Error(`カテゴリチップが見つからない: ${catLabel}`)
}

async function selectMunicipality(prefText, munText, prefLabel = '都道府県', munLabel = '市区町村') {
  await waitFor(() => {
    expect(screen.getByText(prefLabel)).toBeTruthy()
  }, { timeout: 3000 })
  const prefSelect = getSelectByLabel(prefLabel)
  expect(prefSelect).toBeTruthy()
  const prefOpt = [...prefSelect.querySelectorAll('option')].find((o) => o.textContent === prefText)
  expect(prefOpt).toBeTruthy()
  fireEvent.change(prefSelect, { target: { value: prefOpt.value } })

  await waitFor(() => {
    const s = getSelectByLabel(munLabel)
    expect(s).toBeTruthy()
    expect(s.querySelectorAll('option').length).toBeGreaterThan(1)
  }, { timeout: 3000 })
  const munSelect = getSelectByLabel(munLabel)
  const munOpt = [...munSelect.querySelectorAll('option')].find((o) => o.textContent.startsWith(munText))
  expect(munOpt).toBeTruthy()
  fireEvent.change(munSelect, { target: { value: munOpt.value } })
}

beforeEach(() => {
  mediaMatches = true
  setupMatchMedia()
  if (mockState.api) mockState.api.resetState()
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  overpassCalls = []
  overpassStatus = 200
  setupFetchMock()
  clearCache()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('(#59) レイアウト切替（ビューポート幅ベース）', () => {
  it('幅<1024px: モバイルシェル（下部ナビ4タブ）が表示され、PCレイアウトは出ない', async () => {
    mediaMatches = true
    renderApp()

    // 下部ナビが3タブで表示される（#60: 地図タブは廃止、地図は検索タブ内に内蔵）
    const nav = screen.getByRole('navigation', { name: 'モバイルナビゲーション' })
    for (const label of ['検索', '一覧', 'その他']) {
      expect(within(nav).getByRole('button', { name: label })).toBeTruthy()
    }
    expect(tabIsCurrent('検索')).toBe(true)
    expect(within(nav).queryByRole('button', { name: '地図' })).toBeNull()

    // PCレイアウト固有の要素は存在しない
    expect(screen.queryByText('地図を隠す')).toBeNull()
    expect(screen.queryByText('施設検索')).toBeNull()
  }, IT_TIMEOUT)

  it('幅>=1024px: 現行のPCレイアウトのまま（モバイルナビなし）', async () => {
    mediaMatches = false
    renderApp()

    // 廃止された上部タブバーは存在しない（nav要素がPCレイアウトに無い）
    expect(screen.queryByRole('navigation')).toBeNull()

    // タイトル行右端: ハンバーガーメニューボタン（旧タブバーの代替）
    const menuBtn = screen.getByRole('button', { name: 'メニュー' })
    expect(menuBtn).toBeTruthy()
    // デフォルト画面は施設検索で、画面の中身は既存構成のまま（地図切替ボタン等）
    expect(screen.getByText('地図を隠す')).toBeTruthy()

    // メニューからの画面切替（新仕様: PCでもタイトル行右端のハンバーガーメニューで切替）
    fireEvent.click(menuBtn)
    // メニューを開くと、3つの画面項目+フッター項目が揃って表示される
    const menu = await screen.findByRole('menu', { name: 'メニュー' })
    for (const label of ['施設検索', '店名→座標CSV', '集計・出力', 'まちデータ帳とは']) {
      expect(within(menu).getByRole('menuitem', { name: label })).toBeTruthy()
    }
    // 「店名→座標CSV」を選択して切替
    fireEvent.click(within(menu).getByRole('menuitem', { name: '店名→座標CSV' }))
    // 店名→座標CSV画面（BatchMatch）に切り替わり、メニューは閉じる
    await screen.findByRole('button', { name: '照合' })
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull()
    })

    // モバイル下部ナビは存在しない
    expect(screen.queryByRole('navigation', { name: 'モバイルナビゲーション' })).toBeNull()
  }, IT_TIMEOUT)

  it('matchMedia change でレイアウトが追従する（回転・キーボード表示に対応）', async () => {
    mediaMatches = false
    renderApp()
    // PCレイアウト: タイトル行右端のハンバーガーメニューボタン + 施設検索画面（地図切替）
    expect(screen.getByRole('button', { name: 'メニュー' })).toBeTruthy()
    expect(screen.getByText('地図を隠す')).toBeTruthy()

    // 横画面へ回転（幅が1024px未満になる）→ モバイルシェル
    fireMediaChange(true)
    // 下部ナビが出現し、モバイルの検索タブ（「この表示範囲で検索」）が表示される
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'モバイルナビゲーション' })).toBeTruthy()
    }, { timeout: 3000 })
    expect(screen.getByRole('button', { name: 'この表示範囲で検索' })).toBeTruthy()
    // PC固有の要素（メニューボタン・地図切替）は消える
    expect(screen.queryByRole('button', { name: 'メニュー' })).toBeNull()
    expect(screen.queryByText('地図を隠す')).toBeNull()

    // 元に戻る → PCレイアウト
    fireMediaChange(false)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'メニュー' })).toBeTruthy()
    }, { timeout: 3000 })
    // 施設検索画面が復帰し、モバイル下部ナビは消える
    expect(screen.getByText('地図を隠す')).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'モバイルナビゲーション' })).toBeNull()
  }, IT_TIMEOUT)
})

describe('(#59) 検索タブ: 地図モード検索', () => {
  it('カテゴリ選択→検索する: クエリにカテゴリと地図BBOXが反映され、結果が表示される', async () => {
    renderApp()

    // カテゴリ=cafe を目的チップで選択（食べる → カフェ）
    expect(selectCategoryChip('カフェ')).toBe(true)

    // フッター（スロールームの外）の「この表示範囲で検索」を押す
    fireEvent.click(screen.getByRole('button', { name: 'この表示範囲で検索' }))

    await waitFor(() => expect(overpassCalls).toHaveLength(1), { timeout: 8000 })
    // カテゴリフィルタと地図の現在表示範囲（モックBBOX）がクエリに含まれる
    expect(overpassCalls[0]).toContain('amenity=cafe')
    expect(overpassCalls[0]).toContain('34.800000,135.400000,34.900000,135.600000')

    await waitFor(() => {
      expect(screen.getByText('3件の結果を取得しました')).toBeTruthy()
    }, { timeout: 8000 })
  }, IT_TIMEOUT)

  it('検索成功後は「一覧」タブへ自動切替され、施設カードが表示される', async () => {
    renderApp()

    selectCategoryChip('カフェ')
    fireEvent.click(screen.getByRole('button', { name: 'この表示範囲で検索' }))

    await waitFor(() => {
      expect(tabIsCurrent('一覧')).toBe(true)
    }, { timeout: 8000 })

    // (#44) 選択カテゴリ（カフェ）で結果が絞り込まれる: cafeカードのみ表示
    // （モックはクエリ非依存の3件を返すが、reducerのミラーでcatFilter=cafeが適用される）
    expect(screen.getByRole('button', { name: /テスト珈琲店/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /ラーメン屋テスト/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /テスト書店/ })).toBeNull()
    expect(screen.getByText(/3件中、\s*1\s*件を表示/)).toBeTruthy()
  }, IT_TIMEOUT)

  it('タブを離れても検索条件（キーワード入力）が保持される', async () => {
    renderApp()

    // キーワード入力（検索タブ）
    const kwInput = screen.getByPlaceholderText('例: 珈琲、ラーメン')
    fireEvent.change(kwInput, { target: { value: 'テスト' } })

    // 一覧タブ→その他タブ→検索タブ と往復
    clickTab('一覧')
    clickTab('その他')
    clickTab('検索')

    // 入力が保持されている（コンポーネントがアンマウントされていない）
    const kwAfter = screen.getByPlaceholderText('例: 珈琲、ラーメン')
    expect(kwAfter.value).toBe('テスト')
  }, IT_TIMEOUT)
})

describe('(#59/#60) 検索タブ: 地図の明示的な検索トリガー', () => {
  it('「この表示範囲で検索」押下で地図BBOXを検索に使用する', async () => {
    renderApp()

    // 検索タブでカテゴリを設定（レストラン）
    selectCategoryChip('レストラン')
    expect(overpassCalls).toHaveLength(0)

    // 地図のmoveend（移動・拡大）だけでは検索が実行されない
    const map = getMapInstance()
    expect(map).toBeTruthy()
    act(() => {
      map.fire('moveend')
      map.fire('zoomend')
    })
    expect(overpassCalls).toHaveLength(0)

    // 明示的なボタン押下で検索が実行される（moveend後の再レンダリングで有効化される）
    const mapSearchBtn = screen.getByRole('button', { name: 'この表示範囲で検索' })
    await waitFor(() => {
      expect(mapSearchBtn.hasAttribute('disabled')).toBe(false)
    }, { timeout: 3000 })
    fireEvent.click(mapSearchBtn)
    await waitFor(() => expect(overpassCalls).toHaveLength(1), { timeout: 8000 })
    expect(overpassCalls[0]).toContain('amenity=restaurant')
    expect(overpassCalls[0]).toContain('34.800000,135.400000,34.900000,135.600000')
  }, IT_TIMEOUT)

  it('マーカータップで施設詳細ボトムシートが開く', async () => {
    renderApp()

    selectCategoryChip('カフェ')
    fireEvent.click(screen.getByRole('button', { name: 'この表示範囲で検索' }))

    // 検索成功後は一覧タブに自動切替される。検索タブに戻って地図のマーカーをタップ
    await waitFor(() => {
      expect(tabIsCurrent('一覧')).toBe(true)
    }, { timeout: 8000 })
    clickTab('検索')

    // 結果が地図のクラスタリングGeoJSONに反映されるまで待つ
    await waitFor(() => {
      const map = getMapInstance()
      const features = map._lastGeoJSON?.data?.features || []
      expect(features.length).toBeGreaterThanOrEqual(3)
    }, { timeout: 8000 })

    // 最初のマーカー（テスト珈琲店 node/1001）をタップ → pointレイヤのclickイベントを発火
    const map = getMapInstance()
    const feature = map._lastGeoJSON.data.features.find((f) => f.properties.key === 'node/1001')
    expect(feature).toBeTruthy()
    act(() => {
      map.fire('click', 'point-circle', {
        features: [feature],
        lngLat: { lat: feature.geometry.coordinates[1], lng: feature.geometry.coordinates[0] }
      })
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /施設詳細: テスト珈琲店/ })).toBeTruthy()
    }, { timeout: 3000 })
  }, IT_TIMEOUT)
})

describe('(#59) 施設カード→詳細ボトムシート→地図で見る', () => {
  it('カードタップ→詳細表示→「地図で見る」で地図タブに移動する', async () => {
    renderApp()

    selectCategoryChip('カフェ')
    fireEvent.click(screen.getByRole('button', { name: 'この表示範囲で検索' }))

    // 一覧タブがアクティブになりカードが表示される
    await waitFor(() => {
      expect(tabIsCurrent('一覧')).toBe(true)
    }, { timeout: 8000 })

    // 施設カードをタップ
    fireEvent.click(screen.getByRole('button', { name: /テスト珈琲店/ }))

    // ボトムシート（dialog）が開く: 名称・住所・OSMリンク・タグ
    const dialog = await waitFor(() => {
      const d = screen.queryByRole('dialog', { name: /施設詳細: テスト珈琲店/ })
      expect(d).toBeTruthy()
      return d
    }, { timeout: 3000 })
    expect(within(dialog).getByText(/大阪市 梅田 1-1/)).toBeTruthy()
    expect(within(dialog).getByText(/OSMで見る（node\/1001）/)).toBeTruthy()
    expect(within(dialog).getByText('cafe')).toBeTruthy()
    // (#61) バリアフリー情報: 車椅子対応バッジ + :ja説明
    expect(within(dialog).getByText(/バリアフリー情報/)).toBeTruthy()
    expect(within(dialog).getByText('車椅子対応')).toBeTruthy()
    // 説明はnoteとタグ一覧の両方に出る（≥1）
    expect(within(dialog).getAllByText('段差なし').length).toBeGreaterThanOrEqual(1)

    // 「地図で見る」: シートが閉じられ検索タブ（地図モード）へ移動
    fireEvent.click(within(dialog).getByRole('button', { name: '地図で見る' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    }, { timeout: 3000 })
    expect(tabIsCurrent('検索')).toBe(true)

    // (#60) activeResultId経由で地図が施設（テスト珈琲店 34.85,135.5）へパンする
    const map0 = getMapInstance()
    await waitFor(() => {
      // MapLibreのpanToは[経度, 緯度]順
      expect(map0._calls.some((c) => c.name === 'panTo' && Array.isArray(c.args[0]) && c.args[0][0] === 135.5 && c.args[0][1] === 34.85)).toBe(true)
    }, { timeout: 3000 })

    // 「閉じる」でシートが閉じられる（再オープンして確認）
    const map = getMapInstance()
    const feature2 = map._lastGeoJSON?.data?.features?.find((f) => f.properties.key === 'node/1001')
    expect(feature2).toBeTruthy()
    act(() => {
      map.fire('click', 'point-circle', {
        features: [feature2],
        lngLat: { lat: feature2.geometry.coordinates[1], lng: feature2.geometry.coordinates[0] }
      })
    })
    const dialog2 = await waitFor(() => {
      const d = screen.queryByRole('dialog')
      expect(d).toBeTruthy()
      return d
    }, { timeout: 3000 })
    fireEvent.click(within(dialog2).getByRole('button', { name: '閉じる' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    }, { timeout: 3000 })
    // 検索タブは維持される
    expect(tabIsCurrent('検索')).toBe(true)
  }, IT_TIMEOUT)
})

describe('(#59) 一覧タブ: クライアント側フィルタ', () => {
  it('施設名フィルタでカードが絞られ、件数表示も更新される', async () => {
    renderApp()

    // キーワード検索（カテゴリ未選択=汎用POIクエリ）→ 全3件がフィルタ対象になる
    const kwInput = screen.getByPlaceholderText('例: 珈琲、ラーメン')
    fireEvent.change(kwInput, { target: { value: 'テスト' } })
    fireEvent.click(screen.getByRole('button', { name: 'この表示範囲で検索' }))

    await waitFor(() => {
      expect(tabIsCurrent('一覧')).toBe(true)
    }, { timeout: 8000 })
    expect(screen.getByText(/3件中、3件を表示/)).toBeTruthy()

    // 施設名フィルタ: 「珈琲」→ テスト珈琲店の1件のみ
    const nameInput = screen.getByLabelText('施設名で絞り込む')
    fireEvent.change(nameInput, { target: { value: '珈琲' } })

    await waitFor(() => {
      expect(screen.getByText(/3件中、1件を表示/)).toBeTruthy()
    }, { timeout: 3000 })
    expect(screen.getByRole('button', { name: /テスト珈琲店/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /ラーメン屋テスト/ })).toBeNull()
  }, IT_TIMEOUT)

  it('検索0件時は専用のガイダンス（EditPanel）が表示される', async () => {
    renderApp()

    // 結果0件を返すようにする
    overpassCalls = []
    globalThis.fetch.mockImplementation(async (url, options = {}) => {
      const u = String(url)
      if (u.includes('municipalities.json')) {
        return { ok: true, status: 200, headers: new Map(), json: async () => MUNI_DATA }
      }
      if (u.includes('interpreter') || u.includes('sakura') || u.includes('overpass')) {
        const body = (options.body) || ''
        overpassCalls.push(new URLSearchParams(body).get('data') || body)
        return {
          ok: true, status: 200, headers: new Map(),
          json: async () => ({ version: 0.6, generator: 'Overpass API', osm3s: {}, elements: [] }),
        }
      }
      return { ok: false, status: 404, headers: new Map(), json: async () => ({}) }
    })

    selectCategoryChip('カフェ')
    fireEvent.click(screen.getByRole('button', { name: 'この表示範囲で検索' }))

    // 0件ガイダンスが表示され、一覧タブに自動切替される
    await waitFor(() => {
      expect(tabIsCurrent('一覧')).toBe(true)
    }, { timeout: 8000 })
    await waitFor(() => {
      expect(screen.getByText(/検索結果が見つかりません/)).toBeTruthy()
    }, { timeout: 3000 })
  }, IT_TIMEOUT)
})

describe('(#59) 自治体モード検索', () => {
  it('「自治体から探す」→市区町村選択→検索: 自治体BBOXのPOIクエリが送出される', async () => {
    renderApp()

    // ソース切替（検索タブ内のタブボタン）
    fireEvent.click(screen.getByRole('tab', { name: '自治体から探す' }))

    // 大阪府→大阪市（都府県レベル）を選択（モバイルラベル）
    await selectMunicipality('大阪府', '大阪市（都府県）', 'どの県で探す？', 'どの市区町村で探す？')

    // 検索（カテゴリ未選択=POI検索）
    fireEvent.click(screen.getByRole('button', { name: '検索する' }))

    await waitFor(() => expect(overpassCalls).toHaveLength(1), { timeout: 8000 })
    const q = overpassCalls[0]
    // 自治体BBOXが反映される
    expect(q).toContain('34.560000,135.340000,34.720000,135.520000')
    // カテゴリ未選択時はPOIタグ制約クエリになる
    expect(q).toContain('amenity')
    expect(q).toContain('shop')

    await waitFor(() => {
      expect(screen.getByText('3件の結果を取得しました')).toBeTruthy()
    }, { timeout: 8000 })
  }, IT_TIMEOUT)
})

describe('(#44) 目的チップ', () => {
  it('目的チップ: 「買う」をタップすると具体カテゴリチップが展開し、選択すると解除ボタンが出る', () => {
    renderApp()

    // 「買う」目的チップをタップ → 2つのカテゴリチップが展開
    fireEvent.click(screen.getByRole('button', { name: '買う' }))
    expect(screen.getByRole('button', { name: 'コンビニ・スーパー' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '小売店' })).toBeTruthy()

    // 「コンビニ・スーパー」を選択 → 選択中バッジと解除ボタン（チップ行は閉じる）
    fireEvent.click(screen.getByRole('button', { name: 'コンビニ・スーパー' }))
    expect(screen.getByText(/コンビニ・スーパー/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '解除' })).toBeTruthy()

    // 解除で選択がリセットされる（チップ行も閉じる）
    fireEvent.click(screen.getByRole('button', { name: '解除' }))
    expect(screen.queryByRole('button', { name: 'コンビニ・スーパー' })).toBeNull()
  }, IT_TIMEOUT)

  it('サンプル検索セクションは削除済み（「サンプル検索で試す」が存在しない）', () => {
    renderApp()

    // セクション自体がレンダされない
    expect(screen.queryByRole('region', { name: 'サンプル検索' })).toBeNull()
    expect(screen.queryByText('サンプル検索で試す')).toBeNull()
    // サンプル用の即検索ボタン（アイコン付きラベル）が残存していない
    expect(screen.queryByRole('button', { name: /☕/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /💊/ })).toBeNull()

    // 残りの検索機能はそのまま動作する（地図モードの検索範囲カード等）
    expect(screen.getByText('どの街・エリアで探す？')).toBeTruthy()
  }, IT_TIMEOUT)
})

describe('(#59) エラー表示の継続性', () => {
  it('全エンドポイント失敗時もエラーbannerが表示され、タブ切替をまたいで残る', async () => {
    overpassStatus = 503
    renderApp()

    selectCategoryChip('カフェ')
    fireEvent.click(screen.getByRole('button', { name: 'この表示範囲で検索' }))

    // フォールバックチェーン（3エンドポイント）を順に試したあとエラーになる
    await waitFor(() => {
      expect(screen.getByText(/サーバーエラー/)).toBeTruthy()
    }, { timeout: 12000 })
    expect(overpassCalls.length).toBeGreaterThanOrEqual(2)

    // エラーのときも「検索」タブに自動切替される
    expect(tabIsCurrent('検索')).toBe(true)

    // 一覧タブへ移動してもエラーbannerは残る（全タブ共通表示）
    clickTab('一覧')
    expect(screen.getByText(/サーバーエラー/)).toBeTruthy()
  }, IT_TIMEOUT)
})
