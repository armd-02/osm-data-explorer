import { describe, it, expect } from 'vitest'
import { buildPoiQuery } from '../overpass'

const testBbox = { south: 34.700000, west: 135.480000, north: 34.710000, east: 135.490000 }

describe('#44 buildPoiQuery', () => {
  it('カテゴリ指定時: カテゴリフィルタを含むクエリを生成する', () => {
    const { query } = buildPoiQuery(testBbox, 'cafe', '')
    expect(query).toContain('[amenity=cafe]')
    expect(query).toContain('node')
    expect(query).toContain('way')
  })

  it('カテゴリ未指定時: POI対象タグに限定する', () => {
    const { query } = buildPoiQuery(testBbox, '', '')
    // POI対象タグが含まれる
    expect(query).toContain('[amenity]')
    expect(query).toContain('[shop]')
    expect(query).toContain('[tourism]')
    expect(query).toContain('[leisure]')
    expect(query).toContain('[office]')
    // 道路・建物は含まれない
    expect(query).not.toContain('[highway]')
    expect(query).not.toContain('[building]')
  })

  it('キーワードが返される', () => {
    const { keyword } = buildPoiQuery(testBbox, 'cafe', '星巴克')
    expect(keyword).toBe('星巴克')
  })

  it('BBOX値が6桁小数でエンコードされる', () => {
    const { query } = buildPoiQuery(testBbox, '', '')
    expect(query).toContain('34.700000,135.480000,34.710000,135.490000')
  })

  it('飲食店カテゴリ: 複数値のunionを生成する', () => {
    const { query } = buildPoiQuery(testBbox, 'food_drink', '')
    expect(query).toContain('cafe')
    expect(query).toContain('restaurant')
    expect(query).toContain('fast_food')
  })
})
