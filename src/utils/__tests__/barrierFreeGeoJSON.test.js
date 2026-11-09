/**
 * (#62) バリアフリー検索 — 第4ピース: 地図描画用GeoJSON変換のテスト
 *
 * - way: bf.geometry（[[lon, lat], ...]）を LineString として使う
 * - node: bf.geometry（[lon, lat]）を Point として使う
 * - 描画に使えるジオメトリが無い要素は除外
 * - properties: key / kind / name / tactile(way) / role(node)
 */
import { describe, it, expect } from 'vitest'
import {
  barrierFreeToMapGeoJSON,
  roleOf,
  TACTILE_LINE_COLORS,
  NODE_ROLE_COLORS
} from '../barrierFreeGeoJSON'

// toStandardResults（barrierFreeResults.js）の出力形状を模した標準結果
const wayResult = (id, tags, tactile, geometry) => ({
  id,
  type: 'way',
  tags,
  lat: 34.67,
  lon: 135.48,
  name: tags.name || null,
  osmId: `way/${id}`,
  bf: { kind: 'way', tactile, lengthM: 100, kerb: null, hasSound: false, hasVibration: false, geometry }
})

const nodeResult = (id, tags, { kerb = null, hasSound = false, hasVibration = false, tactile = null, geometry = [135.48, 34.67] } = {}) => ({
  id,
  type: 'node',
  tags,
  lat: geometry[1],
  lon: geometry[0],
  name: tags.name || null,
  osmId: `node/${id}`,
  bf: { kind: 'node', tactile, lengthM: null, kerb, hasSound, hasVibration, geometry }
})

describe('barrierFreeToMapGeoJSON', () => {
  it('way は bf.geometry を LineString として変換する（近似中心点は使わない）', () => {
    const geom = [[135.48, 34.67], [135.481, 34.671], [135.482, 34.672]]
    const fc = barrierFreeToMapGeoJSON([wayResult(1, { highway: 'footway', tactile_paving: 'yes' }, 'yes', geom)])
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.features).toHaveLength(1)
    const f = fc.features[0]
    expect(f.geometry).toEqual({ type: 'LineString', coordinates: geom })
    expect(f.properties).toEqual({ key: 'way/1', kind: 'way', name: null, tactile: 'yes' })
  })

  it('way の tactile が未記録（null）でも properties.tactile は null になる', () => {
    const fc = barrierFreeToMapGeoJSON([wayResult(2, { highway: 'path' }, null, [[135.48, 34.67], [135.481, 34.67]])])
    expect(fc.features[0].properties.tactile).toBeNull()
    expect(fc.features[0].properties.kind).toBe('way')
  })

  it('way の name タグが properties.name に入る', () => {
    const fc = barrierFreeToMapGeoJSON([wayResult(3, { highway: 'footway', name: 'テスト歩道' }, 'no', [[135.48, 34.67], [135.481, 34.67]])])
    expect(fc.features[0].properties.name).toBe('テスト歩道')
  })

  it('頂点が2点未満の way は除外される（LineString として描画できない）', () => {
    const fc = barrierFreeToMapGeoJSON([
      wayResult(1, { highway: 'footway' }, 'yes', [[135.48, 34.67]]),
      wayResult(2, { highway: 'footway' }, 'yes', [])
    ])
    expect(fc.features).toHaveLength(0)
  })

  it('node は bf.geometry を Point として変換する', () => {
    const fc = barrierFreeToMapGeoJSON([nodeResult(1, { 'traffic_signals:sound': 'yes' }, { hasSound: true, geometry: [135.5, 34.7] })])
    expect(fc.features).toHaveLength(1)
    const f = fc.features[0]
    expect(f.geometry).toEqual({ type: 'Point', coordinates: [135.5, 34.7] })
    expect(f.properties).toEqual({ key: 'node/1', kind: 'node', name: null, role: 'signal' })
  })

  it('座標が無い node は除外される', () => {
    const fc = barrierFreeToMapGeoJSON([nodeResult(1, { barrier: 'kerb' }, { kerb: 'cut', geometry: [] })])
    expect(fc.features).toHaveLength(0)
  })

  it('way と node が混在しても両方変換される', () => {
    const fc = barrierFreeToMapGeoJSON([
      wayResult(1, { highway: 'footway' }, 'yes', [[135.48, 34.67], [135.481, 34.671]]),
      nodeResult(2, { 'traffic_signals:vibration': 'yes' }, { hasVibration: true })
    ])
    expect(fc.features.map((f) => f.geometry.type)).toEqual(['LineString', 'Point'])
    expect(fc.features.map((f) => f.properties.key)).toEqual(['way/1', 'node/2'])
  })

  it('空配列・非配列入力は空の FeatureCollection を返す', () => {
    expect(barrierFreeToMapGeoJSON([])).toEqual({ type: 'FeatureCollection', features: [] })
    expect(barrierFreeToMapGeoJSON(undefined)).toEqual({ type: 'FeatureCollection', features: [] })
  })

  it('bf フィールドが無い要素は除外される（標準結果形状でなければ描画しない）', () => {
    const fc = barrierFreeToMapGeoJSON([{ id: 9, type: 'node', tags: { amenity: 'cafe' }, lat: 34.67, lon: 135.48, name: null }])
    expect(fc.features).toHaveLength(0)
  })

  it('施設結果のみ（bf 無し）のときは専用ソース用GeoJSONが空になる', () => {
    const pois = [
      { id: 100, type: 'node', tags: { amenity: 'cafe', name: '喫茶店A' }, lat: 34.67, lon: 135.48, name: '喫茶店A' },
      { id: 101, type: 'node', tags: { shop: 'supermarket' }, lat: 34.671, lon: 135.481, name: null },
      { id: 102, type: 'way', tags: { building: 'yes' }, lat: 34.672, lon: 135.482, name: 'ビルB' }
    ]
    // 施設検索の結果を誤って専用ソースに渡しても Feature は1件も生まれない
    expect(barrierFreeToMapGeoJSON(pois)).toEqual({ type: 'FeatureCollection', features: [] })
  })

  it('線・点の仕分けは bf.kind に基づく（r.type ではなく）', () => {
    // bf.kind = 'way' の項目は 3点ジオメトリで LineString になる
    const fc = barrierFreeToMapGeoJSON([wayResult(1, { highway: 'footway' }, 'yes', [[135.48, 34.67], [135.481, 34.67], [135.482, 34.67]])])
    expect(fc.features[0].geometry.type).toBe('LineString')
    expect(fc.features[0].properties.kind).toBe('way')
    expect(fc.features[0].properties.tactile).toBe('yes')

    // bf.kind = 'node' の項目は Point になる
    const fc2 = barrierFreeToMapGeoJSON([nodeResult(2, { barrier: 'kerb' }, { kerb: 'low' })])
    expect(fc2.features[0].geometry.type).toBe('Point')
    expect(fc2.features[0].properties.kind).toBe('node')
  })

  it('tactile の値は yes / no / null の3値のみ（その他・undefined は null）', () => {
    const geom = [[135.48, 34.67], [135.481, 34.67]]
    const tactileOf = (t) => barrierFreeToMapGeoJSON([wayResult(1, { highway: 'footway' }, t, geom)]).features[0].properties.tactile
    expect(tactileOf('yes')).toBe('yes')
    expect(tactileOf('no')).toBe('no')
    expect(tactileOf(null)).toBeNull()
    expect(tactileOf(undefined)).toBeNull()
    expect(tactileOf('maybe')).toBeNull()
  })
})

