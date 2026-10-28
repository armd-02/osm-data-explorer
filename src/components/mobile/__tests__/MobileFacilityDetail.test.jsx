// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import MobileFacilityDetail from '../MobileFacilityDetail'

/**
 * (#59) 施設詳細ボトムシート
 * - role="dialog" + aria-modal + 名称付きaria-label
 * - 登録済みの情報のみ表示（住所/電話/Web）
 * - 電話はtel:リンク、Webはtarget=_blank + rel=noopener
 * - OSMリンク・タグ一覧（<details>折りたたみ）
 * - 「地図で見る」（座標がある場合のみ）と「閉じる」
 */

afterEach(() => cleanup())

const FULL = {
  type: 'node', id: 1001, lat: 34.85, lon: 135.5,
  name: 'テスト珈琲店', // overpass.js が tags.name を上位に正規化した結果を模す
  tags: {
    name: 'テスト珈琲店', amenity: 'cafe', cuisine: 'coffee',
    'addr:city': '大阪市', 'addr:suburb': '梅田', 'addr:street': '1-1',
    phone: '+81-6-1234-5678', website: 'https://example.com/coffee',
  },
}

function renderDetail(result = FULL, props = {}) {
  return render(
    <MobileFacilityDetail
      detail={{ result }}
      onClose={props.onClose || vi.fn()}
      onShowOnMap={props.onShowOnMap || vi.fn()}
    />
  )
}

describe('MobileFacilityDetail', () => {
  it('ボトムシートは role="dialog" + aria-modal で名称を付ける', () => {
    renderDetail()
    const dialog = screen.getByRole('dialog', { name: '施設詳細: テスト珈琲店' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('住所・電話・Webサイトが表示される（登録済み情報のみ）', () => {
    renderDetail()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/大阪市 梅田 1-1/)).toBeTruthy()

    // 電話: tel: リンク
    const phoneLink = within(dialog).getByRole('link', { name: /タップで発信/ })
    expect(phoneLink.getAttribute('href')).toBe('tel:+81-6-1234-5678')

    // Webサイト: target=_blank + rel=noopener
    const webLink = within(dialog).getByRole('link', { name: /Webサイト/ })
    expect(webLink.getAttribute('href')).toBe('https://example.com/coffee')
    expect(webLink.getAttribute('target')).toBe('_blank')
    expect(webLink.getAttribute('rel')).toContain('noopener')
  })

  it('OSM ID・座標・OSMリンクが表示される', () => {
    renderDetail()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('node/1001')).toBeTruthy()
    expect(within(dialog).getByText(/34.85, 135.5/)).toBeTruthy()
    const osmLink = within(dialog).getByRole('link', { name: /OSMで見る/ })
    expect(osmLink.getAttribute('href')).toBe('https://www.openstreetmap.org/node/1001')
  })

  it('タグ一覧は<details>で折りたたまれて表示される', () => {
    renderDetail()
    const dialog = screen.getByRole('dialog')
    const summary = within(dialog).getByText('タグ一覧（8）')
    expect(summary.closest('details')).toBeTruthy()

    // 展開すると全キー・値が表示される
    fireEvent.click(summary)
    expect(within(dialog).getByText('addr:city')).toBeTruthy()
    expect(within(dialog).getByText('大阪市')).toBeTruthy()
  })

  it('未登録の情報は捏造せず「未登録」であることを明示する', () => {
    renderDetail({ type: 'node', id: 9, lat: 34.8, lon: 135.5, tags: { amenity: 'bench' } })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/OSMに登録されていません/)).toBeTruthy()
    expect(within(dialog).queryByRole('link', { name: /タップで発信/ })).toBeNull()
    expect(within(dialog).queryByRole('link', { name: /Webサイト/ })).toBeNull()
    // 「地図で見る」は座標があるため表示される
    expect(within(dialog).getByRole('button', { name: '地図で見る' })).toBeTruthy()
  })

  it('座標がない要素では「地図で見る」ボタンが表示されない', () => {
    renderDetail({ type: 'node', id: 9, tags: { amenity: 'bench' } })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: '地図で見る' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: '閉じる' })).toBeTruthy()
  })

  it('「閉じる」で onClose、「地図で見る」で onShowOnMap(result) が呼ばれる', () => {
    const onClose = vi.fn()
    const onShowOnMap = vi.fn()
    renderDetail(FULL, { onClose, onShowOnMap })
    const dialog = screen.getByRole('dialog')

    fireEvent.click(within(dialog).getByRole('button', { name: '地図で見る' }))
    expect(onShowOnMap).toHaveBeenCalledWith(FULL)

    fireEvent.click(within(dialog).getByRole('button', { name: '閉じる' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('背景クリックで onClose が呼ばれる', () => {
    const onClose = vi.fn()
    renderDetail(FULL, { onClose })
    // 背景（presentation層のブラックオーバーレイ）
    const backdrop = document.querySelector('.bg-black\\/40')
    expect(backdrop).toBeTruthy()
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
