// @vitest-environment jsdom
/**
 * (#62) バリアフリー検索の凡例（BarrierFreeLegend）コンポーネントテスト
 *
 * 凡例は地図上のオーバーレイではなく、地図本体の「下」の通常フローで描画する。
 * - 表示条件: resultKind === 'barrier_free' かつ結果が1件以上。コンポーネント内で
 *   AppContext から判定し、条件を満たさない場合は null（非表示）。
 * - 線（歩道）3種・点（ノード役割）3種のラベルと色を列挙する。
 * - 色は bf-line / bf-node レイヤと同一の共有定数（barrierFreeGeoJSON.js）を使う。
 * - 配置は absolute 位置指定を持たない（地図上のオーバーレイにならない）。
 *
 * 地図本体の下に描画される位置関係のテストは
 * barrierFreeLegendPlacement.test.jsx を参照。
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import BarrierFreeLegend from '../BarrierFreeLegend'
import { AppContext } from '../../context/AppContext'
import { TACTILE_LINE_COLORS, NODE_ROLE_COLORS } from '../../utils/barrierFreeGeoJSON'

// 表示条件テスト用のバリアフリー結果（barrierFreeMapView.test.jsx と同一形状）
const BF_RESULT = {
  id: 1, type: 'way',
  tags: { highway: 'footway', tactile_paving: 'yes' },
  lat: 34.6705, lon: 135.4805, name: null, osmId: 'way/1',
  bf: { kind: 'way', tactile: 'yes', lengthM: 120, kerb: null, hasSound: false, hasVibration: false,
    geometry: [[135.48, 34.67], [135.481, 34.6705], [135.482, 34.671]] }
}

const POI_RESULT = {
  type: 'node', id: 9001, lat: 34.68, lon: 135.48, name: '喫茶店',
  tags: { name: '喫茶店', amenity: 'cafe' }
}

function renderLegend(state = {}) {
  const fullState = {
    results: [], resultKind: null, ...state
  }
  const view = render(
    <AppContext.Provider value={{ state: fullState, dispatch: vi.fn() }}>
      <BarrierFreeLegend />
    </AppContext.Provider>
  )
  return { view, state: fullState }
}

// 16進カラーを jsdom の style.backgroundColor が返す rgb 文字列に変換
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

beforeEach(() => {})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('表示条件（AppContextで判定）', () => {
  it('バリアフリー結果が1件以上ある場合、凡例を表示する', () => {
    const { view } = renderLegend({ results: [BF_RESULT], resultKind: 'barrier_free' })
    expect(view.queryByText('凡例')).toBeTruthy()
  })

  it('POI検索の結果では凡例を表示しない', () => {
    const { view } = renderLegend({ results: [POI_RESULT], resultKind: 'poi' })
    expect(view.queryByText('凡例')).toBeNull()
  })

  it('バリアフリー検索でも結果が0件なら凡例を表示しない', () => {
    const { view } = renderLegend({ results: [], resultKind: 'barrier_free' })
    expect(view.queryByText('凡例')).toBeNull()
  })

  it('結果が0件から1件以上になると凡例が表示される', () => {
    const { view, state } = renderLegend({ results: [], resultKind: 'barrier_free' })
    expect(view.queryByText('凡例')).toBeNull()

    act(() => {
      view.rerender(
        <AppContext.Provider value={{ state: { ...state, results: [BF_RESULT] }, dispatch: vi.fn() }}>
          <BarrierFreeLegend />
        </AppContext.Provider>
      )
    })
    expect(view.queryByText('凡例')).toBeTruthy()
  })

  it('resultKindが未設定（null）でも凡例を表示しない', () => {
    const { view } = renderLegend({ results: [BF_RESULT], resultKind: null })
    expect(view.queryByText('凡例')).toBeNull()
  })
})

describe('内容（ラベルと色）', () => {
  const renderBf = () => renderLegend({ results: [BF_RESULT], resultKind: 'barrier_free' })

  it('線（歩道）3項目と点（ノード）3項目のラベルを表示する', () => {
    const { view } = renderBf()
    const labels = [...view.container.querySelectorAll('li')].map((li) => li.textContent)
    expect(labels).toEqual([
      '歩道・点字ブロックあり',
      '歩道・点字ブロックなし',
      '歩道・点字ブロック未記録',
      '音声・振動案内信号',
      '縁石',
      '縁石＋案内信号'
    ])
  })

  it('線項目のスウォッチ色が TACTILE_LINE_COLORS と一致する', () => {
    const { view } = renderBf()
    const items = [...view.container.querySelectorAll('li')].slice(0, 3)
    const expected = [TACTILE_LINE_COLORS.yes, TACTILE_LINE_COLORS.no, TACTILE_LINE_COLORS.unknown]
    items.forEach((li, i) => {
      const swatch = li.querySelector('span[aria-hidden="true"]')
      expect(swatch.style.backgroundColor).toBe(hexToRgb(expected[i]))
    })
  })

  it('点項目のスウォッチ色が NODE_ROLE_COLORS と一致する', () => {
    const { view } = renderBf()
    const items = [...view.container.querySelectorAll('li')].slice(3, 6)
    const expected = [NODE_ROLE_COLORS.signal, NODE_ROLE_COLORS.kerb, NODE_ROLE_COLORS['kerb+signal']]
    items.forEach((li, i) => {
      const swatch = li.querySelector('span[aria-hidden="true"]')
      expect(swatch.style.backgroundColor).toBe(hexToRgb(expected[i]))
    })
  })
})

describe('配置（地図上のオーバーレイにならない）', () => {
  it('ルート要素に absolute 位置指定を持たない（通常フロー描画）', () => {
    const { view } = renderLegend({ results: [BF_RESULT], resultKind: 'barrier_free' })
    const root = view.container.firstChild
    expect(root).toBeTruthy()
    expect(root.className).not.toContain('absolute')
    expect(root.className).not.toContain('z-[')
  })
})
