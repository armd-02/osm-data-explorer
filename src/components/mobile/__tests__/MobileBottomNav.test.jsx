// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import MobileBottomNav, { MOBILE_TABS } from '../MobileBottomNav'

/**
 * (#59) モバイル下部ナビゲーション
 * - 4タブ（検索/一覧/地図/その他）
 * - アクティブタブに aria-current="page"
 * - クリックで onSelect(id)
 * - タップターゲット44px以上（min-h-[56px]）
 * - safe-area-inset-bottom パディング
 */

afterEach(() => cleanup())

describe('MobileBottomNav', () => {
  it('検索/一覧/地図/その他の4タブが並んでいる', () => {
    render(<MobileBottomNav active="search" onSelect={vi.fn()} />)
    const nav = screen.getByRole('navigation', { name: 'モバイルナビゲーション' })
    expect(MOBILE_TABS).toHaveLength(4)
    for (const { label } of MOBILE_TABS) {
      expect(within(nav).getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('アクティブタブに aria-current="page" が付く', () => {
    render(<MobileBottomNav active="list" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: '一覧' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: '検索' }).getAttribute('aria-current')).toBeNull()
  })

  it('クリックで対応タブのonSelectが呼ばれる', () => {
    const onSelect = vi.fn()
    render(<MobileBottomNav active="search" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: '地図' }))
    expect(onSelect).toHaveBeenCalledWith('map')
  })

  it('タップターゲット44px以上・safe-area対応', () => {
    const { container } = render(<MobileBottomNav active="search" onSelect={vi.fn()} />)
    const nav = container.querySelector('nav')
    expect(nav.className).toContain('safe-area-inset-bottom')
    for (const btn of nav.querySelectorAll('button')) {
      expect(btn.className).toContain('min-h-[56px]')
    }
  })
})
