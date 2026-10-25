/**
 * CSVエクスポートの回帰テスト（Issue #20）
 * - 全フィールドにエスケープが適用される
 * - ヘッダーが最初の行
 * - メタデータは規則的なデータ列（#行を混入させない）
 * - 全行が同一列幅
 * - クォート判定が注入ガードより先行
 */
import { describe, it, expect } from 'vitest'
import { toCSV, toGeoJSON } from '../export'

const mockResults = [
  { type: 'node', id: 1, name: 'テストカフェ', lat: 35.68, lon: 139.77, tags: { name: 'テストカフェ', cuisine: 'coffee', phone: '+81-3-1234-5678' } },
  { type: 'way', id: 2, name: 'カフェ, 山本', lat: 35.69, lon: 139.78, tags: { name: 'カフェ, 山本', website: 'https://example.com' } },
  { type: 'node', id: 3, name: '=SUM(A1:A10)', lat: 35.70, lon: 139.79, tags: { name: '=SUM(A1:A10)' } }
]

/** CSV行のフィールド数を数える（簡易パース） */
function countFields(line) {
  let count = 1
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === ',' && !inQuotes) count++
  }
  return count
}

describe('toCSV（Issue #20）', () => {
  it('ヘッダーが最初の行に出力される', () => {
    const csv = toCSV(mockResults, { fetchedAt: '2026-01-01' })
    const lines = csv.replace('\uFEFF', '').split('\n')
    expect(lines[0]).toContain('name')
    expect(lines[0]).toContain('type')
    expect(lines[0]).toContain('osm_id')
    expect(lines[1]).toContain('テストカフェ')
  })

  it('# メタデータ行を含まない（簡易CSV互換）', () => {
    const csv = toCSV(mockResults, { fetchedAt: '2026-01-01' })
    const lines = csv.replace('\uFEFF', '').split('\n').filter(l => l.trim())
    for (const line of lines) {
      expect(line, `行が#で始まる: ${line}`).not.toMatch(/^#/)
    }
  })

  it('全行が同一列幅（ヘッダーとデータ行のフィールド数が一致）', () => {
    const csv = toCSV(mockResults, { fetchedAt: '2026-01-01' })
    const lines = csv.replace('\uFEFF', '').split('\n').filter(l => l.trim())
    const headerFields = countFields(lines[0])
    for (let i = 1; i < lines.length; i++) {
      expect(countFields(lines[i]), `行${i+1}の列数が一致しない`).toBe(headerFields)
    }
  })

  it('メタデータがデータ列として出力される（fetched_at, source）', () => {
    const csv = toCSV(mockResults, { fetchedAt: '2026-01-01' })
    const lines = csv.replace('\uFEFF', '').split('\n').filter(l => l.trim())
    expect(lines[0]).toContain('fetched_at')
    expect(lines[0]).toContain('source')
    // データ行に取得日時が含まれる
    expect(lines[1]).toContain('2026-01-01')
  })

  it('カンマを含む値はクォートで囲まれる', () => {
    const csv = toCSV(mockResults, {})
    expect(csv).toContain('"カフェ, 山本"')
  })

  it('= で始まる値は \' 前置き（数式注入対策）', () => {
    const csv = toCSV(mockResults, {})
    expect(csv).toContain("'=SUM(A1:A10)")
  })

  it('クォートと注入が両方適用される場合: \' がクォート内部', () => {
    const results = [
      { type: 'node', id: 99, name: '=A1,B2', lat: 35.0, lon: 139.0, tags: {} }
    ]
    const csv = toCSV(results, {})
    expect(csv).toContain("\"'=A1,B2\"")
  })

  it('lat/lon がnullの場合: 空文字列を出力', () => {
    const results = [
      { type: 'way', id: 1, name: 'テスト', lat: null, lon: null, tags: {} }
    ]
    const csv = toCSV(results, {})
    const lines = csv.replace('\uFEFF', '').split('\n')
    const dataLine = lines.find(l => l.includes('テスト'))
    expect(dataLine).not.toContain('null')
  })

  it('osm_idがtype/id形式で出力される（Issue #24）', () => {
    const csv = toCSV(mockResults, { fetchedAt: '2026-01-01' })
    expect(csv).toContain('node/1')
    expect(csv).toContain('way/2')
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