describe('roleOf（ノードの役割）', () => {
  it('hasSound または hasVibration のみなら signal', () => {
    expect(roleOf(nodeResult(1, { 'traffic_signals:sound': 'yes' }, { hasSound: true, hasVibration: true }))).toBe('signal')
    expect(roleOf(nodeResult(1, { 'traffic_signals:vibration': 'yes' }, { hasVibration: true }))).toBe('signal')
  })

  it('barrier=kerb か kerb タグのみなら kerb', () => {
    expect(roleOf(nodeResult(1, { barrier: 'kerb' }, {}))).toBe('kerb')
    expect(roleOf(nodeResult(1, { kerb: 'low' }, { kerb: 'low' }))).toBe('kerb')
  })

  it('kerb と signal の両方あるものは kerb+signal', () => {
    // 音声案内ノードに kerb タグもある（同一ノードの重複排除で両方になるケース）
    expect(roleOf(nodeResult(1, { barrier: 'kerb', 'traffic_signals:sound': 'yes' }, { kerb: 'cut', hasSound: true, hasVibration: true }))).toBe('kerb+signal')
    expect(roleOf(nodeResult(1, { kerb: 'low', 'traffic_signals:vibration': 'yes' }, { kerb: 'low', hasVibration: true }))).toBe('kerb+signal')
  })

  it('どちらもなければ other', () => {
    expect(roleOf(nodeResult(1, { traffic_signals: 'yes' }, {}))).toBe('other')
    expect(roleOf(null)).toBe('other')
  })
})

describe('色定数（凡例・レイヤ定義の共有）', () => {
  it('TACTILE_LINE_COLORS は yes/no/unknown の16進カラーを持つ', () => {
    expect(Object.keys(TACTILE_LINE_COLORS).sort()).toEqual(['no', 'unknown', 'yes'])
    for (const v of Object.values(TACTILE_LINE_COLORS)) expect(v).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('NODE_ROLE_COLORS は signal/kerb/kerb+signal/other の16進カラーを持つ', () => {
    expect(Object.keys(NODE_ROLE_COLORS).sort()).toEqual(['kerb', 'kerb+signal', 'other', 'signal'])
    for (const v of Object.values(NODE_ROLE_COLORS)) expect(v).toMatch(/^#[0-9a-f]{6}$/i)
  })
})
