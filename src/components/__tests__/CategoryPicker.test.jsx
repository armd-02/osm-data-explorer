// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import CategoryPicker from '../CategoryPicker'
import { CATEGORY_GROUPS } from '../../data/categories'

afterEach(cleanup)

function renderPicker(value = '', onChange = vi.fn()) {
  return render(<CategoryPicker variant="mobile" value={value} onChange={onChange} />)
}

describe('CategoryPicker（mobile: 目的チップ）', () => {
  it('6つの目的チップ（食べる・買う・遊ぶ・暮らす・学ぶ・その他）を表示する', () => {
    renderPicker()
    for (const g of CATEGORY_GROUPS) {
      const btn = screen.getByRole('button', { name: g.name })
      expect(btn).toBeTruthy()
      expect(btn.getAttribute('aria-expanded')).toBe('false')
      expect(btn.getAttribute('aria-pressed')).toBe('false')
    }
  })

  it('目的チップをタップするとその目的のカテゴリチップが展開される', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('button', { name: '食べる' }))
    expect(screen.getByRole('button', { name: '食べる' }).getAttribute('aria-expanded')).toBe('true')
    // 食べる = cafe / restaurant / food_drink
    expect(screen.getByRole('button', { name: 'カフェ' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'レストラン' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '飲食店（すべて）' })).toBeTruthy()
  })

  it('同じ目的チップを再タップすると展開が閉じる', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('button', { name: '買う' }))
    expect(screen.getByRole('button', { name: 'コンビニ・スーパー' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '買う' }))
    expect(screen.queryByRole('button', { name: 'コンビニ・スーパー' })).toBeNull()
  })

  it('カテゴリチップをタップすると onChange にカテゴリIDが渡される（行は閉じる）', () => {
    const onChange = vi.fn()
    renderPicker('', onChange)
    fireEvent.click(screen.getByRole('button', { name: '買う' }))
    fireEvent.click(screen.getByRole('button', { name: 'コンビニ・スーパー' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('convenience')
  })

  it('選択中のカテゴリチップを再タップすると選択が解除される（onChange("")）', () => {
    const onChange = vi.fn()
    renderPicker('convenience', onChange)
    // 選択中バッジが表示される
    expect(screen.getByText(/コンビニ・スーパー/)).toBeTruthy()
    // 買うチップに選択インジケータ
    expect(screen.getByRole('button', { name: '買う' }).getAttribute('aria-pressed')).toBe('true')

    // バッジの解除ボタンで解除
    fireEvent.click(screen.getByRole('button', { name: '解除' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('選択中カテゴリのバッジ（アイコン+ラベル）を表示する', () => {
    renderPicker('park')
    expect(screen.getByText(/公園/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '解除' })).toBeTruthy()
    // 遊ぶ 目的チップに選択インジケータ
    expect(screen.getByRole('button', { name: '遊ぶ' }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('CategoryPicker（pc: グループ付きselect）', () => {
  it('6つのoptgroup（アイコン付き）でカテゴリを列挙する', () => {
    const { container } = render(
      <CategoryPicker variant="pc" value="" onChange={() => {}} />
    )
    const select = container.querySelector('select')
    expect(select).toBeTruthy()
    const groups = [...select.querySelectorAll('optgroup')]
    expect(groups).toHaveLength(CATEGORY_GROUPS.length)
    expect(groups[0].label).toBe(`${CATEGORY_GROUPS[0].icon} ${CATEGORY_GROUPS[0].name}`)
  })

  it('selectの変更で onChange にカテゴリIDが渡される', () => {
    const onChange = vi.fn()
    const { container } = render(
      <CategoryPicker variant="pc" value="" onChange={onChange} />
    )
    const select = container.querySelector('select')
    fireEvent.change(select, { target: { value: 'cafe' } })
    expect(onChange).toHaveBeenCalledWith('cafe')
  })
})
