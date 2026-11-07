// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import MapToolbar from '../MapToolbar'

/**
 * MapToolbar（地名検索）— MapLibre版の検証
 * - setViewが[経度, 緯度]順で呼ばれる
 * - (#38) ポップアップはtextContentベースのDOMノード（HTML注入不可）
 * - 再検索時、旧マーカーが削除される（残存防止）
 */

vi.mock('../../utils/geo', () => ({
  geocode: vi.fn()
}))

import { geocode } from '../../utils/geo'

beforeEach(() => {
  if (mockState.api) mockState.api.resetState()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function makeMapMock() {
  const map = {
    calls: [],
    _markers: [],
    setView(...a) { map.calls.push({ name: 'setView', args: a }) },
    getZoom() { return 12 },
    addMarker(m) { map._markers.push(m) },
    removeMarker(m) { map._markers = map._markers.filter((x) => x !== m) },
  }
  return { current: map }
}

function renderToolbar(mapRef, apiState) {
  return render(<MapToolbar mapRef={mapRef} />)
}

// 本ファイルは maplibre-gl をモックする（共通モックを使用）
const mockState = vi.hoisted(() => ({ api: null }))
vi.mock('maplibre-gl', async () => {
  const mod = await import('../../test/maplibreMock')
  mockState.api = mod.createMapLibreMock({ autoLoad: false })
  return { default: mockState.api }
})

describe('MapToolbar 地名検索', () => {
  it('検索実行でsetViewが[経度, 緯度]順・ズーム15以上で呼ばれる', async () => {
    geocode.mockResolvedValue({ lat: 35.0, lon: 139.8, displayName: '渋谷駅' })
    const mapRef = makeMapMock()

    renderToolbar(mapRef)
    const input = screen.getByPlaceholderText('地名で移動')
    fireEvent.change(input, { target: { value: '渋谷' } })
    fireEvent.submit(input.closest('form'))

    await waitFor(() => {
      expect(mapRef.current.calls.some((c) => c.name === 'setView')).toBe(true)
    })
    const setView = mapRef.current.calls.find((c) => c.name === 'setView')
    expect(setView.args[0]).toEqual([139.8, 35.0]) // [lng, lat]
    expect(setView.args[1]).toBe(15)
  })

  it('マーカーはプレーンDOM要素で、ポップアップはtextContentベース（#38）', async () => {
    geocode.mockResolvedValue({ lat: 35.0, lon: 139.8, displayName: '<b>渋谷</b>&' })
    const mapRef = makeMapMock()

    renderToolbar(mapRef)
    fireEvent.change(screen.getByPlaceholderText('地名で移動'), { target: { value: '渋谷' } })
    fireEvent.submit(screen.getByPlaceholderText('地名で移動').closest('form'))

    await waitFor(() => {
      expect(mockState.api._state.markers.length).toBe(1)
    })

    const marker = mockState.api._state.markers[0]
    // プレーンDOM要素（divIcon相当）
    expect(marker._element.tagName).toBe('DIV')
    expect(marker._element.className).toBe('geocode-marker')
    expect(marker._lngLat).toEqual([139.8, 35.0])

    // ポップアップ: DOMノード + textContent（HTMLタグとして解釈されない）
    const popup = marker._popup
    expect(popup._element).toBeInstanceOf(HTMLElement)
    expect(popup._text).toBeNull()
    const strong = popup._element.querySelector('strong')
    expect(strong.textContent).toBe('<b>渋谷</b>&')
    expect(strong.innerHTML).not.toContain('<b>')
    expect(popup._element.querySelector('b')).toBeNull()
  })

  it('2回目の検索で旧マーカーが削除される（残存防止）', async () => {
    geocode
      .mockResolvedValueOnce({ lat: 35.0, lon: 139.8, displayName: '渋谷駅' })
      .mockResolvedValueOnce({ lat: 35.6, lon: 139.7, displayName: '東京駅' })
    const mapRef = makeMapMock()

    renderToolbar(mapRef)
    const input = screen.getByPlaceholderText('地名で移動')

    fireEvent.change(input, { target: { value: '渋谷' } })
    fireEvent.submit(input.closest('form'))
    await waitFor(() => {
      expect(mockState.api._state.markers.length).toBe(1)
    })
    const firstMarker = mockState.api._state.markers[0]

    fireEvent.change(input, { target: { value: '東京' } })
    fireEvent.submit(input.closest('form'))
    await waitFor(() => {
      expect(mockState.api._state.markers.length).toBe(2)
    })

    expect(firstMarker._removed).toBe(true)
    expect(mapRef.current._markers).toHaveLength(1)
    expect(mapRef.current._markers[0]).toBe(mockState.api._state.markers[1])
  })

  it('検索不能時はエラーメッセージを表示し、マーカーを作らない', async () => {
    geocode.mockResolvedValue(null)
    const mapRef = makeMapMock()

    renderToolbar(mapRef)
    fireEvent.change(screen.getByPlaceholderText('地名で移動'), { target: { value: 'ない場所' } })
    fireEvent.submit(screen.getByPlaceholderText('地名で移動').closest('form'))

    expect(await screen.findByText(/場所が見つかりませんでした/)).toBeTruthy()
    expect(mockState.api._state.markers).toHaveLength(0)
  })
})
