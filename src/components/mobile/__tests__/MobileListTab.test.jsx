// @vitest-environment jsdom
/**
 * (#44) MobileListTab:
 * - カテゴリドロップダウンの操作が検索フォームにdispatchされる（地図/自治体モード両方）
 * - 「フィルタをリセット」で検索フォームのカテゴリ・目的も一緒に解除される
 * - 公式サイトがあればカードに🌐アイコン行が表示される
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { AppContext } from '../../../context/AppContext'
import { appReducer, createInitialState } from '../../../state/appReducer'
import MobileListTab from '../MobileListTab'

// 実際のOverpass正規化と同様に tags.name → 顶层name にコピーする
// MapLibre GLはWebGLが必要でjsdomでは初期化できないためモジュール全体をモックする。
// (修正) 一覧タブに MobileResultsMap を埋め込んだため必須。
const mockState = vi.hoisted(() => ({ api: null }))
vi.mock('maplibre-gl', async () => {
  const mod = await import('../../../test/maplibreMock')
  mockState.api = mod.createMapLibreMock()
  return { default: mockState.api }
})

const cafeWithWeb = { type: 'node', id: 1, name: 'カフェA', tags: { amenity: 'cafe', website: 'https://cafe.example.jp', name: 'カフェA' } }
const park = { type: 'node', id: 2, name: '中央公園', tags: { leisure: 'park', name: '中央公園' } }

function Harness({ preActions = [], log = [], children }) {
  const [state, rawDispatch] = React.useReducer(
    appReducer,
    preActions,
    (acts) => acts.reduce((s, a) => appReducer(s, a), createInitialState())
  )
  const dispatch = (a) => {
    log.push(a)
    rawDispatch(a)
  }
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children || <MobileListTab onOpenDetail={vi.fn()} />}
    </AppContext.Provider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  if (mockState.api) mockState.api.resetState()
})
afterEach(() => cleanup())

describe('MobileListTab: カテゴリ選択=検索フォームと同期 (#44)', () => {
  it('地図モード: ドロップダウンでカテゴリを選ぶとSET_SIMPLE_SEARCHにdispatchされparkが絞られる', () => {
    const log = []
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: [cafeWithWeb, park] }, { type: 'SET_STATUS', payload: 'success' }]} log={log} />)

    expect(screen.getByText('中央公園')).toBeTruthy()
    const select = screen.getByRole('combobox', { name: 'カテゴリで絞り込む' })
    fireEvent.change(select, { target: { value: 'cafe' } })

    expect(log.some(a => a.type === 'SET_SIMPLE_SEARCH' && a.payload.category === 'cafe')).toBe(true)
    expect(screen.queryByText('中央公園')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'カテゴリで絞り込む' }).value).toBe('cafe')
  })

  it('自治体モード: ドロップダウンの操作はSET_MUNICIPALITY_SEARCHにdispatchされる', () => {
    const log = []
    render(<Harness
      preActions={[
        { type: 'SET_SEARCH_SOURCE', payload: 'municipality' },
        { type: 'SET_RESULTS', payload: [cafeWithWeb, park] },
        { type: 'SET_STATUS', payload: 'success' }
      ]}
      log={log}
    />)
    const select = screen.getByRole('combobox', { name: 'カテゴリで絞り込む' })
    fireEvent.change(select, { target: { value: 'park' } })

    expect(log.some(a => a.type === 'SET_MUNICIPALITY_SEARCH' && a.payload.category === 'park')).toBe(true)
    expect(log.some(a => a.type === 'SET_SIMPLE_SEARCH')).toBe(false)
    expect(screen.getByRole('combobox', { name: 'カテゴリで絞り込む' }).value).toBe('park')
  })

  it('「フィルタをリセット」で検索フォームのカテゴリ・目的も解除される', async () => {
    const log = []
    render(<Harness
      preActions={[
        { type: 'SET_RESULTS', payload: [cafeWithWeb, park] },
        { type: 'SET_STATUS', payload: 'success' },
        { type: 'SET_SIMPLE_SEARCH', payload: { category: 'cafe' } },
        { type: 'SET_RESULT_FILTERS', payload: { nameFilter: '存在しない名' } }
      ]}
      log={log}
    />)

    // 条件に一致する施設なし → リセットボタン表示
    expect(screen.getByText(/現在の絞り込み条件に一致する施設はありません/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'フィルタをリセット' }))

    expect(log.some(a => a.type === 'SET_SIMPLE_SEARCH' && a.payload.category === '' && a.payload.purpose === '')).toBe(true)
    expect(log.some(a => a.type === 'SET_RESULT_FILTERS' && a.payload.nameFilter === '' && a.payload.catFilter === '' && a.payload.purposeFilter === '')).toBe(true)

    // 両方（cafe+park）が再び表示される
    await waitFor(() => {
      expect(screen.getByText('カフェA')).toBeTruthy()
      expect(screen.getByText('中央公園')).toBeTruthy()
    })
  })
})

describe('MobileListTab: 公式サイトアイコン', () => {
  it('websiteタグがある施設カードに🌐アイコン行が表示される', () => {
    const log = []
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: [cafeWithWeb, park] }, { type: 'SET_STATUS', payload: 'success' }]} log={log} />)
    expect(screen.getByText(/公式サイト/)).toBeTruthy()
    // parkカードには出ない
    expect(screen.getAllByText(/公式サイト/)).toHaveLength(1)
  })
})

describe('MobileListTab: 属性の充足率表示 (B1)', () => {
  it('表示中結果の属性充足率が一覧上部に「あり X/Y件」で表示される', () => {
    const cafePhone = { type: 'node', id: 3, name: 'カフェB', tags: { amenity: 'cafe', phone: '06-1111-0000', 'addr:street': '天神3-4-5', name: 'カフェB' } }
    render(<Harness preActions={[
      { type: 'SET_RESULTS', payload: [cafeWithWeb, cafePhone, park] },
      { type: 'SET_STATUS', payload: 'success' }
    ]} />)
    expect(screen.getByText(/電話あり 1\/3件/)).toBeTruthy()
    expect(screen.getByText(/営業時間あり 0\/3件/)).toBeTruthy()
    expect(screen.getByText(/Webサイトあり 1\/3件/)).toBeTruthy()
    expect(screen.getByText(/住所あり 1\/3件/)).toBeTruthy()
  })

  it('カテゴリ絞り込み後に充足率が再計算される', () => {
    const cafePhone = { type: 'node', id: 3, name: 'カフェB', tags: { amenity: 'cafe', phone: '06-1111-0000', name: 'カフェB' } }
    render(<Harness preActions={[
      { type: 'SET_RESULTS', payload: [cafeWithWeb, cafePhone, park] },
      { type: 'SET_STATUS', payload: 'success' }
    ]} />)

    const select = screen.getByRole('combobox', { name: 'カテゴリで絞り込む' })
    fireEvent.change(select, { target: { value: 'cafe' } })

    // park が絞られて 2 件ベースに再計算される
    expect(screen.getByText(/電話あり 1\/2件/)).toBeTruthy()
    expect(screen.getByText(/Webサイトあり 1\/2件/)).toBeTruthy()
  })

  it('結果なし（0件）ときは充足率表示が出ない', () => {
    render(<Harness preActions={[
      { type: 'SET_RESULTS', payload: [] },
      { type: 'SET_STATUS', payload: 'success' }
    ]} />)
    expect(screen.queryByText(/電話あり/)).toBeNull()
  })
})

describe('MobileListTab: 0件時の導線 (A4)', () => {
  it('未登録絞り込みで0件なら「主要属性が充実しています」として好機伝える', () => {
    const complete = { type: 'node', id: 1, name: '充実カフェ', tags: { amenity: 'cafe', name: '充実カフェ', phone: '06-1111-1111', opening_hours: 'Mo-Su 08:00-20:00', website: 'https://complete.example', 'addr:street': '梅田1-1' } }
    render(<Harness preActions={[
      { type: 'SET_RESULTS', payload: [complete] },
      { type: 'SET_STATUS', payload: 'success' },
      { type: 'SET_RESULT_FILTERS', payload: { missingFilter: 'any' } }
    ]} />)
    expect(screen.getByText(/主要属性が充実しています/)).toBeTruthy()
    expect(screen.queryByText(/現在の絞り込み条件に一致する施設はありません/)).toBeNull()
  })
})

describe('MobileListTab: 属性の欠落絞り込み (B2)', () => {
  const cafeFull = { type: 'node', id: 20, name: '完全カフェ', tags: { amenity: 'cafe', name: '完全カフェ', phone: '06-1111-1111', opening_hours: 'Mo-Fr 09:00-17:00', website: 'https://full.example', 'addr:street': '梅田1-1' } }
  const cafeNoPhone = { type: 'node', id: 21, name: '電話なしカフェ', tags: { amenity: 'cafe', name: '電話なしカフェ', opening_hours: 'Mo-Fr 09:00-17:00', website: 'https://nophone.example', 'addr:street': '梅田2-2' } }

  it('特定属性を選ぶと未登録のカードだけが残り、欠落バッジが出る', () => {
    render(<Harness preActions={[
      { type: 'SET_RESULTS', payload: [cafeFull, cafeNoPhone] },
      { type: 'SET_STATUS', payload: 'success' }
    ]} />)
    fireEvent.change(screen.getByRole('combobox', { name: '属性の欠落で絞る' }), { target: { value: 'phone' } })

    expect(screen.queryByText('完全カフェ')).toBeNull()
    expect(screen.getByText('電話なしカフェ')).toBeTruthy()
    expect(screen.getByText(/⚠️ 電話 未登録/)).toBeTruthy()
  })

  it('リセットでmissingFilterも解除され全件に戻る', async () => {
    const log = []
    render(<Harness
      preActions={[
        { type: 'SET_RESULTS', payload: [cafeFull, cafeNoPhone] },
        { type: 'SET_STATUS', payload: 'success' },
        { type: 'SET_RESULT_FILTERS', payload: { missingFilter: 'phone', nameFilter: '存在しない名' } }
      ]}
      log={log}
    />)

    expect(screen.queryByText('完全カフェ')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'フィルタをリセット' }))

    expect(log.some(a => a.type === 'SET_RESULT_FILTERS' && a.payload.missingFilter === 'none' && a.payload.nameFilter === '')).toBe(true)
    await waitFor(() => {
      expect(screen.getByText('完全カフェ')).toBeTruthy()
      expect(screen.getByText('電話なしカフェ')).toBeTruthy()
    })
  })
})

describe('MobileListTab: カテゴリ選択肢は取得データに基づいて絞り込まれる (#44)', () => {
  it('結果に出現したカテゴリのみを件数付きで表示する', () => {
    render(<Harness preActions={[
      { type: 'SET_RESULTS', payload: [cafeWithWeb, park] },
      { type: 'SET_STATUS', payload: 'success' }
    ]} />)
    const select = screen.getByRole('combobox', { name: 'カテゴリで絞り込む' })
    const optTexts = [...select.options].map((o) => o.textContent)
    expect(optTexts).toContain('カテゴリ: すべて（2件）')
    expect(optTexts).toContain('カフェ（1件）')
    expect(optTexts).toContain('公園・広場（1件）')
    expect(optTexts.some((t) => t.startsWith('レストラン'))).toBe(false)
  })

  it('結果なしときはカテゴリセレクト自体が表示されない（フィルタバー非表示）', () => {
    render(<Harness />)
    expect(screen.queryByRole('combobox', { name: 'カテゴリで絞り込む' })).toBeNull()
  })
})

// ===== (#62) バリアフリー検索結果 =====
const bfFootway = {
  type: 'way',
  id: 100,
  name: '中央通り歩道',
  lat: 34.003333,
  lon: 135.01,
  tags: { highway: 'footway', tactile_paving: 'yes', name: '中央通り歩道' },
  osmId: 'way/100',
  bf: { kind: 'way', tactile: 'yes', lengthM: 152, kerb: null, hasSound: false, hasVibration: false, geometry: [[135.0, 34.0], [135.01, 34.01], [135.02, 34.0]] }
}
const bfKerb = {
  type: 'node',
  id: 200,
  name: null,
  lat: 34.1,
  lon: 135.1,
  tags: { barrier: 'kerb' },
  osmId: 'node/200',
  bf: { kind: 'node', tactile: null, lengthM: null, kerb: null, hasSound: false, hasVibration: false, geometry: [135.1, 34.1] }
}
const bfUnnamedFootway = {
  type: 'way',
  id: 101,
  name: null,
  lat: 34.003,
  lon: 135.01,
  tags: { highway: 'footway', tactile_paving: 'yes' },
  osmId: 'way/101',
  bf: { kind: 'way', tactile: 'yes', lengthM: 80, kerb: null, hasSound: false, hasVibration: false, geometry: [[135.0, 34.0], [135.01, 34.0]] }
}

const BF_MOBILE_RESULTS = [bfFootway, bfKerb]

function bfMobileActions(results = BF_MOBILE_RESULTS) {
  return [
    { type: 'SET_RESULTS', payload: results },
    { type: 'SET_RESULT_KIND', payload: 'barrier_free' },
    { type: 'SET_STATUS', payload: 'success' }
  ]
}

describe('MobileListTab: バリアフリー検索結果 (#62)', () => {
  it('専用カード（タイプ・点字ブロック・長さ・OSM ID・iDリンク）を表示する', () => {
    render(<Harness preActions={bfMobileActions()} />)

    expect(screen.getByText('2件中、2件を表示')).toBeTruthy()
    expect(screen.getByText('歩道')).toBeTruthy()
    expect(screen.getByText('中央通り歩道')).toBeTruthy()
    expect(screen.getByText('点字ブロック 有')).toBeTruthy()
    expect(screen.getByText('152 m')).toBeTruthy()
    // 名称が無い縁石は表示名「縁石（未記録）」をタイトルに表示する（#62 仕様4）
    expect(screen.getByText('縁石（未記録）')).toBeTruthy()
    expect(screen.getByText('way/100')).toBeTruthy()
    const links = screen.getAllByRole('link', { name: /iDで編集/ })
    const hrefs = links.map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('https://www.openstreetmap.org/edit?node=way%2F100')
    expect(hrefs).toContain('https://www.openstreetmap.org/edit?node=node%2F200')
  })

  it('施設向けのコントロール（カテゴリ選択・Webサイトチェック）は表示しない', () => {
    render(<Harness preActions={bfMobileActions()} />)
    expect(screen.queryByRole('combobox', { name: 'カテゴリで絞り込む' })).toBeNull()
    expect(screen.queryByText('Webサイトがあるものだけ')).toBeNull()
    expect(screen.queryByRole('combobox', { name: '属性の欠落で絞る' })).toBeNull()
  })

  it('タイプフィルタで node のみを選択すると way 卡片が消える', () => {
    render(<Harness preActions={bfMobileActions()} />)
    expect(screen.getByText('中央通り歩道')).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: '要素種別で絞り込む' }), { target: { value: 'node' } })

    expect(screen.queryByText('中央通り歩道')).toBeNull()
    expect(screen.getByText('縁石（未記録）')).toBeTruthy()
  })

  it('名称が無名の歩道は表示名「歩道（点字ブロックあり）」をタイトルに表示し、重複バッジを省略する', () => {
    render(<Harness preActions={bfMobileActions([bfUnnamedFootway])} />)

    // タイトル: タグから生成した表示名
    expect(screen.getByText('歩道（点字ブロックあり）')).toBeTruthy()
    // タイプバッジ・点字ブロックバッジは表示名に含むので省略
    expect(screen.queryByText('歩道')).toBeNull()
    expect(screen.queryByText('点字ブロック 有')).toBeNull()
    // 長さバッジは表示名に含まれないのでそのまま表示
    expect(screen.getByText('80 m')).toBeTruthy()
  })

  it('リセットで表示フィルタが解除される（フォームのカテゴリは残る）', () => {
    const log = []
    render(<Harness preActions={bfMobileActions()} log={log} />)
    fireEvent.change(screen.getByRole('combobox', { name: '要素種別で絞り込む' }), { target: { value: 'node' } })
    fireEvent.click(screen.getByRole('button', { name: 'リセット' }))
    expect(screen.getByText('中央通り歩道')).toBeTruthy()
    // SET_SIMPLE_SEARCH / SET_MUNICIPALITY_SEARCH へのdispatchは無い（検索条件は不変）
    expect(log.some((a) => a.type === 'SET_SIMPLE_SEARCH')).toBe(false)
    expect(log.some((a) => a.type === 'SET_MUNICIPALITY_SEARCH')).toBe(false)
    expect(log.some((a) => a.type === 'SET_RESULT_FILTERS' && a.payload.typeFilter === 'all')).toBe(true)
  })

  it('0件時はバリアフリー向けのメッセージを表示する', () => {
    render(<Harness preActions={bfMobileActions([])} />)
    expect(screen.getByText(/バリアフリー関連の登録がありません/)).toBeTruthy()
  })
})

// ===== (修正) モバイル結果マップ =====
// 検索成功後に自動で一覧タブへ切り替わるため、一覧タブでも結果の位置を
// マップで確認できることを検証する。
const poiWithCoords = [
  { type: 'node', id: 30, name: 'カフェA', lat: 34.7, lon: 135.5, tags: { amenity: 'cafe', name: 'カフェA' } },
  { type: 'node', id: 31, name: '中央公園', lat: 34.71, lon: 135.51, tags: { leisure: 'park', name: '中央公園' } }
]

describe('MobileListTab: 結果マップ（折りたたみ式・修正）', () => {
  it('POI検索結果: 初期は折りたたみ（地図非表示）で、「地図を表示」を押すと結果範囲にフィットして表示される', async () => {
    render(<Harness preActions={[
      { type: 'SET_RESULTS', payload: poiWithCoords },
      { type: 'SET_STATUS', payload: 'success' }
    ]} />)

    // 初期状態は折りたたみ: 地図は描画されず、「地図を表示」ボタンが出る
    expect(screen.queryByRole('application', { name: '検索結果マップ' })).toBeNull()
    expect(mockState.api._state.maps).toHaveLength(0)
    const toggle = screen.getByRole('button', { name: /地図を表示/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    // 展開: 地図が表示され、結果座標が設定され、結果範囲にfitBoundsされる
    fireEvent.click(toggle)
    await waitFor(async () => {
      const map = mockState.api._state.maps.at(-1)
      expect(map._lastGeoJSON?.data?.features?.length).toBe(2)
    })
    const map = mockState.api._state.maps.at(-1)
    expect(map._lastGeoJSON.data.features[0].geometry.coordinates).toEqual([135.5, 34.7])
    // カメラは結果の範囲（extent）にfitBoundsされる
    const fit = map._calls.find((c) => c.name === 'fitBounds')
    expect(fit.args[0]).toEqual([[135.5, 34.7], [135.51, 34.71]])
  })

  it('「地図を隠す」で折りたたみに戻ると地図が非表示になり、マップが破棄される', async () => {
    render(<Harness preActions={[
      { type: 'SET_RESULTS', payload: poiWithCoords },
      { type: 'SET_STATUS', payload: 'success' }
    ]} />)

    fireEvent.click(screen.getByRole('button', { name: /地図を表示/ }))
    await waitFor(() => expect(mockState.api._state.maps).toHaveLength(1))
    const map = mockState.api._state.maps[0]

    fireEvent.click(screen.getByRole('button', { name: /地図を隠す/ }))
    expect(screen.queryByRole('application', { name: '検索結果マップ' })).toBeNull()
    expect(map._removed).toBe(true)
    expect(screen.getByRole('button', { name: /地図を表示/ }).getAttribute('aria-expanded')).toBe('false')
  })

  it('結果がない場合は結果マップ（・折りたたみボタン）が表示されない', () => {
    render(<Harness />)
    expect(screen.queryByRole('application', { name: '検索結果マップ' })).toBeNull()
    expect(screen.queryByRole('button', { name: /地図を表示/ })).toBeNull()
    expect(mockState.api._state.maps).toHaveLength(0)
  })

  it('バリアフリー検索結果: 折りたたまず常時表示。結果マップと凡例が表示され、線・点が設定される', async () => {
    render(<Harness preActions={bfMobileActions()} />)

    expect(screen.getByRole('application', { name: 'バリアフリー要素マップ' })).toBeTruthy()
    // バリアフリー結果の地図は折りたたみ対象外（「地図を表示」ボタンは出ない）
    expect(screen.queryByRole('button', { name: /地図を表示/ })).toBeNull()
    expect(screen.getByText('凡例')).toBeTruthy()
    await waitFor(async () => {
      const map = mockState.api._state.maps.at(-1)
      const features = map._lastGeoJSON?.data?.features || []
      expect(features.length).toBe(2)
      expect(features.map((f) => f.geometry.type).sort()).toEqual(['LineString', 'Point'])
    })
    const map = mockState.api._state.maps.at(-1)
    // 線（135.0〜135.02, 34.0〜34.01）と点（135.1, 34.1）を含む範囲
    const fit = map._calls.find((c) => c.name === 'fitBounds')
    expect(fit.args[0]).toEqual([[135.0, 34.0], [135.1, 34.1]])
  })
})
