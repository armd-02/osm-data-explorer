/**
 * MapViewのレイヤ定義がMapLibreスタイル仕様に準拠しているかを、
 * 実際のMapLibreバリデータ（addLayerが使うvalidateStyleMin）で検証する回帰テスト。
 *
 * 背景（本番エラー）:
 *   Error: layers.cluster-count.layout.textAnchor: unknown property "textAnchor"
 * 原因: MapLibreのプロパティ名はkebab-caseであり、レイヤのトップレベルに置いた
 *       camelCaseプロパティ（circleRadius, textField等）はMapLibreが無言で無視する。
 *       テスト用のmaplibreMockはバリデーションをしないため、この種の誤りを検出できなかった。
 *       本テストはモックを介さず本物のバリデータで検証するため、再発を防ぐ。
 */
import { describe, it, expect } from 'vitest'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import {
  POINT_LAYER_DEF,
  CLUSTERS_LAYER_DEF,
  CLUSTER_COUNT_LAYER_DEF
} from '../MapView'

/** レイヤ定義を最小スタイルに載せて検証するためのヘルパー */
const makeStyle = (layers) => ({
  version: 8,
  glyphs: 'https://tile.openstreetmap.jp/fonts/{fontstack}/{range}.pbf',
  sources: {
    results: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
  },
  layers
})

const ALL = [POINT_LAYER_DEF, CLUSTERS_LAYER_DEF, CLUSTER_COUNT_LAYER_DEF]

describe('MapViewレイヤ定義（MapLibreスタイル仕様準拠）', () => {
  it('3レイヤすべてが実際のMapLibreバリデータでエラー0（addLayerが受理される）', () => {
    const errors = validateStyleMin(makeStyle(ALL))
    expect(errors).toEqual([])
  })

  it('各レイヤ単独でもエラー0', () => {
    for (const def of ALL) {
      const errors = validateStyleMin(makeStyle([def]))
      expect({ id: def.id, errors }).toEqual({ id: def.id, errors: [] })
    }
  })

  it('cluster-count: textプロパティはMapLibre仕様に従いlayoutへ、text-colorはpaintへ', () => {
    // MapLibreでは text-field/text-font/text-size/text-anchor はlayoutプロパティ
    expect(CLUSTER_COUNT_LAYER_DEF.layout).toMatchObject({
      'text-field': ['get', 'point_count'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 12,
      'text-anchor': 'center'
    })
    // text-colorのみがpaintプロパティ
    expect(CLUSTER_COUNT_LAYER_DEF.paint).toEqual({ 'text-color': '#ffffff' })
    // 報告されたエラーの原因（camelCaseのtextAnchor）が残っていない
    expect(CLUSTER_COUNT_LAYER_DEF.layout.textAnchor).toBeUndefined()
  })

  it('circleレイヤ: paintプロパティはkebab-caseでpaintオブジェクト内にnesting', () => {
    expect(POINT_LAYER_DEF.paint).toEqual({
      'circle-radius': 6,
      'circle-color': '#2563eb',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff'
    })
    expect(CLUSTERS_LAYER_DEF.paint['circle-color']).toBe('#f59e0b')
    expect(CLUSTERS_LAYER_DEF.paint['circle-radius']).toEqual(
      ['step', ['get', 'point_count'], 12, 4, 16, 16, 20, 24, 32]
    )
  })

  it('どのレイヤ定義にもトップレベルのcamelCaseプロパティがない（無言で無視される誤り）', () => {
    for (const def of ALL) {
      const camelKeys = Object.keys(def).filter((k) => /^[a-z]+[A-Z]/.test(k))
      expect({ id: def.id, camelKeys }).toEqual({ id: def.id, camelKeys: [] })
    }
  })

  it('レイヤID・type・source・filterは変更されていない（意図した設計の維持）', () => {
    expect(POINT_LAYER_DEF).toMatchObject({
      id: 'point-circle', type: 'circle', source: 'results',
      filter: ['!', ['has', 'point_count']]
    })
    expect(CLUSTERS_LAYER_DEF).toMatchObject({
      id: 'clusters', type: 'circle', source: 'results',
      filter: ['has', 'point_count']
    })
    expect(CLUSTER_COUNT_LAYER_DEF).toMatchObject({
      id: 'cluster-count', type: 'symbol', source: 'results',
      filter: ['has', 'point_count']
    })
  })
})
