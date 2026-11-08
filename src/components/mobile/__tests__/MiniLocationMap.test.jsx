// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import MiniLocationMap from '../MiniLocationMap'
import { OSM_RASTER_STYLE } from '../../../utils/mapStyle'

/**
 * (#62) 施設詳細用 小型ロケーションマップの検証
 *
 * - 施設座標を中心にMapを作成（center=[lng,lat]）
 * - メインマップと同一の OSM_RASTER_STYLE（OSMFJタイル）を使用
 * - 座標にマーカーを配置（setLngLat([lng,lat])）
 * - 既定attributionを無効化し、compact AttributionControl を明示追加
 *   （OSMタイル利用規約上のcredit表示）
 * - 非インタラクティブ（pointer-events-none）: シートのスクロールと競合しない
 * - アンマウント時に map.remove()、座標変更時は旧マップ破棄・再作成
 */

// vi.mockファクトリはファイル先頭にホイスされるため、共通モックは動的importで参照。
const mockState = vi.hoisted(() => ({ api: null }))
vi.mock('maplibre-gl', async () => {
  const mod = await import('../../../test/maplibreMock')
  mockState.api = mod.createMapLibreMock()
  return { default: mockState.api }
})

beforeEach(() => {
  if (mockState.api) mockState.api.resetState()
})

afterEach(() => {
  cleanup()
})

const LNG = 135.5
const LAT = 34.85

describe('MiniLocationMap', () => {
  it('施設座標を中心にMapを作成する（既定zoom=15）', () => {
    render(<MiniLocationMap lng={LNG} lat={LAT} />)
    const map = mockState.api._state.maps[0]
    expect(map).toBeTruthy()
    expect(map._options.center).toEqual([LNG, LAT])
    expect(map._options.zoom).toBe(15)
  })

  it('メインマップと同一のOSMラスタスタイルを使用する', () => {
    render(<MiniLocationMap lng={LNG} lat={LAT} />)
    const map = mockState.api._state.maps[0]
    expect(map._options.style).toBe(OSM_RASTER_STYLE)
  })

  it('施設座標にマーカーを配置する', () => {
    render(<MiniLocationMap lng={LNG} lat={LAT} />)
    const marker = mockState.api._state.markers[0]
    expect(marker).toBeTruthy()
    expect(marker._lngLat).toEqual([LNG, LAT])
  })

  it('compact版AttributionControlを追加する（既定attrib barは無効化）', () => {
    render(<MiniLocationMap lng={LNG} lat={LAT} />)
    const map = mockState.api._state.maps[0]
    expect(map._options.attributionControl).toBe(false)
    const control = mockState.api._state.controls[0]
    expect(control).toBeTruthy()
    expect(control._options.compact).toBe(true)
  })

  it('非インタラクティブなimgとして描画される（シートスクロールとの競合回避）', () => {
    render(<MiniLocationMap lng={LNG} lat={LAT} />)
    const mapEl = screen.getByRole('img')
    expect(mapEl).toBeTruthy()
    expect(mapEl.getAttribute('aria-label')).toContain(String(LAT))
    expect(mapEl.className).toContain('pointer-events-none')
  })

  it('アンマウント時にMapを破棄する', () => {
    const { unmount } = render(<MiniLocationMap lng={LNG} lat={LAT} />)
    const map = mockState.api._state.maps[0]
    expect(map._removed).toBe(false)
    unmount()
    expect(map._removed).toBe(true)
  })

  it('座標が変更されると旧マップを破棄して新座標で再作成する', () => {
    const { rerender } = render(<MiniLocationMap lng={LNG} lat={LAT} />)
    rerender(<MiniLocationMap lng={135.5} lat={34.7} />)
    const maps = mockState.api._state.maps
    expect(maps).toHaveLength(2)
    expect(maps[0]._removed).toBe(true)
    expect(maps[1]._options.center).toEqual([135.5, 34.7])
  })

  it('heightプロパティで高さを指定できる', () => {
    render(<MiniLocationMap lng={LNG} lat={LAT} height={220} />)
    const mapEl = screen.getByRole('img')
    expect(mapEl.style.height).toBe('220px')
  })
})
