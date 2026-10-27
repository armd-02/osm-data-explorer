// @vitest-environment jsdom
/**
 * (#47 追跡) 自治体モード E2E 統合テスト
 *
 * ユーザー報告: 「カテゴリが全く変わってない」— 自治体モードでカテゴリを変更しても
 * 検索クエリに反映されない、という報告に対する検証・回帰防止テスト。
 *
 * 検証内容:
 * 1. 市区町村選択 → カテゴリ変更 → 検索 → クエリに新カテゴリが反映される
 * 2. 検索後、カテゴリをさらに変更 → 再検索 → クエリが更新カテゴリで再発行される
 * 3. 旧バグの回帰確認: カテゴリ変更のdispatchと検索が同一クリック内でも
 *    buildSearchCriteriaのスナップショットで最新値が使える（dispatch競合なし）
 * 4. URL復元: 共有URL（src=m&mun=..&c=..&b=..）を開いたとき、
 *    市区町村select・カテゴリselectが正しく復元される（stale closure対策の確認）
 * 5. モード切替: 地図モードで選んだカテゴリが自治体モードに引き継がれる
 *
 * 旧実装（#48以前）のバグ機構:
 *   MunicipalitySearch.handleSearch() が
 *     dispatch(SET_SIMPLE_SEARCH {category}) → search(bbox) を同一ハンドラ内で実行し、
 *     search() が未反映のstate（dispatch前の値）でクエリを生成していた。
 *   → ユーザーが選んだカテゴリが永遠にクエリに使われない「カテゴリが変わらない」状態。
 *   新実装はクリック時点で buildSearchCriteria() がstateスナップショット+クエリ文字列を
 *   生成し、search(criteria) がそのクエリをそのまま実行するため構造的に回避される。
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import App from '../../App'
import { clearCache } from '../../utils/overpass'

// Leafletはjsdomで初期化できないため完全にモックする
// 注: vi.mockファクトリはファイル先頭にhoistされるため、
// トップレベル変数を参照せずファクトリ内で定義する。
// MapView.jsxはdefault import（import L from 'leaflet'）を使うためdefaultエクスポートが必須。
vi.mock('leaflet', () => {
  const bounds = {
    pad: () => bounds,
    getSouth: () => 34.8, getWest: () => 135.4, getNorth: () => 34.9, getEast: () => 135.6
  }
  // チェーン可能レイヤモック（.addTo(map)・.bindPopup() 等のチェーンに対応）
  const layer = {
    addTo: () => layer, remove: () => {}, on: () => layer, off: () => {},
    bindPopup: () => layer, openPopup: () => {}, bindTooltip: () => layer,
    setIcon: () => layer, setLatLng: () => {}, getElement: () => null
  }
  const map = {
    setView: () => {}, on: () => {}, off: () => {}, add: () => {}, remove: () => {},
    removeLayer: () => {}, fitBounds: () => {}, panTo: () => {},
    getBounds: () => bounds, getZoom: () => 12,
    getCenter: () => ({ lat: 34.85, lng: 135.5 }),
    latLngToContainerPoint: () => ({ x: 0, y: 0 }), getPixelBounds: () => ({})
  }
  const api = {
    map: () => map,
    tileLayer: () => ({ ...layer }),
    latLngBounds: () => bounds,
    rectangle: () => layer,
    marker: () => layer,
    divIcon: () => ({})
  }
  return { ...api, default: api }
})

// jsdomにないAPIのスタブ
class MockResizeObserver { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => {
  global.ResizeObserver = global.ResizeObserver || MockResizeObserver
  if (!window.matchMedia) {
    window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
  }
})

/**
 * municipalities.json フィクスチャ
 * 実データの形式（municipalitiesエントリに prefecture/prefCode が含まれ、
 * 独立した prefectures キーはない）に合わせる。
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

const overpassCalls = []

let mockFetch
beforeEach(() => {
  overpassCalls.length = 0
  // Overpassキャッシュをクリア（キャッシュ命中でfetchがスキップされるのを防ぐ）
  clearCache()

  mockFetch = vi.fn(async (url, options) => {
    const u = String(url)
    if (u.includes('municipalities.json')) {
      return { ok: true, json: async () => MUNI_DATA }
    }
    if (u.includes('interpreter')) {
      // Overpass API: POST bodyは data=<urlencoded query> 形式
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
  // URLをリセット（テスト間で漏れないように）
  window.history.replaceState(null, '', '/')
})

// ラベルベースのselect取得（ResultsPanel等のselectと混同しない）
const getSelectByLabel = (label) => {
  const el = screen.getByText(label)
  let node = el
  while (node && node.tagName !== 'DIV') node = node.parentElement
  return node?.querySelector('select')
}

// URL設定 + Appレンダリング
function renderApp(query = '') {
  window.history.replaceState(null, '', query ? `?${query}` : '/')
  render(<App />)
}

const IT_TIMEOUT = 15000 // waitFor(5000ms)に余裕を持たせる

// 都道府県→市区町村を選択（selectがレンダされるまで待つ）
async function selectMunicipality(prefText, munText) {
  await waitFor(() => {
    expect(screen.getByText('都道府県')).toBeTruthy()
  }, { timeout: 3000 })
  const prefSelect = getSelectByLabel('都道府県')
  expect(prefSelect).toBeTruthy()

  // プリフェクチャコードをテキストから逆算
  const options = [...prefSelect.querySelectorAll('option')]
  const prefOpt = options.find(o => o.textContent === prefText)
  expect(prefOpt).toBeTruthy()
  fireEvent.change(prefSelect, { target: { value: prefOpt.value } })

  // 市区町村selectの出現を待ってから選択
  await waitFor(() => {
    const s = getSelectByLabel('市区町村')
    expect(s).toBeTruthy()
    expect(s.querySelectorAll('option').length).toBeGreaterThan(1)
  }, { timeout: 3000 })
  const munSelect = getSelectByLabel('市区町村')
  const munOpt = [...munSelect.querySelectorAll('option')].find(o => o.textContent.startsWith(munText))
  expect(munOpt).toBeTruthy()
  fireEvent.change(munSelect, { target: { value: munOpt.value } })
}

describe('自治体モード E2E（カテゴリ反映の検証）', () => {
  it('市区町村選択→カテゴリ変更→検索: クエリに選択カテゴリが反映される', async () => {
    renderApp()

    // 「自治体で検索」タブへ
    fireEvent.click(screen.getByText('自治体で検索'))

    // 大阪府 → 高槻市 を選択
    await selectMunicipality('大阪府', '高槻市')

    // カテゴリselectが出現（value=初期 ''）
    const catSelect = await waitFor(() => {
      const s = getSelectByLabel('カテゴリ（任意）')
      expect(s).toBeTruthy()
      return s
    }, { timeout: 3000 })
    expect(catSelect.value).toBe('')

    // カテゴリを「カフェ」に変更
    fireEvent.change(catSelect, { target: { value: 'cafe' } })
    await waitFor(() => expect(catSelect.value).toBe('cafe'))

    // 検索クリック
    fireEvent.click(screen.getByText('検索する'))

    // Overpassクエリが amenity=cafe を含むことを確認
    await waitFor(() => expect(overpassCalls.length).toBe(1), { timeout: 5000 })
    expect(overpassCalls[0]).toContain('amenity=cafe')
    // 高槻市のBBOX范围内使用
    expect(overpassCalls[0]).toContain('34.78051')
    expect(overpassCalls[0]).toContain('135.67264')
  }, IT_TIMEOUT)

  it('検索後のカテゴリ変更→再検索: クエリが更新カテゴリで再発行される', async () => {
    renderApp()
    fireEvent.click(screen.getByText('自治体で検索'))
    await selectMunicipality('大阪府', '高槻市')

    const catSelect = await waitFor(() => {
      const s = getSelectByLabel('カテゴリ（任意）')
      expect(s).toBeTruthy()
      return s
    }, { timeout: 3000 })

    // 1回目: カフェで検索
    fireEvent.change(catSelect, { target: { value: 'cafe' } })
    fireEvent.click(screen.getByText('検索する'))
    await waitFor(() => expect(overpassCalls.length).toBe(1), { timeout: 5000 })
    expect(overpassCalls[0]).toContain('amenity=cafe')

    // カテゴリを「レストラン」に変更
    await waitFor(() => {
      // 検索完了（ボタンが「検索する」に復帰）を待つ
      expect(screen.getByText('検索する')).toBeTruthy()
    }, { timeout: 5000 })
    fireEvent.change(catSelect, { target: { value: 'restaurant' } })
    await waitFor(() => expect(catSelect.value).toBe('restaurant'))

    // 2回目: レストランで再検索
    fireEvent.click(screen.getByText('検索する'))
    await waitFor(() => expect(overpassCalls.length).toBe(2), { timeout: 5000 })

    // 2番目のクエリは restaurant を含み、cafe を含まない
    expect(overpassCalls[1]).toContain('amenity=restaurant')
    expect(overpassCalls[1]).not.toContain('amenity=cafe')
  }, IT_TIMEOUT)

  it('カテゴリ変更のdispatchと検索クリックが連続しても最新カテゴリが使える（dispatch競合の回帰テスト）', async () => {
    renderApp()
    fireEvent.click(screen.getByText('自治体で検索'))
    await selectMunicipality('大阪府', '高槻市')

    const catSelect = await waitFor(() => {
      const s = getSelectByLabel('カテゴリ（任意）')
      expect(s).toBeTruthy()
      return s
    }, { timeout: 3000 })

    // 旧バグのシナリオ: カテゴリ変更のdispatchが未commitの状態で検索が呼ばれる
    // （React 18のbatching下で、同一タスク内のdispatch+検索クリック）
    fireEvent.change(catSelect, { target: { value: 'pharmacy' } })
    // 再レンダを待たずに即座に検索クリック
    fireEvent.click(screen.getByText('検索する'))

    await waitFor(() => expect(overpassCalls.length).toBe(1), { timeout: 5000 })
    // 最新カテゴリ(pharmacy)がクエリに使われていなければ旧バグの回帰
    expect(overpassCalls[0]).toContain('amenity=pharmacy')
  }, IT_TIMEOUT)

  it('URL復元: 共有URLから市区町村・カテゴリがselectに復元される', async () => {
    // 高槻市のbbox + カテゴリ=cafe をエンコードした共有URL
    renderApp('src=m&mun=272078&c=cafe&b=34.780510,135.557190,34.976670,135.672640')

    // 自治体モードタブが有効
    const munTab = screen.getByText('自治体で検索')
    expect(munTab.closest('button')?.className).toContain('bg-white')

    // 市区町村selectが「高槻市」に復元される（stale closure対策の確認）
    await waitFor(() => {
      const prefSelect = getSelectByLabel('都道府県')
      expect(prefSelect.value).toBe('27')
      const munSelect = getSelectByLabel('市区町村')
      expect(munSelect).toBeTruthy()
      expect(munSelect.value).toBe('272078')
    }, { timeout: 5000 })

    // カテゴリselectが「カフェ」に復元される
    const catSelect = await waitFor(() => {
      const s = getSelectByLabel('カテゴリ（任意）')
      expect(s).toBeTruthy()
      return s
    }, { timeout: 5000 })
    expect(catSelect.value).toBe('cafe')

    // 検索ボタンのBBOX表示に自治体BBOX（URLのb=）が反映される
    expect(screen.getByText(/高槻市とその周辺/)).toBeTruthy()

    // その状態で検索 → cafeクエリが発行される
    fireEvent.click(screen.getByText('検索する'))
    await waitFor(() => expect(overpassCalls.length).toBe(1), { timeout: 5000 })
    expect(overpassCalls[0]).toContain('amenity=cafe')
  }, IT_TIMEOUT)

  it('モード切替: 地図モードのカテゴリが自治体モードに引き継がれる（last-wins）', async () => {
    renderApp()

    // 地図モード（初期）でカテゴリ「カフェ」を選択
    const mapCatSelect = getSelectByLabel('探したいカテゴリ')
    expect(mapCatSelect).toBeTruthy()
    fireEvent.change(mapCatSelect, { target: { value: 'cafe' } })
    await waitFor(() => expect(mapCatSelect.value).toBe('cafe'))

    // 「自治体で検索」タブへ切替
    fireEvent.click(screen.getByText('自治体で検索'))

    // 大阪府 → 高槻市 を選択
    await selectMunicipality('大阪府', '高槻市')

    // カテゴリselectが「カフェ」に引き継がれている
    const catSelect = await waitFor(() => {
      const s = getSelectByLabel('カテゴリ（任意）')
      expect(s).toBeTruthy()
      return s
    }, { timeout: 5000 })
    expect(catSelect.value).toBe('cafe')
  }, IT_TIMEOUT)

  it('カテゴリ変更はlast-wins: 切替後に变更した値が元モードに戻っても優先される（#49改訂）', async () => {
    renderApp()

    // 1. 自治体モードで高槻市選択 + カテゴリ=レストラン
    fireEvent.click(screen.getByText('自治体で検索'))
    await selectMunicipality('大阪府', '高槻市')
    const munCat = await waitFor(() => {
      const s = getSelectByLabel('カテゴリ（任意）')
      expect(s).toBeTruthy()
      return s
    }, { timeout: 5000 })
    fireEvent.change(munCat, { target: { value: 'restaurant' } })
    await waitFor(() => expect(munCat.value).toBe('restaurant'))

    // 2. 地図モードへ切替: 地図側のカテゴリもレストランになる
    //    （この際、#47設計により選択済み自治体はクリアされる）
    fireEvent.click(screen.getByText('地図範囲で検索'))
    const mapCat = getSelectByLabel('探したいカテゴリ')
    await waitFor(() => expect(mapCat.value).toBe('restaurant'), { timeout: 3000 })

    // 3. 地図モードでカフェに変更
    fireEvent.change(mapCat, { target: { value: 'cafe' } })
    await waitFor(() => expect(mapCat.value).toBe('cafe'))

    // 4. 自治体モードへ戻り高槻市を再選択: カテゴリselectは最新値（カフェ）
    //    （旧実装「切り先が空の場合のみ」ではここでレストランに逆戻りする）
    fireEvent.click(screen.getByText('自治体で検索'))
    await selectMunicipality('大阪府', '高槻市')
    const munCat2 = await waitFor(() => {
      const s = getSelectByLabel('カテゴリ（任意）')
      expect(s).toBeTruthy()
      return s
    }, { timeout: 5000 })
    expect(munCat2.value).toBe('cafe')
  }, IT_TIMEOUT)

  it('地図モードURL（src=map&c=cafe）からカテゴリが復元され検索に使える（dispatch順序）', async () => {
    renderApp('?src=map&c=cafe&b=35.0,139.0,35.1,139.1')

    // 地図モードのカテゴリselectにcafeが復元される
    // （SET_SEARCH_SOURCE が SET_SIMPLE_SEARCH より後にdispatchされると、
    //   last-wins引き継ぎがURLのカテゴリを空で上書きする → 順序が重要）
    const catSelect = await waitFor(() => {
      const s = getSelectByLabel('探したいカテゴリ')
      expect(s).toBeTruthy()
      expect(s.value).toBe('cafe')
      return s
    }, { timeout: 5000 })

    // 検索してクエリがcafeになる
    fireEvent.click(screen.getByText('検索する'))
    await waitFor(() => expect(overpassCalls.length).toBe(1), { timeout: 5000 })
    expect(overpassCalls[0]).toContain('amenity=cafe')
  }, IT_TIMEOUT)
})

describe('#54 料理（cuisine）フィルタ E2E', () => {
  it('地図モード: レストラン+ラーメン → クエリに [amenity=restaurant][cuisine=ramen] がAND連結される', async () => {
    // BBOXをURLで設定（地図boundsに依存しない）
    renderApp('b=34.800000,135.400000,34.900000,135.600000')

    // カテゴリを「レストラン」にすると料理selectが出現
    const catSelect = getSelectByLabel('探したいカテゴリ')
    fireEvent.change(catSelect, { target: { value: 'restaurant' } })
    const cuisineSelect = await waitFor(() => {
      const s = getSelectByLabel('料理（任意）')
      expect(s).toBeTruthy()
      return s
    }, { timeout: 3000 })

    // 料理を「ラーメン」に選択
    fireEvent.change(cuisineSelect, { target: { value: 'ramen' } })
    await waitFor(() => expect(cuisineSelect.value).toBe('ramen'))

    // 検索 → クエリに両条件がAND連結される
    fireEvent.click(screen.getByText('検索する'))
    await waitFor(() => expect(overpassCalls.length).toBe(1), { timeout: 5000 })
    expect(overpassCalls[0]).toContain('[amenity=restaurant][cuisine=ramen]')
  }, IT_TIMEOUT)

  it('旧共有URL c=ramen: 「レストラン+ラーメン」に自動マッピングされ検索に使える', async () => {
    renderApp('c=ramen&b=34.800000,135.400000,34.900000,135.600000')

    // カテゴリselectが「レストラン」、料理selectが「ラーメン」に復元される
    const catSelect = await waitFor(() => {
      const s = getSelectByLabel('探したいカテゴリ')
      expect(s.value).toBe('restaurant')
      return s
    }, { timeout: 3000 })
    const cuisineSelect = await waitFor(() => {
      const s = getSelectByLabel('料理（任意）')
      expect(s).toBeTruthy()
      expect(s.value).toBe('ramen')
      return s
    }, { timeout: 3000 })

    // 検索 → 旧ラーメンカテゴリと同等のクエリ
    fireEvent.click(screen.getByText('検索する'))
    await waitFor(() => expect(overpassCalls.length).toBe(1), { timeout: 5000 })
    expect(overpassCalls[0]).toContain('[amenity=restaurant][cuisine=ramen]')
  }, IT_TIMEOUT)

  it('非飲食カテゴリに切り替えると料理selectが消え、cuisineは自動クリアされる', async () => {
    renderApp('b=34.800000,135.400000,34.900000,135.600000')

    // レストラン+ラーメンを設定
    const catSelect = getSelectByLabel('探したいカテゴリ')
    fireEvent.change(catSelect, { target: { value: 'restaurant' } })
    const cuisineSelect = await waitFor(() => {
      const s = getSelectByLabel('料理（任意）')
      expect(s).toBeTruthy()
      return s
    }, { timeout: 3000 })
    fireEvent.change(cuisineSelect, { target: { value: 'ramen' } })
    await waitFor(() => expect(cuisineSelect.value).toBe('ramen'))

    // 薬局に切り替え → 料理selectが非表示に
    fireEvent.change(catSelect, { target: { value: 'pharmacy' } })
    await waitFor(() => {
      expect(screen.queryByText('料理（任意）')).toBeNull()
    }, { timeout: 3000 })

    // 検索 → cuisineはクエリに含まれない（自動クリア+クエリ側ガード）
    fireEvent.click(screen.getByText('検索する'))
    await waitFor(() => expect(overpassCalls.length).toBe(1), { timeout: 5000 })
    expect(overpassCalls[0]).toContain('[amenity=pharmacy]')
    expect(overpassCalls[0]).not.toContain('cuisine')
  }, IT_TIMEOUT)

  it('自治体モード: 飲食店+寿司 → 各unionブランチに[cuisine=sushi]が連結される', async () => {
    renderApp()
    fireEvent.click(screen.getByText('自治体で検索'))
    await selectMunicipality('大阪府', '高槻市')

    const catSelect = await waitFor(() => {
      const s = getSelectByLabel('カテゴリ（任意）')
      expect(s).toBeTruthy()
      return s
    }, { timeout: 3000 })

    // 飲食店（すべて）を選択 → 料理selectが出現
    fireEvent.change(catSelect, { target: { value: 'food_drink' } })
    const cuisineSelect = await waitFor(() => {
      const s = getSelectByLabel('料理（任意）')
      expect(s).toBeTruthy()
      return s
    }, { timeout: 3000 })
    fireEvent.change(cuisineSelect, { target: { value: 'sushi' } })
    await waitFor(() => expect(cuisineSelect.value).toBe('sushi'))

    // 検索 → 8値unionの各ブランチにcuisineがAND連結
    fireEvent.click(screen.getByText('検索する'))
    await waitFor(() => expect(overpassCalls.length).toBe(1), { timeout: 5000 })
    expect(overpassCalls[0]).toContain('[cuisine=sushi]')
    expect(overpassCalls[0]).toContain('amenity~"^(cafe|restaurant|fast_food|bar|pub|izakaya|sushi|food_court)$"')
  }, IT_TIMEOUT)

  it('モード切替: 料理フィルタも引き継がれる（last-wins）', async () => {
    renderApp()

    // 地図モードで レストラン+ラーメン
    const catSelect = getSelectByLabel('探したいカテゴリ')
    fireEvent.change(catSelect, { target: { value: 'restaurant' } })
    const cuisineSelect = await waitFor(() => {
      const s = getSelectByLabel('料理（任意）')
      expect(s).toBeTruthy()
      return s
    }, { timeout: 3000 })
    fireEvent.change(cuisineSelect, { target: { value: 'ramen' } })
    await waitFor(() => expect(cuisineSelect.value).toBe('ramen'))

    // 自治体モードへ切替 → 高槻市選択
    fireEvent.click(screen.getByText('自治体で検索'))
    await selectMunicipality('大阪府', '高槻市')

    // カテゴリ・料理ともに引き継がれている
    const munCat = await waitFor(() => {
      const s = getSelectByLabel('カテゴリ（任意）')
      expect(s).toBeTruthy()
      expect(s.value).toBe('restaurant')
      return s
    }, { timeout: 5000 })
    const munCuisine = await waitFor(() => {
      const s = getSelectByLabel('料理（任意）')
      expect(s).toBeTruthy()
      expect(s.value).toBe('ramen')
      return s
    }, { timeout: 5000 })

    // 検索 → restaurant+ramen のクエリ
    fireEvent.click(screen.getByText('検索する'))
    await waitFor(() => expect(overpassCalls.length).toBe(1), { timeout: 5000 })
    expect(overpassCalls[0]).toContain('[amenity=restaurant][cuisine=ramen]')
  }, IT_TIMEOUT)
})
