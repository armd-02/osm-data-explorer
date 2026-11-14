// @vitest-environment jsdom
/**
 * 市区町村「テキスト入力＋サジェスト」のテスト
 *
 * 都道府県選択（折りたたみブロック含む）は現行のセレクト方式のまま残し、
 * 市区町村の <select> をテキスト入力＋サジェストに置き換えた新実装の検証:
 *
 * 1. 入力欄に文字を入れると、選択中の都道府県内の名前の部分一致自治体が候補表示される
 * 2. 入力欄が空の状態でフォーカスすると、その都道府県の全自治体が候補表示される
 *    （リストはスクロール可能: max-h + overflow-auto）
 * 3. 候補クリックで選ぶと、旧 select の onChange と同一の親state更新
 *    （selectedMunicipality同期: code/name/bbox、BBOX共有）が行われ、
 *     入力欄に自治体名が表示される
 * 4. キーボード操作: ↑↓で候補移動、Enter で確定、Escape で候補を閉じる
 * 5. 都道府県変更時に入力欄と自治体選択がリセットされる
 * 6. 親stateのselectedMunicipalityが外部からセットされた場合（URL復元など）、
 *    入力欄に自治体名が同期表示される
 * 7. PC・モバイル両variantに同じ挙動が適用される
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import MunicipalitySearch from '../MunicipalitySearch'
import { AppContext } from '../../context/AppContext'

// jsdomにないAPIのスタブ
class MockResizeObserver { observe() {} unobserve() {} disconnect() {} }

/**
 * municipalities.json フィクスチャ（municipalityFlow.test.jsxと同形式＋奈良県）
 */
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

const TAKATSUKI = MUNI_DATA.municipalities.find(m => m.code === '272078')

let dispatchMock

function renderSearch(variant = 'pc', initialState = {}) {
  dispatchMock = vi.fn()
  const value = {
    state: {
      municipalitySearch: null,
      selectedMunicipality: null,
      ...initialState
    },
    dispatch: dispatchMock
  }
  return render(
    <AppContext.Provider value={value}>
      <MunicipalitySearch variant={variant} />
    </AppContext.Provider>
  )
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

// データ読み込み完了（タイルグリッド表示）を待つ
async function waitLoaded() {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: '大阪府' })).toBeTruthy()
  }, { timeout: 3000 })
}

// 都道府県を（タイルで）選択する
async function pickPrefecture(prefText) {
  await waitLoaded()
  fireEvent.click(screen.getByRole('button', { name: prefText }))
}

// 市区町村入力欄を取得
function getMunInput(container, variant = 'pc') {
  return container.querySelector(`#mun-input-${variant}`)
}

// サジェスト候補（role=option）のテキストリスト
function getCandidateTexts() {
  return screen.getAllByRole('option')
    .filter(o => o.closest('[role="listbox"]'))
    .map(o => o.textContent)
}

