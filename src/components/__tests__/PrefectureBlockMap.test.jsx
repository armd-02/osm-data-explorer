// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import PrefectureBlockMap, { PREFECTURE_BLOCKS } from '../PrefectureBlockMap'

afterEach(cleanup)

describe('都道府県ブロック図による選択', () => {
  const codes = PREFECTURE_BLOCKS.map(([code]) => code)

  it('添付図と同じ47都道府県がそれぞれ1回だけ存在する', () => {
    expect(PREFECTURE_BLOCKS).toHaveLength(47)
    expect(new Set(codes).size).toBe(47)
    expect(codes).toEqual(Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, '0')))
  })

  it('スマホ想定の初期状態では日本全体を表示し、必要なら拡大・縮小できる', () => {
    const { container } = render(<PrefectureBlockMap availableCodes={codes} onSelect={() => {}} />)
    const svg = container.querySelector('svg')
    expect(svg.classList.contains('w-full')).toBe(true)
    const zoomButton = screen.getByRole('button', { name: '拡大して選ぶ' })
    expect(zoomButton.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(zoomButton)
    expect(svg.classList.contains('w-[680px]')).toBe(true)
    expect(screen.getByRole('button', { name: '日本全体を見る' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '日本全体を見る' }))
    expect(svg.classList.contains('w-full')).toBe(true)
  })

  it('大阪府のクリックで既存自治体データと同じ都道府県コード27を渡す', () => {
    const onSelect = vi.fn()
    render(<PrefectureBlockMap selectedCode="" availableCodes={codes} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: '大阪府' }))
    expect(onSelect).toHaveBeenCalledWith('27')
  })

  it('キーボード操作（Enter / Space）でも都道府県を選択できる', () => {
    const onSelect = vi.fn()
    render(<PrefectureBlockMap availableCodes={codes} onSelect={onSelect} />)
    const kyoto = screen.getByRole('button', { name: '京都府' })
    fireEvent.keyDown(kyoto, { key: 'Enter' })
    fireEvent.keyDown(kyoto, { key: ' ' })
    expect(onSelect).toHaveBeenNthCalledWith(1, '26')
    expect(onSelect).toHaveBeenNthCalledWith(2, '26')
  })

  it('自治体データに存在しない府県は選択不可で、既存選択を強調表示する', () => {
    const onSelect = vi.fn()
    render(<PrefectureBlockMap selectedCode="27" availableCodes={['27']} onSelect={onSelect} />)
    const osaka = screen.getByRole('button', { name: '大阪府' })
    const kyoto = screen.getByRole('button', { name: '京都府', hidden: true })
    expect(osaka.getAttribute('aria-pressed')).toBe('true')
    expect(kyoto.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(kyoto)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
