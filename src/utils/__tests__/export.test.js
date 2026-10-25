/**
 * CSVエクスポートの回帰テスト（Issue #20）
 * - 全フィールドにエスケープが適用される
 * - ヘッダーが最初の行
 * - メタデータが末尾
 * - クォート判定が注入ガードより先行
 */
import { describe, it, expect } from 'vitest'
import { toCSV, toGeoJSON } from '../export'

const mockResults = [
  { type: 'node', id: 1, name: 'テストカフェ', lat: 35.68, lon: 139.77, tags: { name: 'テストカフェ', cuisine: 'coffee', phone: '+81-3-1234-5678' } },
  { type: 'way', id: 2, name: 'カフェ, 山本', lat: 35.69, lon: 139.78, tags: { name: 'カフェ, 山本', website: 'https://example.com' } },
  { type: 'node', id: 3, name: '=SUM(A1:A10)', lat: 35.70, lon: 139.79, tags: { name: '=SUM(A1:A10)' } }
]

describe('toCSV（Issue #20）', () => {
  it('ヘッダーが最初の行に出力される', () => {
    const csv = toCSV(mockResults, { fetchedAt: '2026-01-01' })
    const lines = csv.replace('\uFEFF', '').split('\n')
    // 最初の行がヘッダー
    expect(lines[0]).toContain('name')
    expect(lines[0]).toContain('type')
    expect(lines[0]).toContain('osm_id')
    // 2番目の行がデータ
    expect(lines[1]).toContain('テストカフェ')
  })

  it('メタデータが末尾に配置される', () => {
    const csv = toCSV(mockResults, { fetchedAt: '2026-01-01' })
    const lines = csv.replace('\uFEFF', '').split('\n')
    // # メタが最後の数行
    expect(lines[lines.length - 3]).toContain('#')
    expect(lines[lines.length - 2]).toContain('#')
  })

  it('カンマを含む値はクォートで囲まれる', () => {
    const csv = toCSV(mockResults, {})
    // "カフェ, 山本" はクォートで囲まれる
    expect(csv).toContain('"カフェ, 山本"')
  })

  it('= で始まる値は \' 前置き（数式注入対策）', () => {
    const csv = toCSV(mockResults, {})
    // 'SUM(A1:A10) のように ' が前置きされる
    expect(csv).toContain("'=SUM(A1:A10)")
  })

  it('クォートと注入が両方適用される場合: \' がクォート内部', () => {
    const results = [
      { type: 'node', id: 99, name: '=A1,B2', lat: 35.0, lon: 139.0, tags: {} }
    ]
    const csv = toCSV(results, {})
    // カンマを含むのでクォートで囲まれ、かつ = で始まるので ' が内部に入る
    // 結果: "'=A1,B2"
    expect(csv).toContain("\"'=A1,B2\"")
  })

  it('lat/lon がnullの場合: 空文字列を出力', () => {
    const results = [
      { type: 'way', id: 1, name: 'テスト', lat: null, lon: null, tags: {} }
    ]
    const csv = toCSV(results, {})
    const lines = csv.replace('\uFEFF', '').split('\n')
    // データ行に null が含まれない（空文字列）
    const dataLine = lines.find(l => l.includes('テスト'))
    expect(dataLine).not.toContain('null')
  })

  it('UTF-8 BOM付きで出力される', () => {
    const csv = toCSV(mockResults, {})
    expect(csv.charCodeAt(0)).toBe(0xFEFF)
  })
})

describe('toGeoJSON（Issue #20）', () => {
  it('way/relationのgeometry_noteが含まれる', () => {
    const geojson = JSON.parse(toGeoJSON(mockResults, {}))
    const wayFeature = geojson.features.find(f => f.properties.osm_type === 'way')
    expect(wayFeature.properties.geometry_note).toContain('center point only')
    
    const nodeFeature = geojson.features.find(f => f.properties.osm_type === 'node')
    expect(nodeFeature.properties.geometry_note).toBeNull()
  })

  it('全フィーチャにURLとタグが含まれる', () => {
    const geojson = JSON.parse(toGeoJSON(mockResults, {}))
    for (const feature of geojson.features) {
      expect(feature.properties.url).toContain('openstreetmap.org')
      expect(feature.properties.tags).toBeDefined()
    }
  })

  it('metadataが正しい', () => {
    const geojson = JSON.parse(toGeoJSON(mockResults, { fetchedAt: '2026-01-01' }))
    expect(geojson.metadata.source).toContain('OpenStreetMap')
    expect(geojson.metadata.license).toBe('ODbL')
    expect(geojson.metadata.count).toBe(3)
  })
})