describe('市区町村 テキスト入力＋サジェスト（PC variant）', () => {
  it('1: 入力欄に文字を入れると、選択県内の部分一致自治体が候補表示される', async () => {
    const { container } = renderSearch()
    await pickPrefecture('大阪府')
    const input = getMunInput(container)
    expect(input).toBeTruthy()

    // 「槻」で入力 → 高槻市のみ
    fireEvent.change(input, { target: { value: '槻' } })
    await waitFor(() => {
      expect(getCandidateTexts()).toEqual(['高槻市（区）'])
    }, { timeout: 3000 })

    // 「田」で入力 → 吹田市のみ（豊中市は「とよなか」で「田」を含まない）
    fireEvent.change(input, { target: { value: '田' } })
    await waitFor(() => {
      expect(getCandidateTexts()).toEqual(['吹田市（区）'])
    }, { timeout: 3000 })

    // 「市」で入力 → 4自治体すべて（名前の末尾に「市」を含む）
    fireEvent.change(input, { target: { value: '市' } })
    await waitFor(() => {
      const texts = getCandidateTexts()
      expect(texts).toHaveLength(4)
      expect(texts.some(t => t.startsWith('大阪市'))).toBe(true)
      expect(texts.some(t => t.startsWith('高槻市'))).toBe(true)
      expect(texts.some(t => t.startsWith('吹田市'))).toBe(true)
      expect(texts.some(t => t.startsWith('豊中市'))).toBe(true)
    }, { timeout: 3000 })

    // 奈良県の自治体は候補にならない（選択県に属さない）
    expect(getCandidateTexts().some(t => t.startsWith('奈良市'))).toBe(false)
  })

  it('2: 入力欄が空の状態でフォーカスすると、その都道府県の全自治体が候補表示される（スクロール可能）', async () => {
    const { container } = renderSearch()
    await pickPrefecture('大阪府')
    const input = getMunInput(container)
    expect(input.value).toBe('')

    // 空入力でフォーカス → 大阪府の全4自治体が候補になる
    fireEvent.focus(input)
    await waitFor(() => {
      expect(getCandidateTexts()).toHaveLength(4)
    }, { timeout: 3000 })
    const list = screen.getByRole('listbox', { name: '市区町村候補' })
    expect(list).toBeTruthy()
    // リストはスクロール可能（max-h + overflow-auto）
    expect(list.className).toContain('max-h-')
    expect(list.className).toContain('overflow-auto')
    // 区は（区）接尾辞付きで表示
    expect(getCandidateTexts().some(t => t === '高槻市（区）')).toBe(true)
    expect(getCandidateTexts().some(t => t === '大阪市')).toBe(true)
  })

  it('3: 候補クリックで選ぶと、旧 select の onChange と同一の親state更新が行われ入力欄に自治体名が表示される', async () => {
    const { container } = renderSearch()
    await pickPrefecture('大阪府')
    const input = getMunInput(container)

    fireEvent.change(input, { target: { value: '高槻' } })
    const opt = await screen.findByRole('option', { name: '高槻市（区）' })
    fireEvent.click(opt)

    // 入力欄に自治体名が表示される
    await waitFor(() => expect(input.value).toBe('高槻市'), { timeout: 3000 })
    // サジェストリストは閉じる
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).toBeNull()
    }, { timeout: 3000 })

    // 親stateへの更新: code/name/bbox（旧 select の onChange と同一内容）
    expect(dispatchMock).toHaveBeenCalledWith({
      type: 'SET_MUNICIPALITY',
      payload: { code: '272078', name: '高槻市', bbox: TAKATSUKI.bbox }
    })
  })

  it('4a: ↑↓で候補を移動できる（aria-activedescendant が追従）', async () => {
    const { container } = renderSearch()
    await pickPrefecture('大阪府')
    const input = getMunInput(container)

    // 「槻」で候補を1つに絞る
    fireEvent.change(input, { target: { value: '槻' } })
    await screen.findByRole('option', { name: '高槻市（区）' })

    // ArrowDown: 候補リストをアクティブ化し先頭に移動
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    await waitFor(() => {
      expect(input.getAttribute('aria-activedescendant')).toBe('mun-suggest-pc-opt-0')
    }, { timeout: 3000 })
    expect(screen.getByRole('option', { name: '高槻市（区）' }).getAttribute('aria-selected')).toBe('true')

    // 全リストで ArrowUp: ラップして末尾候補へ
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    await waitFor(() => {
      // 大阪府は全4候補 → 末尾は opt-3
      expect(input.getAttribute('aria-activedescendant')).toBe('mun-suggest-pc-opt-3')
    }, { timeout: 3000 })
  })

  it('4b: Enter でアクティブ候補が確定される', async () => {
    const { container } = renderSearch()
    await pickPrefecture('大阪府')
    const input = getMunInput(container)

    fireEvent.change(input, { target: { value: '槻' } })
    await screen.findByRole('option', { name: '高槻市（区）' })

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(input.value).toBe('高槻市'), { timeout: 3000 })
    expect(dispatchMock).toHaveBeenCalledWith({
      type: 'SET_MUNICIPALITY',
      payload: { code: '272078', name: '高槻市', bbox: TAKATSUKI.bbox }
    })
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).toBeNull()
    }, { timeout: 3000 })
  })

  it('4c: Escape で候補リストが閉じる（入力テキストは保持）', async () => {
    const { container } = renderSearch()
    await pickPrefecture('大阪府')
    const input = getMunInput(container)

    fireEvent.focus(input)
    await waitFor(() => {
      expect(getCandidateTexts()).toHaveLength(4)
    }, { timeout: 3000 })

    fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).toBeNull()
    }, { timeout: 3000 })
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })

  it('4d: 該当する自治体がない場合は「該当なし」が表示される', async () => {
    const { container } = renderSearch()
    await pickPrefecture('大阪府')
    const input = getMunInput(container)

    fireEvent.change(input, { target: { value: 'zzz' } })
    await waitFor(() => {
      expect(screen.getByText('該当する市区町村がありません')).toBeTruthy()
    }, { timeout: 3000 })
    expect(getCandidateTexts()).toHaveLength(0)
  })

  it('5: 都道府県を変更したら、入力欄と自治体選択がリセットされる', async () => {
    const { container } = renderSearch()
    await pickPrefecture('大阪府')
    const input = getMunInput(container)

    // 高槻市を選択
    fireEvent.change(input, { target: { value: '高槻' } })
    const opt = await screen.findByRole('option', { name: '高槻市（区）' })
    fireEvent.click(opt)
    await waitFor(() => expect(input.value).toBe('高槻市'), { timeout: 3000 })

    // 奈良県に変更（#55: 折りたたみなので要約ボタンから再展開）
    fireEvent.click(screen.getByRole('button', { name: /変更/ }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '奈良県' })).toBeTruthy()
    }, { timeout: 3000 })
    fireEvent.click(screen.getByRole('button', { name: '奈良県' }))

    // 入力欄が空に、選択がクリアされ親stateからも消える
    await waitFor(() => {
      const s = getMunInput(container)
      expect(s.value).toBe('')
    }, { timeout: 3000 })
    expect(dispatchMock).toHaveBeenLastCalledWith({ type: 'SET_MUNICIPALITY', payload: null })
    // 奈良県のカandidatesに奈良市のみ
    fireEvent.focus(getMunInput(container))
    await waitFor(() => {
      expect(getCandidateTexts()).toEqual(['奈良市'])
    }, { timeout: 3000 })
  })

  it('6: 親stateのselectedMunicipalityが外部からセットされても入力欄に自治体名が表示される', async () => {
    // URL復元相当: レンダ時点でselectedMunicipalityが既にセットされている
    const { container } = renderSearch('pc', {
      selectedMunicipality: {
        code: '272078',
        name: '高槻市',
        bbox: TAKATSUKI.bbox
      }
    })

    await waitFor(() => {
      const input = getMunInput(container)
      expect(input).toBeTruthy()
      expect(input.value).toBe('高槻市')
    }, { timeout: 3000 })
    // 都道府県も同期されている（大阪府が選択色）
    expect(screen.getByRole('button', { name: '大阪府' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('7: 選択後に入力欄を編集すると選択がクリアされる', async () => {
    const { container } = renderSearch()
    await pickPrefecture('大阪府')
    const input = getMunInput(container)

    fireEvent.change(input, { target: { value: '高槻' } })
    const opt = await screen.findByRole('option', { name: '高槻市（区）' })
    fireEvent.click(opt)
    await waitFor(() => expect(input.value).toBe('高槻市'), { timeout: 3000 })

    // 入力を変更 → 選択クリア（親stateからも）
    fireEvent.change(input, { target: { value: '吹田' } })
    expect(dispatchMock).toHaveBeenLastCalledWith({ type: 'SET_MUNICIPALITY', payload: null })
    await waitFor(() => {
      const texts = getCandidateTexts()
      expect(texts).toEqual(['吹田市（区）'])
    }, { timeout: 3000 })
  })
})

describe('市区町村 テキスト入力＋サジェスト（モバイル variant）', () => {
  it('PCと同じ挙動: フォーカスで全候補表示 → 候補タップで親state更新', async () => {
    const { container } = renderSearch('mobile')
    await pickPrefecture('大阪府')
    const input = getMunInput(container, 'mobile')
    expect(input).toBeTruthy()

    // 空入力でフォーカス → 全4自治体
    fireEvent.focus(input)
    await waitFor(() => {
      expect(getCandidateTexts()).toHaveLength(4)
    }, { timeout: 3000 })

    // 部分一致入力 → 絞り込み
    fireEvent.change(input, { target: { value: '豊中' } })
    const opt = await screen.findByRole('option', { name: '豊中市（区）' })
    fireEvent.click(opt)

    await waitFor(() => expect(input.value).toBe('豊中市'), { timeout: 3000 })
    expect(dispatchMock).toHaveBeenCalledWith({
      type: 'SET_MUNICIPALITY',
      payload: { code: '272035', name: '豊中市', bbox: MUNI_DATA.municipalities.find(m => m.code === '272035').bbox }
    })
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).toBeNull()
    }, { timeout: 3000 })
  })
})
