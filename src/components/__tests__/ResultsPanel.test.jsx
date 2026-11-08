// @vitest-environment jsdom
/**
 * (#44) ResultsPanel:
 * - 公式サイト（website/official_website）がある行に🔗アイコンを表示
 * - カテゴリドロップダウンの操作が検索フォームにdispatchされ、reducerのミラーで
 *   resultFilters.catFilter が同期される（データ取得後の絞り込み）
 * - 「クリア」で検索フォームのカテゴリ・目的も一緒に解除される
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { AppContext } from '../../context/AppContext'
import { appReducer, createInitialState } from '../../state/appReducer'
import { BatchMatchProvider } from '../../context/BatchMatchContext.jsx'
import ResultsPanel from '../ResultsPanel'
import { downloadFile } from '../../utils/export'

vi.mock('../../utils/export', () => ({ downloadFile: vi.fn() }))

// 実際のOverpass正規化と同様に tags.name → 顶层name にコピーする
const withWebsite = { type: 'node', id: 1, name: 'カフェA', tags: { amenity: 'cafe', website: 'https://cafe.example.jp', name: 'カフェA' } }
const withoutWebsite = { type: 'node', id: 2, name: 'カフェB', tags: { amenity: 'cafe', name: 'カフェB' } }

function Harness({ preActions = [], log = [] }) {
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
      <BatchMatchProvider>
        <ResultsPanel />
      </BatchMatchProvider>
    </AppContext.Provider>
  )
}

const RESULTS = [withWebsite, withoutWebsite]

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => cleanup())

describe('ResultsPanel: 公式サイトアイコン', () => {
  it('websiteタグがある行の名前に🔗アイコン（リンク）が表示される', () => {
    const log = []
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: RESULTS }]} log={log} />)
    const link = screen.getByRole('link', { name: '公式サイトがあります' })
    expect(link.getAttribute('href')).toBe('https://cafe.example.jp')
  })

  it('websiteタグのない行にはアイコンが出ない', () => {
    const log = []
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: [withoutWebsite] }]} log={log} />)
    expect(screen.queryByRole('link', { name: '公式サイトがあります' })).toBeNull()
  })
})

describe('ResultsPanel: カテゴリ選択=検索フォームと同期 (#44)', () => {
  it('ドロップダウンでカテゴリを選ぶと検索フォームにdispatchされcatFilterがミラーされる', () => {
    const log = []
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: RESULTS }]} log={log} />)

    const select = screen.getByRole('combobox', { name: '施設の種類で絞る' })
    fireEvent.change(select, { target: { value: 'cafe' } })

    expect(log.some(a => a.type === 'SET_SIMPLE_SEARCH' && a.payload.category === 'cafe')).toBe(true)
    // reducerのミラーでcatFilterがcafeになり、selectの値も検索フォームに同期される
    expect(screen.getByRole('combobox', { name: '施設の種類で絞る' }).value).toBe('cafe')
  })

  it('結果にparkが混ざっているとき、ドロップダウンでcafeを選ぶとpark行が絞られる', () => {
    const log = []
    const park = { type: 'node', id: 3, name: '中央公園', tags: { leisure: 'park', name: '中央公園' } }
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: [...RESULTS, park] }]} log={log} />)

    expect(screen.getByText('中央公園')).toBeTruthy()
    const select = screen.getByRole('combobox', { name: '施設の種類で絞る' })
    fireEvent.change(select, { target: { value: 'cafe' } })

    // park行が絞り込まれて消え、件数表示も更新される
    expect(screen.queryByText('中央公園')).toBeNull()
    // 絞り込みが有効であることを示すインジケータが表示される
    expect(screen.getByText(/表示は絞り込み済みです/)).toBeTruthy()
  })

  it('「クリア」で検索フォームのカテゴリ・目的も解除される', () => {
    const log = []
    render(<Harness
      preActions={[
        { type: 'SET_RESULTS', payload: RESULTS },
        { type: 'SET_SIMPLE_SEARCH', payload: { category: 'cafe', purpose: '' } }
      ]}
      log={log}
    />)
    const select = screen.getByRole('combobox', { name: '施設の種類で絞る' })
    expect(select.value).toBe('cafe')

    fireEvent.click(screen.getByRole('button', { name: 'クリア' }))

    expect(log.some(a => a.type === 'SET_SIMPLE_SEARCH' && a.payload.category === '' && a.payload.purpose === '')).toBe(true)
    expect(log.some(a => a.type === 'SET_RESULT_FILTERS')).toBe(true)
    expect(screen.getByRole('combobox', { name: '施設の種類で絞る' }).value).toBe('')
  })

  it('目的スコープが設定されていて結果が実際に絞られているときは「絞り込み済み」表示が出る', () => {
    const log = []
    const park = { type: 'node', id: 3, name: 'テスト公園', tags: { leisure: 'park', name: 'テスト公園' } }
    render(<Harness
      preActions={[
        { type: 'SET_RESULTS', payload: [...RESULTS, park] },
        { type: 'SET_SIMPLE_SEARCH', payload: { purpose: '食べる' } }
      ]}
      log={log}
    />)
    expect(screen.getByText(/表示は絞り込み済みです/)).toBeTruthy()
  })

  it('フィルタ条件にすべての結果が一致する場合は「絞り込み済み」表示が出ない', () => {
    render(<Harness
      preActions={[
        { type: 'SET_RESULTS', payload: RESULTS },
        { type: 'SET_SIMPLE_SEARCH', payload: { purpose: '食べる' } }
      ]}
    />)
    // すべてカフェ（食べる）→ 件数は変わらないため、絞込みマーカーは出さない
    expect(screen.queryByText(/表示は絞り込み済みです/)).toBeNull()
  })
})

describe('ResultsPanel: 属性の充足率表示 (B1)', () => {
  const cafePhone = { type: 'node', id: 4, name: 'カフェC', tags: { amenity: 'cafe', phone: '06-0000-0000', opening_hours: 'Mo-Su 10:00-19:00', name: 'カフェC' } }
  const cafeAddr = { type: 'node', id: 5, name: 'カフェD', tags: { amenity: 'cafe', 'addr:street': '西中条2-3-4', name: 'カフェD' } }

  it('表示中結果の属性充足率が「あり X/Y件」で表示される', () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: [withWebsite, withoutWebsite, cafePhone, cafeAddr] }]} />)
    expect(screen.getByText(/電話あり 1\/4件/)).toBeTruthy()
    expect(screen.getByText(/営業時間あり 1\/4件/)).toBeTruthy()
    expect(screen.getByText(/Webサイトあり 1\/4件/)).toBeTruthy()
    expect(screen.getByText(/住所あり 1\/4件/)).toBeTruthy()
  })

  it('カテゴリで絞り込むと絞り込み後の件数で再計算される', () => {
    const park = { type: 'node', id: 6, name: '中央公園', tags: { leisure: 'park', phone: '06-9999-9999', name: '中央公園' } }
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: [withWebsite, withoutWebsite, park] }]} />)

    const select = screen.getByRole('combobox', { name: '施設の種類で絞る' })
    fireEvent.change(select, { target: { value: 'cafe' } })

    // park が絞られ、充足率が残り2件ベースで再計算される
    expect(screen.getByText(/電話あり 0\/2件/)).toBeTruthy()
    expect(screen.getByText(/Webサイトあり 1\/2件/)).toBeTruthy()
  })

  it('結果が0件のときは充足率表示が出ない', () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: [] }] } />)
    expect(screen.queryByText(/電話あり/)).toBeNull()
  })
})

describe('ResultsPanel: 属性の欠落絞り込み (B2)', () => {
  const cafeFull = { type: 'node', id: 10, name: '完全カフェ', tags: { amenity: 'cafe', name: '完全カフェ', phone: '06-1111-1111', opening_hours: 'Mo-Fr 09:00-17:00', website: 'https://full.example', 'addr:street': '梅田1-1' } }
  const cafeNoPhone = { type: 'node', id: 11, name: '電話なしカフェ', tags: { amenity: 'cafe', name: '電話なしカフェ', opening_hours: 'Mo-Fr 09:00-17:00', website: 'https://nophone.example', 'addr:street': '梅田2-2' } }

  it('「属性の欠落で絞る」selectが存在し、特定属性を選ぶと未登録の施設だけが残る', () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: [cafeFull, cafeNoPhone] }] } />)
    const select = screen.getByRole('combobox', { name: '属性の欠落で絞る' })
    expect(select.value).toBe('none')

    fireEvent.change(select, { target: { value: 'phone' } })

    // 電話が登録済みの完全カフェが除外される
    expect(screen.queryByText('完全カフェ')).toBeNull()
    expect(screen.getByText('電話なしカフェ')).toBeTruthy()
    // 未登録属性バッジが表示される
    expect(screen.getByText(/電話 未登録/)).toBeTruthy()
  })

  it('anyを選べば未登録がある施設だけが表示される', () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: [cafeFull, cafeNoPhone] }] } />)
    fireEvent.change(screen.getByRole('combobox', { name: '属性の欠落で絞る' }), { target: { value: 'any' } })
    expect(screen.queryByText('完全カフェ')).toBeNull()
    expect(screen.getByText('電話なしカフェ')).toBeTruthy()
  })

  it('anyで全件が登録済みなら「主要属性が充実」として好機伝える (A4)', () => {
    render(<Harness preActions={[
      { type: 'SET_RESULTS', payload: [cafeFull] },
      { type: 'SET_RESULT_FILTERS', payload: { missingFilter: 'any' } }
    ]} />)
    // (A4) 未登録絞り込みで0件は「失敗」ではなく「充実」の好機
    expect(screen.getByText(/主要属性が充実しています/)).toBeTruthy()
    expect(screen.queryByText(/条件に一致する施設はありません/)).toBeNull()
  })

  it('欠落絞り込み中でも名称検索（nameFilter）が効く', () => {
    // 両方ともWebサイト未登録（1つは名称に「電話」を含む）
    const noWebA = { type: 'node', id: 12, name: '電話なしカフェ', tags: { amenity: 'cafe', name: '電話なしカフェ', phone: '06-3333-3333', opening_hours: 'Mo-Sa 10:00-20:00', 'addr:street': '西天満3-3' } }
    const noWebB = { type: 'node', id: 13, name: 'サイトなしカフェ', tags: { amenity: 'cafe', name: 'サイトなしカフェ', 'addr:city': '大阪市' } }
    render(<Harness preActions={[
      { type: 'SET_RESULTS', payload: [noWebA, noWebB] },
      { type: 'SET_RESULT_FILTERS', payload: { missingFilter: 'website' } }
    ]} />)

    const nameInput = screen.getByPlaceholderText('名称で絞る（例: 珈琲）')
    // 名称で「電話」に絞ると noWebA のみ
    fireEvent.change(nameInput, { target: { value: '電話' } })
    expect(screen.getByText('電話なしカフェ')).toBeTruthy()
    expect(screen.queryByText('サイトなしカフェ')).toBeNull()
  })
})

describe('ResultsPanel: iD編集導線 (B3)', () => {
  it('各行に要素ディープリンク付きのiDリンクが表示される', () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: [withWebsite, withoutWebsite] }] } />)
    const links = screen.getAllByRole('link', { name: /iD/ })
    expect(links).toHaveLength(2)
    expect(links[0].getAttribute('href')).toBe('https://www.openstreetmap.org/edit?node=node%2F1')
    expect(links[1].getAttribute('href')).toBe('https://www.openstreetmap.org/edit?node=node%2F2')
  })

  it('「編集」列ヘッダーが表示される', () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: [withWebsite] }] } />)
    expect(screen.getByText('編集')).toBeTruthy()
  })

  it('欠落絞り込み表示中も各行のiDリンクが残る（B2連携）', () => {
    const cafeNoPhone = { type: 'node', id: 11, name: '電話なしカフェ', tags: { amenity: 'cafe', name: '電話なしカフェ', opening_hours: 'Mo-Fr 09:00-17:00', website: 'https://nophone.example', 'addr:street': '梅田2-2' } }
    render(<Harness preActions={[
      { type: 'SET_RESULTS', payload: [cafeNoPhone] },
      { type: 'SET_RESULT_FILTERS', payload: { missingFilter: 'phone' } }
    ]} />)
    // 欠落バッジ（B2）とiDリンク（B3）が同じ行に並ぶ
    expect(screen.getByText(/電話 未登録/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /iD/ }).getAttribute('href'))
      .toBe('https://www.openstreetmap.org/edit?node=node%2F11')
  })
})

describe('ResultsPanel: カテゴリ別ハイライト (A3)', () => {
  it('飲食店には名称セルにcuisineハイライトを表示する', () => {
    const ramen = { type: 'node', id: 40, name: '梅田ラーメン', tags: { amenity: 'restaurant', name: '梅田ラーメン', cuisine: 'ramen', opening_hours: '11:00-23:00' } }
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: [ramen] }]} />)
    expect(screen.getByText(/🍴 ramen/)).toBeTruthy()
  })

  it('公共施設にはwheelchairハイライトを表示する', () => {
    const lib = { type: 'node', id: 41, name: '中央図書館', tags: { amenity: 'library', name: '中央図書館', opening_hours: 'Mo-Su 09:00-18:00', wheelchair: 'yes' } }
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: [lib] }]} />)
    // 名称セルのハイライト＋バリアフリー列のバッジの両方に出る
    expect(screen.getAllByText(/♿ 車椅子対応/).length).toBeGreaterThanOrEqual(1)
  })

  it('追加属性のないカテゴリ（銀行等）ではハイライト行を出さない', () => {
    const bank = { type: 'node', id: 42, name: 'テスト銀行', tags: { amenity: 'bank', name: 'テスト銀行', phone: '06-4444-4444' } }
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: [bank] }]} />)
    expect(screen.queryByText(/🏦/)).toBeNull()
  })
})

describe('ResultsPanel: 0件時の導線 (A4)', () => {
  it('結果0件なら「この地域ではまだ登録がありません」＋iD追加ヒントを表示する', () => {
    render(<Harness preActions={[
      { type: 'SET_RESULTS', payload: [] },
      { type: 'SET_STATUS', payload: 'success' }
    ]} />)
    expect(screen.getByText(/この地域ではまだ登録がありません/)).toBeTruthy()
    expect(screen.getByText(/iDエディタで追加できます/)).toBeTruthy()
  })

  it('未登録絞り込みで0件なら「主要属性が充実しています」として好機伝える', () => {
    const complete = { type: 'node', id: 1, name: '充実カフェ', tags: { amenity: 'cafe', name: '充実カフェ', phone: '06-1111-1111', opening_hours: 'Mo-Su 08:00-20:00', website: 'https://complete.example', 'addr:street': '梅田1-1' } }
    render(<Harness preActions={[
      { type: 'SET_RESULTS', payload: [complete] },
      { type: 'SET_RESULT_FILTERS', payload: { missingFilter: 'any' } }
    ]} />)
    expect(screen.getByText(/主要属性が充実しています/)).toBeTruthy()
    expect(screen.queryByText(/条件に一致する施設はありません/)).toBeNull()
  })
})

describe('ResultsPanel: カテゴリ選択肢は取得データに基づいて絞り込まれる (#44)', () => {
  const park = { type: 'node', id: 3, name: '中央公園', tags: { leisure: 'park', name: '中央公園' } }

  it('結果に出現したカテゴリのみを件数付きで表示する', () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: [...RESULTS, park] }]} />)
    const select = screen.getByRole('combobox', { name: '施設の種類で絞る' })
    const optTexts = [...select.options].map((o) => o.textContent)
    expect(optTexts).toContain('すべての種類（3件）')
    expect(optTexts).toContain('カフェ（2件）')
    expect(optTexts).toContain('公園・広場（1件）')
    // 結果に出現しないカテゴリ（レストラン等）は選択肢にない
    expect(optTexts.some((t) => t.startsWith('レストラン'))).toBe(false)
    expect(optTexts.some((t) => t.startsWith('薬局'))).toBe(false)
  })

  it('検索前（結果なし）は従来どおり全カテゴリ一覧を表示する', () => {
    render(<Harness />)
    const select = screen.getByRole('combobox', { name: '施設の種類で絞る' })
    const optTexts = [...select.options].map((o) => o.textContent)
    expect(optTexts).toContain('すべての種類')
    expect(optTexts).toContain('薬局・ドラッグストア')
    expect(optTexts.every((t) => !t.includes('件）'))).toBe(true)
  })

  it('選択中カテゴリは出現していなくても選択肢に残る（count 0）', () => {
    render(<Harness
      preActions={[
        { type: 'SET_RESULTS', payload: RESULTS },
        { type: 'SET_SIMPLE_SEARCH', payload: { category: 'hospital', purpose: '' } }
      ]}
    />)
    const select = screen.getByRole('combobox', { name: '施設の種類で絞る' })
    expect(select.value).toBe('hospital')
    const optTexts = [...select.options].map((o) => o.textContent)
    expect(optTexts).toContain('病院・クリニック（0件）')
  })
})

// ─── CSV-osmid 照合機能 ───

describe('ResultsPanel: CSVアップロード', () => {
  // 多列CSV（name列 + phone列 + addr列）
  const MULTI_COL_CSV = 'name,phone,addr\n田中ラーメン,06-1111-1111,大阪市北区梅田1-1\n山本カフェ,06-2222-2222,大阪市西区南堀江2-2\n鈴木薬局,06-3333-3333,大阪市中央区鈴木3-3'
  // 1列CSV
  const SINGLE_COL_CSV = '田中ラーメン\n山本カフェ\n鈴木薬局'

  const OSM_RESULTS = [
    { type: 'node', id: 101, lat: 34.7, lon: 135.5, tags: { name: '田中ラーメン', amenity: 'restaurant' } },
    { type: 'node', id: 202, lat: 34.71, lon: 135.51, tags: { name: '山本カフェ', shop: 'cafe' } },
    { type: 'node', id: 303, lat: 34.72, lon: 135.52, tags: { name: '鈴木薬局', amenity: 'pharmacy' } },
  ]

  function uploadCsv(csvText, fileName = 'test.csv') {
    const file = new File([csvText], fileName, { type: 'text/csv' })
    const input = screen.getByLabelText(/CSVアップロード/)
    fireEvent.change(input, { target: { files: [file] } })
  }

  it('CSVアップロードボタンが表示される', () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] } />)
    expect(screen.getByText(/CSVアップロード/)).toBeTruthy()
  })

  it('アップロード後、ファイル名と件数が表示される', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] } />)
    uploadCsv(MULTI_COL_CSV, 'shops.csv')
    await waitFor(() => {
      expect(screen.getByText(/shops\.csv（3件）/)).toBeTruthy()
    })
  })

  it('多列CSV（2列以上）では照合キーのチェックボックス一覧が表示される', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] } />)
    uploadCsv(MULTI_COL_CSV)
    await waitFor(() => {
      expect(screen.getByText('照合に使う列を選択してください（複数可）')).toBeTruthy()
    })
    // ヘッダーの列名がチェックボックスラベルとして表示される
    expect(screen.getByText('name')).toBeTruthy()
    expect(screen.getByText('phone')).toBeTruthy()
    expect(screen.getByText('addr')).toBeTruthy()
  })

  it('1列CSVではチェックボックス一覧が表示されない', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] } />)
    uploadCsv(SINGLE_COL_CSV)
    await waitFor(() => {
      expect(screen.getByText(/test\.csv/)).toBeTruthy()
    })
    expect(screen.queryByText('照合に使う列を選択してください（複数可）')).toBeNull()
  })
})

describe('ResultsPanel: 「照合する」ボタン', () => {
  const MULTI_COL_CSV = 'name,phone,addr\n田中ラーメン,06-1111-1111,大阪市北区梅田1-1\n山本カフェ,06-2222-2222,大阪市西区南堀江2-2\n鈴木薬局,06-3333-3333,大阪市中央区鈴木3-3'
  const SINGLE_COL_CSV = '田中ラーメン\n山本カフェ\n鈴木薬局'

  const OSM_RESULTS = [
    { type: 'node', id: 101, lat: 34.7, lon: 135.5, tags: { name: '田中ラーメン', amenity: 'restaurant' } },
    { type: 'node', id: 202, lat: 34.71, lon: 135.51, tags: { name: '山本カフェ', shop: 'cafe' } },
    { type: 'node', id: 303, lat: 34.72, lon: 135.52, tags: { name: '鈴木薬局', amenity: 'pharmacy' } },
  ]

  function uploadCsv(csvText, fileName = 'test.csv') {
    const file = new File([csvText], fileName, { type: 'text/csv' })
    const input = screen.getByLabelText(/CSVアップロード/)
    fireEvent.change(input, { target: { files: [file] } })
  }

  it('アップロード後、「照合する」ボタンが表示される', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] } />)
    uploadCsv(MULTI_COL_CSV)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '照合する' })).toBeTruthy()
    })
  })

  it('多列CSVで列未選択時はボタンがdisabled', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] } />)
    uploadCsv(MULTI_COL_CSV)
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: '照合する' })
      expect(btn.disabled).toBe(true)
    })
  })

  it('列を選択するとボタンがenabledになる', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] } />)
    uploadCsv(MULTI_COL_CSV)
    await waitFor(() => {
      expect(screen.getByText('照合に使う列を選択してください（複数可）')).toBeTruthy()
    })
    // name列をチェック
    fireEvent.click(screen.getByLabelText('name'))
    expect(screen.getByRole('button', { name: '照合する' }).disabled).toBe(false)
  })

  it('1列CSVではボタンが最初からenabled（自動選択）', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] } />)
    uploadCsv(SINGLE_COL_CSV)
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: '照合する' })
      expect(btn.disabled).toBe(false)
    })
  })

  it('OSM結果が未取得だとボタンがdisabled', async () => {
    render(<Harness />)
    uploadCsv(MULTI_COL_CSV)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '照合する' })).toBeTruthy()
    })
    // 列を選択しても結果がなければdisabled
    fireEvent.click(screen.getByLabelText('name'))
    expect(screen.getByRole('button', { name: '照合する' }).disabled).toBe(true)
  })
})

describe('ResultsPanel: 照合実行・件数表示', () => {
  const MULTI_COL_CSV = 'name,phone,addr\n田中ラーメン,06-1111-1111,大阪市北区梅田1-1\n山本カフェ,06-2222-2222,大阪市西区南堀江2-2\n存在しない店,06-4444-4444,テスト町4-4'

  const OSM_RESULTS = [
    { type: 'node', id: 101, lat: 34.7, lon: 135.5, tags: { name: '田中ラーメン', amenity: 'restaurant' } },
    { type: 'node', id: 202, lat: 34.71, lon: 135.51, tags: { name: '山本カフェ', shop: 'cafe' } },
  ]

  function uploadCsv(csvText, fileName = 'test.csv') {
    const file = new File([csvText], fileName, { type: 'text/csv' })
    const input = screen.getByLabelText(/CSVアップロード/)
    fireEvent.change(input, { target: { files: [file] } })
  }

  it('照合すると件数（照合/未照合）が表示される', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] } />)
    uploadCsv(MULTI_COL_CSV)
    await waitFor(() => {
      expect(screen.getByText('照合に使う列を選択してください（複数可）')).toBeTruthy()
    })
    fireEvent.click(screen.getByLabelText('name'))
    fireEvent.click(screen.getByRole('button', { name: '照合する' }))

    await waitFor(() => {
      expect(screen.getByText(/照合 2件/)).toBeTruthy()
    })
    expect(screen.getByText(/未照合 1件/)).toBeTruthy()
  })

  it('全件照合できた場合は未照合0件', async () => {
    const allMatchCsv = 'name,phone\n田中ラーメン,06-1111-1111\n山本カフェ,06-2222-2222'
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] } />)
    uploadCsv(allMatchCsv)
    await waitFor(() => {
      expect(screen.getByText('照合に使う列を選択してください（複数可）')).toBeTruthy()
    })
    fireEvent.click(screen.getByLabelText('name'))
    fireEvent.click(screen.getByRole('button', { name: '照合する' }))

    await waitFor(() => {
      expect(screen.getByText(/照合 2件/)).toBeTruthy()
    })
    expect(screen.getByText(/未照合 0件/)).toBeTruthy()
  })
})

describe('ResultsPanel: CSVクリア', () => {
  const MULTI_COL_CSV = 'name,phone,addr\n田中ラーメン,06-1111-1111,大阪市北区梅田1-1\n山本カフェ,06-2222-2222,大阪市西区南堀江2-2'

  const OSM_RESULTS = [
    { type: 'node', id: 101, lat: 34.7, lon: 135.5, tags: { name: '田中ラーメン', amenity: 'restaurant' } },
    { type: 'node', id: 202, lat: 34.71, lon: 135.51, tags: { name: '山本カフェ', shop: 'cafe' } },
  ]

  function uploadCsv(csvText) {
    const file = new File([csvText], 'test.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/CSVアップロード/)
    fireEvent.change(input, { target: { files: [file] } })
  }

  it('✕でCSV状態（ファイル名・チェックボックス・照合結果）がリセットされる', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] } />)
    uploadCsv(MULTI_COL_CSV)
    await waitFor(() => {
      expect(screen.getByText(/test\.csv/)).toBeTruthy()
    })
    // 列を選択して照合実行
    fireEvent.click(screen.getByLabelText('name'))
    fireEvent.click(screen.getByRole('button', { name: '照合する' }))
    await waitFor(() => {
      expect(screen.getByText(/照合 2件/)).toBeTruthy()
    })

    // クリア
    fireEvent.click(screen.getByTitle('CSV入力をクリア'))

    // ファイル名・チェックボックス・結果がすべて消える
    expect(screen.queryByText(/test\.csv/)).toBeNull()
    expect(screen.queryByText('照合に使う列を選択してください（複数可）')).toBeNull()
    expect(screen.queryByText(/照合 2件/)).toBeNull()
    // 「照合する」ボタンも消える（csvMetaがnull）
    expect(screen.queryByRole('button', { name: '照合する' })).toBeNull()
  })
})

describe('ResultsPanel: CSVをダウンロード', () => {
  const MULTI_COL_CSV = 'name,phone,addr\n田中ラーメン,06-1111-1111,大阪市北区梅田1-1\n山本カフェ,06-2222-2222,大阪市西区南堀江2-2\n存在しない店,06-4444-4444,テスト町4-4'

  const OSM_RESULTS = [
    { type: 'node', id: 101, lat: 34.7, lon: 135.5, tags: { name: '田中ラーメン', amenity: 'restaurant' } },
    { type: 'node', id: 202, lat: 34.71, lon: 135.51, tags: { name: '山本カフェ', shop: 'cafe' } },
  ]

  function uploadCsv(csvText, fileName = 'test.csv') {
    const file = new File([csvText], fileName, { type: 'text/csv' })
    const input = screen.getByLabelText(/CSVアップロード/)
    fireEvent.change(input, { target: { files: [file] } })
  }

  // アップロード → name列選択 → 照合実行 → ダウンロードボタン表示待ち
  async function runMatch(csvText, fileName = 'test.csv') {
    uploadCsv(csvText, fileName)
    await waitFor(() => {
      expect(screen.getByText('照合に使う列を選択してください（複数可）')).toBeTruthy()
    })
    fireEvent.click(screen.getByLabelText('name'))
    fireEvent.click(screen.getByRole('button', { name: '照合する' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /CSVをダウンロード/ })).toBeTruthy()
    })
  }

  it('照合を実行するまでは表示されない', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] } />)
    uploadCsv(MULTI_COL_CSV)
    await waitFor(() => {
      expect(screen.getByText('照合に使う列を選択してください（複数可）')).toBeTruthy()
    })
    // 列を選択済みでも、照合実行前はボタンが出ない
    fireEvent.click(screen.getByLabelText('name'))
    expect(screen.queryByRole('button', { name: /CSVをダウンロード/ })).toBeNull()
  })

  it('照合を実行すると表示される', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] } />)
    await runMatch(MULTI_COL_CSV)
    expect(screen.getByRole('button', { name: /CSVをダウンロード/ })).toBeTruthy()
  })

  it('元の列・順序を維持し osmid 列を追加したCSVをダウンロードする', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] } />)
    await runMatch(MULTI_COL_CSV, 'shops.csv')
    fireEvent.click(screen.getByRole('button', { name: /CSVをダウンロード/ }))

    expect(downloadFile).toHaveBeenCalledTimes(1)
    const [csv, filename, mime] = downloadFile.mock.calls[0]
    expect(filename).toBe('shops_osmid.csv')
    expect(mime).toBe('text/csv;charset=utf-8')

    const lines = csv.replace(/^\uFEFF/, '').trimEnd().split('\n')
    // ヘッダー: 元の列順の後に osmid が追加
    expect(lines[0]).toBe('name,phone,addr,osmid')
    // 行は入力順のまま、照合できた行は type/id、未照合は空欄
    expect(lines[1]).toBe('田中ラーメン,06-1111-1111,大阪市北区梅田1-1,node/101')
    expect(lines[2]).toBe('山本カフェ,06-2222-2222,大阪市西区南堀江2-2,node/202')
    expect(lines[3]).toBe('存在しない店,06-4444-4444,テスト町4-4,')
  })

  it('BOM付きで出力される（Excel対応）', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] } />)
    await runMatch(MULTI_COL_CSV)
    fireEvent.click(screen.getByRole('button', { name: /CSVをダウンロード/ }))

    const [csv] = downloadFile.mock.calls[0]
    expect(csv.charCodeAt(0)).toBe(0xFEFF)
  })

  it('カンマを含む値はクォートで囲まれる', async () => {
    // 2列以上でないとヘッダー行が認識されない（parseCsvToObjectsの判定）ためphone列を付与
    const csv = 'name,phone\n"田中,ラーメン",06-1111-1111'
    const results = [{ type: 'node', id: 901, lat: 34.7, lon: 135.5, tags: { name: '田中,ラーメン', amenity: 'restaurant' } }]
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: results }] } />)
    await runMatch(csv)
    fireEvent.click(screen.getByRole('button', { name: /CSVをダウンロード/ }))

    const [out] = downloadFile.mock.calls[0]
    const lines = out.replace(/^\uFEFF/, '').trimEnd().split('\n')
    expect(lines).toEqual(['name,phone,osmid', '"田中,ラーメン",06-1111-1111,node/901'])
  })

  it('数式注入（= で始まる値）は \' を前置きする', async () => {
    const csv = 'name,phone\n=SUM(A1),06-1111-1111'
    const results = [{ type: 'node', id: 902, lat: 34.7, lon: 135.5, tags: { name: '=SUM(A1)' } }]
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: results }] } />)
    await runMatch(csv)
    fireEvent.click(screen.getByRole('button', { name: /CSVをダウンロード/ }))

    const [out] = downloadFile.mock.calls[0]
    const lines = out.replace(/^\uFEFF/, '').trimEnd().split('\n')
    // 値自体にカンマ・クォートがない場合は export.js の csvEscape と同じく
    // クォートで囲わず、数式注入対策の ' を前置きするだけ
    expect(lines).toEqual(['name,phone,osmid', "'=SUM(A1),06-1111-1111,node/902"])
  })

  it('1列CSV（ヘッダーなし）でも末尾に osmid 列が追加される', async () => {
    const csv = '田中ラーメン\n存在しない店'
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] } />)
    // 1列CSVではキー列が自動選択されるので、照合ボタンのみクリック
    uploadCsv(csv)
    await waitFor(() => {
      expect(screen.getByText(/test\.csv/)).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: '照合する' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /CSVをダウンロード/ })).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: /CSVをダウンロード/ }))

    const [out] = downloadFile.mock.calls[0]
    const lines = out.replace(/^\uFEFF/, '').trimEnd().split('\n')
    expect(lines[0]).toBe('col_1,osmid')
    expect(lines[1]).toBe('田中ラーメン,node/101')
    expect(lines[2]).toBe('存在しない店,')
  })

  it('.txt 拡張子のファイルも _osmid.csv として出力される', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] } />)
    await runMatch(MULTI_COL_CSV, 'list.txt')
    fireEvent.click(screen.getByRole('button', { name: /CSVをダウンロード/ }))

    expect(downloadFile.mock.calls[0][1]).toBe('list_osmid.csv')
  })

  it('CSVクリアするとダウンロードボタンも消える', async () => {
    render(<Harness preActions={[{ type: 'SET_RESULTS', payload: OSM_RESULTS }] } />)
    await runMatch(MULTI_COL_CSV)
    expect(screen.getByRole('button', { name: /CSVをダウンロード/ })).toBeTruthy()

    fireEvent.click(screen.getByTitle('CSV入力をクリア'))
    expect(screen.queryByRole('button', { name: /CSVをダウンロード/ })).toBeNull()
  })
})
