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

// (#62 第5ピース) バリアフリー項目も1行ずつ出力する（専用列の最小追加）
describe('toCSV バリアフリー項目（#62 ピース5）', () => {
  const bfWay = {
    id: 5001, type: 'way', osmId: 'way/5001',
    tags: { highway: 'footway', tactile_paving: 'yes' },
    lat: 34.6705, lon: 135.4805, name: null,
    bf: {
      kind: 'way', tactile: 'yes', lengthM: 120, kerb: null, hasSound: false, hasVibration: false,
      geometry: [[135.48, 34.67], [135.481, 34.6705]]
    }
  }
  const facilityNode = {
    id: 9001, type: 'node',
    tags: { amenity: 'cafe', name: '喫茶店A' },
    lat: 34.68, lon: 135.48, name: '喫茶店A'
  }

  const lines = (csv) => csv.replace('\uFEFF', '').split('\n').filter(l => l.trim())
  // 値にカンマ・クォートが無いテスト用データなので単純splitで安全
  const fields = (line) => line.split(',')

  it('バリアフリー項目は1行ずつ出力され、専用列はlonの直後に追加される', () => {
    const csv = toCSV([bfWay], { fetchedAt: '2026-01-01' })
    const ls = lines(csv)
    const headers = fields(ls[0])
    const lonIdx = headers.indexOf('lon')
    expect(headers.slice(lonIdx + 1, lonIdx + 7)).toEqual(['kind', 'tactile', 'kerb', 'hasSound', 'hasVibration', 'lengthM'])
    const data = fields(ls[1])
    // name(空) type osm_id osm_url lat lon | kind tactile kerb hasSound hasVibration lengthM
    expect(data.slice(0, 6)).toEqual(['', 'way', 'way/5001', 'https://www.openstreetmap.org/way/5001', '34.670500', '135.480500'])
    expect(data.slice(6, 12)).toEqual(['way', 'yes', '', 'no', 'no', '120'])
  })

  it('施設結果のみではヘッダーが従来通り（専用列は追加されない）', () => {
    const csv = toCSV([facilityNode], { fetchedAt: '2026-01-01' })
    const header = lines(csv)[0]
    expect(header).toBe('name,type,osm_id,osm_url,lat,lon,amenity,fetched_at,source')
    expect(header).not.toContain('kind')
    expect(header).not.toContain('tactile')
  })

  it('混在出力: 同一ヘッダーで施設行は専用列が空欄、全行が同一列幅', () => {
    const csv = toCSV([facilityNode, bfWay], { fetchedAt: '2026-01-01' })
    const ls = lines(csv)
    const headerCount = countFields(ls[0])
    expect(headerCount).toBe(15) // 固定6 + 専用6 + タグ1(amenity) + メタ2
    for (const line of ls.slice(1)) {
      expect(countFields(line), `列数不一致: ${line}`).toBe(headerCount)
    }
    const facilityLine = fields(ls[1])
    expect(facilityLine.slice(6, 12)).toEqual(['', '', '', '', '', ''])
    const bfLine = fields(ls[2])
    expect(bfLine.slice(6, 12)).toEqual(['way', 'yes', '', 'no', 'no', '120'])
  })

  it('kerb=true → yes、tactileが未記録（null）→ 空欄', () => {
    const kerbNode = {
      id: 5002, type: 'node', osmId: 'node/5002',
      tags: { barrier: 'kerb' }, lat: 34.672, lon: 135.484, name: null,
      bf: { kind: 'node', tactile: null, lengthM: null, kerb: true, hasSound: true, hasVibration: true, geometry: [135.484, 34.672] }
    }
    const csv = toCSV([kerbNode], { fetchedAt: '2026-01-01' })
    const data = fields(lines(csv)[1])
    expect(data.slice(6, 12)).toEqual(['node', '', 'yes', 'yes', 'yes', ''])
  })

  it('歩道ウェイ＋縁石ノード＋音声案内ノードの混在: 3件とも1行ずつ、専用列の値が正しい', () => {
    const kerbNode = {
      id: 5101, type: 'node', osmId: 'node/5101',
      tags: { barrier: 'kerb' }, lat: 34.675, lon: 135.485, name: null,
      bf: { kind: 'node', tactile: null, lengthM: null, kerb: true, hasSound: false, hasVibration: false, geometry: [135.485, 34.675] }
    }
    const soundNode = {
      id: 5102, type: 'node', osmId: 'node/5102',
      tags: { 'traffic_signals:sound': 'yes', 'traffic_signals:vibration': 'yes' }, lat: 34.676, lon: 135.486, name: null,
      bf: { kind: 'node', tactile: null, lengthM: null, kerb: false, hasSound: true, hasVibration: true, geometry: [135.486, 34.676] }
    }
    const csv = toCSV([bfWay, kerbNode, soundNode], { fetchedAt: '2026-01-01' })
    const ls = lines(csv)
    expect(ls).toHaveLength(4) // ヘッダー + 3行
    const rows = ls.slice(1).map(fields)
    // 歩道ウェイ: kind=way, tactile=yes, kerb=未記録, lengthM=120
    expect(rows[0].slice(6, 12)).toEqual(['way', 'yes', '', 'no', 'no', '120'])
    // 縁石ノード: kerb=yes、音・振動なし
    expect(rows[1].slice(6, 12)).toEqual(['node', '', 'yes', 'no', 'no', ''])
    // 音声案内ノード: 音・振動あり
    expect(rows[2].slice(6, 12)).toEqual(['node', '', 'no', 'yes', 'yes', ''])
    // 全行が同一列幅
    const headerCount = countFields(ls[0])
    for (const line of ls.slice(1)) {
      expect(countFields(line), `列数不一致: ${line}`).toBe(headerCount)
    }
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

// (#62 第5ピース) バリアフリー項目（bf 付き）は線と点の混在で出力する
describe('toGeoJSON バリアフリー項目（#62 ピース5）', () => {
  const bfWay = {
    id: 5001, type: 'way', osmId: 'way/5001',
    tags: { highway: 'footway', tactile_paving: 'yes' },
    lat: 34.6705, lon: 135.4805, name: null,
    bf: {
      kind: 'way', tactile: 'yes', lengthM: 120, kerb: null, hasSound: false, hasVibration: false,
      geometry: [[135.48, 34.67], [135.481, 34.6705], [135.482, 34.671]]
    }
  }
  const bfNode = {
    id: 5002, type: 'node', osmId: 'node/5002',
    tags: { 'traffic_signals:sound': 'yes' },
    lat: 34.672, lon: 135.484, name: null,
    bf: {
      kind: 'node', tactile: null, lengthM: null, kerb: null, hasSound: true, hasVibration: false,
      geometry: [135.484, 34.672]
    }
  }

  it('bf way → bf.geometry を LineString として、bf node → bf.geometry を Point として出力する', () => {
    const geojson = JSON.parse(toGeoJSON([bfWay, bfNode], {}))
    expect(geojson.features[0].geometry).toEqual({
      type: 'LineString',
      coordinates: [[135.48, 34.67], [135.481, 34.6705], [135.482, 34.671]]
    })
    expect(geojson.features[1].geometry).toEqual({ type: 'Point', coordinates: [135.484, 34.672] })
    // bf 項目には geometry_note を付けない（正確な形状を持つ）
    expect(geojson.features[0].properties).not.toHaveProperty('geometry_note')
    expect(geojson.features[1].properties).not.toHaveProperty('geometry_note')
  })

  it('bf 項目の properties は osmId/kind/tactile/kerb/hasSound/hasVibration/lengthM/tags を持つ', () => {
    const geojson = JSON.parse(toGeoJSON([bfWay, bfNode], {}))
    // name は無いのでキー自体が存在しない
    expect(geojson.features[0].properties).toEqual({
      osmId: 'way/5001', kind: 'way', tactile: 'yes', kerb: null,
      hasSound: false, hasVibration: false, lengthM: 120,
      tags: { highway: 'footway', tactile_paving: 'yes' }
    })
    expect(geojson.features[1].properties).toEqual({
      osmId: 'node/5002', kind: 'node', tactile: null, kerb: null,
      hasSound: true, hasVibration: false, lengthM: null,
      tags: { 'traffic_signals:sound': 'yes' }
    })
  })

  it('name がある bf 項目は properties に name を含める', () => {
    const namedWay = { ...bfWay, name: '駅前通り歩道', osmId: 'way/5003' }
    const geojson = JSON.parse(toGeoJSON([namedWay], {}))
    expect(geojson.features[0].properties.name).toBe('駅前通り歩道')
  })

  it('混在出力: 施設結果は従来どおり中心点 Point、バリアフリー項目は正確な形状', () => {
    const cafe = { id: 9001, type: 'node', tags: { amenity: 'cafe', name: '喫茶店A' }, lat: 34.68, lon: 135.48, name: '喫茶店A' }
    const geojson = JSON.parse(toGeoJSON([cafe, bfWay, bfNode], {}))
    expect(geojson.features.map((f) => f.geometry.type)).toEqual(['Point', 'LineString', 'Point'])
    // 施設ノードは lat/lon の中心点表示が従来通り
    expect(geojson.features[0].geometry.coordinates).toEqual([135.48, 34.68])
  })

  it('metadata の中心点注記は bf 非付きの way/relation が含まれる場合のみ付く', () => {
    expect(JSON.parse(toGeoJSON([bfWay, bfNode], {})).metadata.note).toBeNull()
    const facilityWay = { id: 6001, type: 'way', tags: { building: 'yes' }, lat: 34.67, lon: 135.48, name: 'ビルA' }
    expect(JSON.parse(toGeoJSON([facilityWay, bfNode], {})).metadata.note).toContain('center points')
  })

  it('施設検索（bf 無し）の結果では注記は従来どおり常に付与される（出力内容が変わらない）', () => {
    const nodesOnly = [
      { id: 7001, type: 'node', tags: { amenity: 'cafe' }, lat: 34.67, lon: 135.48, name: '喫茶店A' },
      { id: 7002, type: 'node', tags: { amenity: 'bank' }, lat: 34.671, lon: 135.481, name: '銀行B' }
    ]
    // node のみの施設検索でも、従来の注記がそのまま出力される
    expect(JSON.parse(toGeoJSON(nodesOnly, {})).metadata.note).toContain('center points')
  })

  it('bf 項目でも使用可能なジオメトリが無い場合は中心点にフォールバックし明示する', () => {
    const noGeom = { ...bfWay, bf: { ...bfWay.bf, geometry: [] } }
    const geojson = JSON.parse(toGeoJSON([noGeom], {}))
    expect(geojson.features[0].geometry.type).toBe('Point')
    expect(geojson.features[0].properties.geometry_note).toContain('bf geometry unavailable')
  })

  it('混在出力でも施設結果は従来スキーマ（osm_type/osm_id/url）、bf項目は新スキーマ（osmId/kind）', () => {
    const cafe = { id: 9001, type: 'node', tags: { amenity: 'cafe' }, lat: 34.68, lon: 135.48, name: '喫茶店A' }
    const geojson = JSON.parse(toGeoJSON([cafe, bfWay, bfNode], {}))
    expect(geojson.features[0].properties.osm_type).toBe('node')
    expect(geojson.features[0].properties.osm_id).toBe(9001)
    expect(geojson.features[0].properties.url).toContain('openstreetmap.org')
    expect(geojson.features[1].properties.osmId).toBe('way/5001')
    expect(geojson.features[1].properties.kind).toBe('way')
    expect(geojson.features[2].properties.osmId).toBe('node/5002')
    expect(geojson.features[2].properties.kind).toBe('node')
  })

  it('歩道ウェイ＋縁石ノード＋音声案内ノードの混在: LineString/Point 混在かつ properties が各要素の情報を持つ', () => {
    const kerbNode = {
      id: 5101, type: 'node', osmId: 'node/5101',
      tags: { barrier: 'kerb' }, lat: 34.675, lon: 135.485, name: null,
      bf: { kind: 'node', tactile: null, lengthM: null, kerb: true, hasSound: false, hasVibration: false, geometry: [135.485, 34.675] }
    }
    const soundNode = {
      id: 5102, type: 'node', osmId: 'node/5102',
      tags: { 'traffic_signals:sound': 'yes', 'traffic_signals:vibration': 'yes' }, lat: 34.676, lon: 135.486, name: null,
      bf: { kind: 'node', tactile: null, lengthM: null, kerb: false, hasSound: true, hasVibration: true, geometry: [135.486, 34.676] }
    }
    const geojson = JSON.parse(toGeoJSON([bfWay, kerbNode, soundNode], {}))
    // 歩道ウェイ → LineString、縁石・音声案内ノード → Point
    expect(geojson.features.map((f) => f.geometry.type)).toEqual(['LineString', 'Point', 'Point'])
    expect(geojson.features[0].geometry.coordinates).toEqual(bfWay.bf.geometry)
    expect(geojson.features[1].properties).toEqual({
      osmId: 'node/5101', kind: 'node', tactile: null, kerb: true,
      hasSound: false, hasVibration: false, lengthM: null,
      tags: { barrier: 'kerb' }
    })
    expect(geojson.features[2].properties).toEqual({
      osmId: 'node/5102', kind: 'node', tactile: null, kerb: false,
      hasSound: true, hasVibration: true, lengthM: null,
      tags: { 'traffic_signals:sound': 'yes', 'traffic_signals:vibration': 'yes' }
    })
  })

  it('施設結果のみのときは従来通り: 中心点 Point かつ従来 properties スキーマ', () => {
    const facilityWay = { id: 6001, type: 'way', tags: { building: 'yes' }, lat: 34.67, lon: 135.48, name: 'ビルA' }
    const geojson = JSON.parse(toGeoJSON([facilityWay], {}))
    expect(geojson.features[0].geometry.type).toBe('Point')
    expect(geojson.features[0].properties).toEqual({
      osm_type: 'way', osm_id: 6001, name: 'ビルA',
      url: 'https://www.openstreetmap.org/way/6001',
      tags: { building: 'yes' }, match_type: null,
      geometry_note: 'center point only (full geometry not fetched)'
    })
  })
})
