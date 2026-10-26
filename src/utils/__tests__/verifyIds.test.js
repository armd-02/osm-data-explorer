/**
 * (#26) verifyIds.js ユニットテスト
 */
import { describe, it, expect } from 'vitest'
import {
  parsePreviousYearCSV,
  verifyPreviousIds,
  getStatusLabel,
  verificationToCSV
} from '../verifyIds'

describe('parsePreviousYearCSV', () => {
  it('基本的なCSVを解析できる', () => {
    const csv = 'input_name,osm_type,osm_id\nテスト店,node,12345\nカフェABC,way,67890'
    const result = parsePreviousYearCSV(csv)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ name: 'テスト店', osmType: 'node', osmId: '12345', lat: null, lon: null })
    expect(result[1]).toEqual({ name: 'カフェABC', osmType: 'way', osmId: '67890', lat: null, lon: null })
  })

  it('座標カラムがある場合も読み込む', () => {
    const csv = 'name,osm_type,osm_id,lat,lon\nテスト店,node,123,35.0,135.5'
    const result = parsePreviousYearCSV(csv)
    expect(result[0].lat).toBe(35.0)
    expect(result[0].lon).toBe(135.5)
  })

  it('空CSVは空配列を返す', () => {
    expect(parsePreviousYearCSV('')).toEqual([])
    expect(parsePreviousYearCSV('input_name,osm_type,osm_id')).toEqual([])
  })

  it('必要なカラムがない場合空配列を返す', () => {
    const csv = 'name,phone\nテスト店,090-1234-5678'
    expect(parsePreviousYearCSV(csv)).toEqual([])
  })

  it('クォート付きCSVを解析できる', () => {
    const csv = 'input_name,osm_type,osm_id\n"テスト,店",node,123'
    const result = parsePreviousYearCSV(csv)
    expect(result[0].name).toBe('テスト,店')
  })

  it('無効なOSM型をスキップする', () => {
    const csv = 'input_name,osm_type,osm_id\n有効,node,1\n無効,invalid,2'
    const result = parsePreviousYearCSV(csv)
    expect(result).toHaveLength(1)
    expect(result[0].osmId).toBe('1')
  })
})

describe('verifyPreviousIds', () => {
  const prevEntries = [
    { name: 'テスト店', osmType: 'node', osmId: '100', lat: null, lon: null },
    { name: '旧名称', osmType: 'way', osmId: '200', lat: null, lon: null },
    { name: '位置ずれ店', osmType: 'node', osmId: '300', lat: 35.0, lon: 135.0 },
    { name: 'BBOX外店', osmType: 'node', osmId: '999', lat: null, lon: null }
  ]

  const currentResults = [
    { type: 'node', id: 100, name: 'テスト店', lat: 35.0, lon: 135.0, tags: { amenity: 'cafe' } },
    { type: 'way', id: 200, name: '新名称', lat: 35.0, lon: 135.0, tags: { shop: 'bakery' } },
    { type: 'node', id: 300, name: '位置ずれ店', lat: 35.01, lon: 135.02, tags: {} }
  ]

  it('名称・位置が同じ場合は unchanged', () => {
    const result = verifyPreviousIds(prevEntries, currentResults)
    expect(result[0].status).toBe('unchanged')
    expect(result[0].matchedName).toBe('テスト店')
  })

  it('名称が異なる場合は name_changed', () => {
    const result = verifyPreviousIds(prevEntries, currentResults)
    expect(result[1].status).toBe('name_changed')
    expect(result[1].matchedName).toBe('新名称')
    expect(result[1].nameDiff).toBe(true)
  })

  it('位置が大きくずれている場合は location_diff', () => {
    const result = verifyPreviousIds(prevEntries, currentResults)
    // 35.0,135.0 vs 35.01,135.02 → 約1.5km
    expect(result[2].status).toBe('location_diff')
    expect(result[2].locationDiffKm).toBeGreaterThan(0.5)
  })

  it('検索結果にないIDは not_in_bbox', () => {
    const result = verifyPreviousIds(prevEntries, currentResults)
    expect(result[3].status).toBe('not_in_bbox')
    expect(result[3].matchedName).toBeNull()
  })

  it('検索結果が空の場合は全て not_in_bbox', () => {
    const result = verifyPreviousIds(prevEntries, [])
    expect(result.every(r => r.status === 'not_in_bbox')).toBe(true)
  })

  it('型が違うIDは混同しない（node/100 ≠ way/100）', () => {
    const prev = [{ name: 'テスト', osmType: 'way', osmId: '100', lat: null, lon: null }]
    const results = [{ type: 'node', id: 100, name: 'テスト', lat: 35, lon: 135, tags: {} }]
    const result = verifyPreviousIds(prev, results)
    expect(result[0].status).toBe('not_in_bbox')
  })
})

describe('getStatusLabel', () => {
  it('日本語ラベルを返す', () => {
    expect(getStatusLabel('unchanged')).toBe('変更なし')
    expect(getStatusLabel('name_changed')).toBe('名称変更候補')
    expect(getStatusLabel('location_diff')).toBe('位置違い')
    expect(getStatusLabel('not_in_bbox')).toBe('BBOX外・未取得')
    expect(getStatusLabel('id_not_found')).toBe('ID不存在')
  })
})

describe('verificationToCSV', () => {
  it('正しいCSV形式を出力する', () => {
    const results = [
      { name: 'テスト店', osmType: 'node', osmId: '100', status: 'unchanged',
        matchedName: 'テスト店', matchedLat: 35.0, matchedLon: 135.0,
        nameDiff: false, locationDiffKm: null, matchedTags: {} }
    ]
    const csv = verificationToCSV(results, { fetchedAt: '2026-01-01T00:00:00Z' })
    expect(csv).toContain('\uFEFF') // BOM
    expect(csv).toContain('input_name,osm_type,osm_id,status')
    expect(csv).toContain('テスト店,node,100,unchanged,変更なし')
    expect(csv).toContain('needs_confirmation')
    expect(csv).toContain('yes') // 再確認が必要
  })
})
