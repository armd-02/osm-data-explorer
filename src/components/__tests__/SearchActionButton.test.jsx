// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import SearchActionButton from '../SearchActionButton'

/**
 * (#47) SearchActionButton コンポーネントテスト
 *
 * - 検索ボタンがDOMに存在する（スクロール領域の外に配置される前提）
 * - クリックで検索が実行される（onSearchが呼ばれる）
 * - 条件不足時はdisableされ、クリックしても検索されない
 * - 検索中は「中止」ボタンになり、クリックでonCancelが呼ばれる
 * - エラー後も「検索する」ボタンに復旧する
 */

afterEach(() => cleanup())

const OK_CRITERIA = {
  ok: true,
  bbox: { south: 34.7, west: 135.5, north: 34.72, east: 135.52 },
  searchSource: 'map',
  searchMode: 'simple',
  category: 'cafe',
  keyword: '',
  query: '[out:json];node[amenity=cafe](34.7,135.5,34.72,135.52);out;'
}

describe('SearchActionButton', () => {
  it('「検索する」ボタンがDOMに存在する', () => {
    render(<SearchActionButton criteria={OK_CRITERIA} status="idle" onSearch={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: '検索する' })).toBeTruthy()
  })

  it('クリックでonSearchが呼ばれる（検索実行）', () => {
    const onSearch = vi.fn()
    render(<SearchActionButton criteria={OK_CRITERIA} status="idle" onSearch={onSearch} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '検索する' }))
    expect(onSearch).toHaveBeenCalledTimes(1)
  })

  it('条件不足（ok: false）時はdisableされ、クリックしても検索されない', () => {
    const onSearch = vi.fn()
    const badCriteria = { ok: false, reason: 'municipality_not_selected', message: '自治体が未選択です。', suggestion: '都道府県と市区町村を選択してください。' }
    render(<SearchActionButton criteria={badCriteria} status="idle" onSearch={onSearch} onCancel={vi.fn()} />)
    const btn = screen.getByRole('button', { name: '検索する' })
    expect(btn.disabled).toBe(true)
    // disable理由がヒントとして表示される
    expect(screen.getByText('自治体が未選択です。')).toBeTruthy()
    fireEvent.click(btn)
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('検索中は「中止」ボタンが表示され、クリックでonCancelが呼ばれる', () => {
    const onCancel = vi.fn()
    const onSearch = vi.fn()
    render(<SearchActionButton criteria={OK_CRITERIA} status="loading" onSearch={onSearch} onCancel={onCancel} />)
    // 「検索する」は非表示、「中止」が出現
    expect(screen.queryByRole('button', { name: '検索する' })).toBeNull()
    const cancelBtn = screen.getByRole('button', { name: '中止' })
    expect(cancelBtn).toBeTruthy()
    fireEvent.click(cancelBtn)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('エラー後も「検索する」ボタンに復旧する', () => {
    const onSearch = vi.fn()
    const { rerender } = render(<SearchActionButton criteria={OK_CRITERIA} status="loading" onSearch={onSearch} onCancel={vi.fn()} />)
    rerender(<SearchActionButton criteria={OK_CRITERIA} status="error" onSearch={onSearch} onCancel={vi.fn()} />)
    const btn = screen.getByRole('button', { name: '検索する' })
    expect(btn.disabled).toBe(false)
    fireEvent.click(btn)
    expect(onSearch).toHaveBeenCalledTimes(1)
  })
})

/**
 * (#59) モバイル fullWidth バリアント
 * - 幅100%・高さ44px以上のタップターゲット
 * - カスタムlabel（地図タブの「この表示範囲で検索」）
 * - 検索中は「検索中...」状態 + 全幅の「中止」ボタン
 * - 条件不足時はdisable + ボタン下のヒント
 */
describe('SearchActionButton（モバイル fullWidth バリアント）', () => {
  it('fullWidth: 全幅・44px以上のタップターゲットになる', () => {
    render(<SearchActionButton fullWidth criteria={OK_CRITERIA} status="idle" onSearch={vi.fn()} onCancel={vi.fn()} />)
    const btn = screen.getByRole('button', { name: '検索する' })
    expect(btn.className).toContain('w-full')
    expect(btn.className).toContain('min-h-[48px]')
  })

  it('fullWidth: label プロパティでボタンテキストを変更できる', () => {
    render(<SearchActionButton fullWidth label="この表示範囲で検索" criteria={OK_CRITERIA} status="idle" onSearch={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'この表示範囲で検索' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '検索する' })).toBeNull()
  })

  it('fullWidth: 検索中は「検索中...」と全幅の「中止」ボタンが表示される', () => {
    const onCancel = vi.fn()
    render(<SearchActionButton fullWidth criteria={OK_CRITERIA} status="loading" onSearch={vi.fn()} onCancel={onCancel} />)
    expect(screen.getByText('検索中...')).toBeTruthy()
    const cancelBtn = screen.getByRole('button', { name: '中止' })
    expect(cancelBtn.className).toContain('w-full')
    fireEvent.click(cancelBtn)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('fullWidth: 条件不足時はdisableされ、ボタン下に理由ヒントが表示される', () => {
    const onSearch = vi.fn()
    const bad = { ok: false, reason: 'no_bbox', message: '検索範囲が設定されていません。', suggestion: '地図を移動・拡大して検索したい範囲を表示してください。' }
    render(<SearchActionButton fullWidth criteria={bad} status="idle" onSearch={onSearch} onCancel={vi.fn()} />)
    const btn = screen.getByRole('button', { name: '検索する' })
    expect(btn.disabled).toBe(true)
    expect(screen.getByText('検索範囲が設定されていません。')).toBeTruthy()
    fireEvent.click(btn)
    expect(onSearch).not.toHaveBeenCalled()
  })
})
