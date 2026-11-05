// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import CategoryPicker from '../CategoryPicker'
import { CATEGORY_GROUPS } from '../../data/categories'

afterEach(cleanup)

function renderPicker(value = '', onChange = vi.fn(), onPurposeChange = vi.fn()) {
  return render(
    <CategoryPicker variant="mobile" value={value} onChange={onChange} onPurposeChange={onPurposeChange} />
  )
}

/**
 * valueを内部stateで管理するラッパー。
 * onChangeで値が変わると再描画される（実際のAppContextの挙動を模倣）。
 */
function renderControlledPicker(initialValue, onChange = vi.fn(), onPurposeChange = vi.fn()) {
  function Controlled() {
    const [value, setValue] = React.useState(initialValue)
    return (
      <CategoryPicker
        variant="mobile"
        value={value}
        onChange={(v) => { onChange(v); setValue(v) }}
        onPurposeChange={onPurposeChange}
      />
    )
  }
  return render(<Controlled />)
}

// onPurposeChangeなし（旧挙動の検証用）
function renderControlledPickerLegacy(initialValue, onChange = vi.fn()) {
  function Controlled() {
    const [value, setValue] = React.useState(initialValue)
    return (
      <CategoryPicker
        variant="mobile"
        value={value}
        onChange={(v) => { onChange(v); setValue(v) }}
      />
    )
  }
  return render(<Controlled />)
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

  it('選択中カテゴリと異なる目的を展開すると旧選択がクリアされる（stale条件の防止）', () => {
    const onChange = vi.fn()
    renderControlledPickerLegacy('cafe', onChange) // カフェ（目的: 食べる）が選択中
    // 「遊ぶ」目的チップをタップ → 選択中バッジが消え、遊ぶカテゴリが展開
    fireEvent.click(screen.getByRole('button', { name: '遊ぶ' }))
    expect(onChange).toHaveBeenCalledWith('')
    expect(screen.queryByRole('button', { name: '解除' })).toBeNull()
    expect(screen.getByRole('button', { name: '公園・広場' })).toBeTruthy()
    // 食べるのカテゴリは展開リストに現れない
    expect(screen.queryByRole('button', { name: 'カフェ' })).toBeNull()
  })

describe('CategoryPicker（mobile: 目的スコープ報告 #44）', () => {
  it('目的チップをタップ（展開）すると onPurposeChange(目的名) が呼ばれる', () => {
    const onPurposeChange = vi.fn()
    renderPicker('', vi.fn(), onPurposeChange)
    fireEvent.click(screen.getByRole('button', { name: '遊ぶ' }))
    expect(onPurposeChange).toHaveBeenCalledWith('遊ぶ')
  })

  it('同じ目的チップを再タップ（閉じる）すると onPurposeChange(null) が呼ばれる', () => {
    const onPurposeChange = vi.fn()
    renderPicker('', vi.fn(), onPurposeChange)
    fireEvent.click(screen.getByRole('button', { name: '遊ぶ' }))
    onPurposeChange.mockClear()
    fireEvent.click(screen.getByRole('button', { name: '遊ぶ' }))
    expect(onPurposeChange).toHaveBeenCalledWith(null)
  })

  it('カテゴリチップをタップすると onPurposeChange(null) が呼ばれる（カテゴリが優先）', () => {
    const onChange = vi.fn()
    const onPurposeChange = vi.fn()
    renderPicker('', onChange, onPurposeChange)
    fireEvent.click(screen.getByRole('button', { name: '遊ぶ' }))
    expect(onPurposeChange).toHaveBeenLastCalledWith('遊ぶ')
    onPurposeChange.mockClear()
    fireEvent.click(screen.getByRole('button', { name: '公園・広場' }))
    expect(onChange).toHaveBeenCalledWith('park')
    expect(onPurposeChange).toHaveBeenCalledWith(null)
  })

  it('解除ボタンをタップすると onPurposeChange(null) が呼ばれる', () => {
    const onChange = vi.fn()
    const onPurposeChange = vi.fn()
    renderPicker('cafe', onChange, onPurposeChange)
    fireEvent.click(screen.getByRole('button', { name: '解除' }))
    expect(onChange).toHaveBeenCalledWith('')
    expect(onPurposeChange).toHaveBeenCalledWith(null)
  })

  it('異なる目的を展開すると旧選択クリアと新しい目的スコープがセットされる', () => {
    const onChange = vi.fn()
    const onPurposeChange = vi.fn()
    renderControlledPicker('cafe', onChange, onPurposeChange) // カフェ（食べる）選択中
    fireEvent.click(screen.getByRole('button', { name: '遊ぶ' }))
    expect(onChange).toHaveBeenCalledWith('')
    expect(onPurposeChange).toHaveBeenCalledWith('遊ぶ')
  })

  it('同じ目的のカテゴリ選択中は目的チップ展開でスコープがセットされない', () => {
    const onPurposeChange = vi.fn()
    renderPicker('cafe', vi.fn(), onPurposeChange) // カフェ（食べる）選択中
    fireEvent.click(screen.getByRole('button', { name: '食べる' }))
    // カテゴリが優先されるため onPurposeChange は呼ばれない
    expect(onPurposeChange).not.toHaveBeenCalled()
    // 選択は保持される
    expect(screen.getByRole('button', { name: '解除' })).toBeTruthy()
  })
})

  it('選択中カテゴリと同じ目的を展開すると選択は保持される', () => {
    const onChange = vi.fn()
    renderPicker('cafe', onChange)
    fireEvent.click(screen.getByRole('button', { name: '食べる' }))
    expect(onChange).not.toHaveBeenCalledWith('')
    expect(screen.getByRole('button', { name: '解除' })).toBeTruthy()
    // カフェチップが選択状態で表示される
    expect(screen.getByRole('button', { name: 'カフェ' }).getAttribute('aria-pressed')).toBe('true')
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
