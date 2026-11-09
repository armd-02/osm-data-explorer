// @vitest-environment jsdom
/**
 * ExportBar: stacked バリアントの表示とクリック動作
 *
 * - variant="stacked" 時: 件数テキスト→CSVボタン→GeoJSONボタン→ODbL表記 の縦積み
 * - CSVボタン: w-full・min-h-[48px]・bg-emerald-600（検索ボタンと同じ寸法）
 * - GeoJSONボタン: w-full・min-h-[44px]・白地＋枠線
 * - クリックで downloadCSV / downloadGeoJSON が呼ばれる
 * - フィルタで0件のとき両ボタンが disabled
 * - デフォルト（variant 未指定）: 従来どおり横並び表示
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { AppContext } from '../../context/AppContext'
import { appReducer, createInitialState } from '../../state/appReducer'
import ExportBar from '../ExportBar'
import * as exportUtils from '../../utils/export'

// downloadCSV / downloadGeoJSON をモック
vi.mock('../../utils/export', () => ({
  downloadCSV: vi.fn(),
  downloadGeoJSON: vi.fn(),
}))

const RESULTS = [
  { type: 'node', id: 1, name: 'カフェA', tags: { amenity: 'cafe', name: 'カフェA' } },
  { type: 'node', id: 2, name: 'カフェB', tags: { amenity: 'cafe', name: 'カフェB' } },
]

function Harness({ preActions = [], children }) {
  const [state] = React.useReducer(
    appReducer,
    preActions,
    (acts) => acts.reduce((s, a) => appReducer(s, a), createInitialState())
  )
  return (
    <AppContext.Provider value={{ state, dispatch: vi.fn() }}>
      {children}
    </AppContext.Provider>
  )
}

const SET_RESULTS = { type: 'SET_RESULTS', payload: RESULTS }

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => cleanup())

describe('ExportBar（デフォルト: 横並び）', () => {
  it('variant 未指定で横並び（flex-wrap）が表示される', () => {
    render(<Harness preActions={[SET_RESULTS]}><ExportBar /></Harness>)
    const container = screen.getByText('2件を保存します').closest('div')
    expect(container.className).toContain('flex-wrap')
  })

  it('クリックで downloadCSV が呼ばれる', () => {
    render(<Harness preActions={[SET_RESULTS]}><ExportBar /></Harness>)
    fireEvent.click(screen.getByRole('button', { name: /一覧を保存（CSV）/ }))
    expect(exportUtils.downloadCSV).toHaveBeenCalledTimes(1)
  })

  it('クリックで downloadGeoJSON が呼ばれる', () => {
    render(<Harness preActions={[SET_RESULTS]}><ExportBar /></Harness>)
    fireEvent.click(screen.getByRole('button', { name: /GeoJSON（高度な形式）/ }))
    expect(exportUtils.downloadGeoJSON).toHaveBeenCalledTimes(1)
  })
})

describe('ExportBar（stacked バリアント）', () => {
  it('件数テキストが1行（p要素）で表示される', () => {
    render(<Harness preActions={[SET_RESULTS]}><ExportBar variant="stacked" /></Harness>)
    const countText = screen.getByText('2件を保存します')
    expect(countText.tagName).toBe('P')
  })

  it('CSVボタンが全幅・48px以上・emerald-600 の大きなボタンになる', () => {
    render(<Harness preActions={[SET_RESULTS]}><ExportBar variant="stacked" /></Harness>)
    const csvBtn = screen.getByRole('button', { name: /一覧を保存（CSV）/ })
    expect(csvBtn.className).toContain('w-full')
    expect(csvBtn.className).toContain('min-h-[48px]')
    expect(csvBtn.className).toContain('bg-emerald-600')
    expect(csvBtn.className).toContain('text-base')
    expect(csvBtn.className).toContain('rounded-xl')
  })

  it('GeoJSONボタンが全幅・44px以上・白地＋枠線の副ボタンになる', () => {
    render(<Harness preActions={[SET_RESULTS]}><ExportBar variant="stacked" /></Harness>)
    const geoBtn = screen.getByRole('button', { name: /GeoJSON（高度な形式）/ })
    expect(geoBtn.className).toContain('w-full')
    expect(geoBtn.className).toContain('min-h-[44px]')
    expect(geoBtn.className).toContain('bg-white')
    expect(geoBtn.className).toContain('border-slate-300')
  })

  it('ODbL表記が下部に表示される', () => {
    render(<Harness preActions={[SET_RESULTS]}><ExportBar variant="stacked" /></Harness>)
    expect(screen.getByText(/ODbL /)).toBeTruthy()
  })

  it('CSVクリックで downloadCSV が呼ばれる', () => {
    render(<Harness preActions={[SET_RESULTS]}><ExportBar variant="stacked" /></Harness>)
    fireEvent.click(screen.getByRole('button', { name: /一覧を保存（CSV）/ }))
    expect(exportUtils.downloadCSV).toHaveBeenCalledTimes(1)
    expect(exportUtils.downloadGeoJSON).not.toHaveBeenCalled()
  })

  it('GeoJSONクリックで downloadGeoJSON が呼ばれる', () => {
    render(<Harness preActions={[SET_RESULTS]}><ExportBar variant="stacked" /></Harness>)
    fireEvent.click(screen.getByRole('button', { name: /GeoJSON（高度な形式）/ }))
    expect(exportUtils.downloadGeoJSON).toHaveBeenCalledTimes(1)
    expect(exportUtils.downloadCSV).not.toHaveBeenCalled()
  })

  it('フィルタで0件のとき両ボタンが disabled になり、クリックで出力されない', () => {
    // フィルタで結果が0件になる条件: nameFilter で一致しない名前を設定
    const actions = [
      SET_RESULTS,
      { type: 'SET_RESULT_FILTERS', payload: { nameFilter: '存在しない施設' } },
    ]
    render(<Harness preActions={actions}><ExportBar variant="stacked" /></Harness>)
    const csvBtn = screen.getByRole('button', { name: /一覧を保存（CSV）/ })
    const geoBtn = screen.getByRole('button', { name: /GeoJSON（高度な形式）/ })
    expect(csvBtn.disabled).toBe(true)
    expect(geoBtn.disabled).toBe(true)
    fireEvent.click(csvBtn)
    expect(exportUtils.downloadCSV).not.toHaveBeenCalled()
    fireEvent.click(geoBtn)
    expect(exportUtils.downloadGeoJSON).not.toHaveBeenCalled()
  })
})
