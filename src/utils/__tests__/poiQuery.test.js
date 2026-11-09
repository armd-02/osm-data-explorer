import { describe, it, expect } from 'vitest'
import { buildPoiQuery, buildSimpleQuery } from '../overpass'

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

  it('目的のみ指定時: その目的の施設種類unionに絞る（#44 目的スコープ）', () => {
    const { query } = buildPoiQuery(testBbox, '', '', '', '遊ぶ')
    // 遊ぶグループのフィルタが含まれる
    expect(query).toContain('[leisure~"^(park|playground|garden|pitch)$"]')
    expect(query).toContain('[amenity=plaza]')
    expect(query).toContain('[amenity=place_of_worship]')
    // 遊ぶに無関係なカテゴリ・汎用POIブランチは含まれない
    expect(query).not.toContain('[amenity=cafe]')
    expect(query).not.toContain('[shop]')
    expect(query).not.toContain('[office]')
  })

  it('カテゴリ+目的指定時: カテゴリが優先される（目的unionは使わない）', () => {
    const { query } = buildPoiQuery(testBbox, 'cafe', '', '', '遊ぶ')
    expect(query).toContain('[amenity=cafe]')
    expect(query).not.toContain('[amenity=place_of_worship]')
    expect(query).not.toContain('[shop]')
  })

  it('不明な目的名: 汎用POI検索にフォールバックする', () => {
    const { query } = buildPoiQuery(testBbox, '', '', '', '存在しない目的')
    expect(query).toContain('[amenity]')
    expect(query).toContain('[shop]')
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

  // ===== バリアフリー検索（#62） =====

  it('バリアフリーカテゴリ選択時: 空tagsのため汎用POI検索にフォールバックする（クエリ組み込みは後続ピース）', () => {
    const { query } = buildPoiQuery(testBbox, 'barrier_free', '')
    // 空tags → カテゴリフィルタなし → 汎用POI body
    expect(query).toContain('[amenity]')
    expect(query).toContain('[shop]')
    // 歩道・縁石・音声案内フィルタはまだ含まれない
    expect(query).not.toContain('footway')
    expect(query).not.toContain('barrier=kerb')
    expect(query).not.toContain('traffic_signals')
  })

  it('バリアフリーカテゴリ未選択時: 歩道・縁石・音声案内フィルタが混入しない（汎用POI検索）', () => {
    const { query } = buildPoiQuery(testBbox, '', '')
    // バリアフリー特有のフィルタが含まれない
    expect(query).not.toContain('footway')
    expect(query).not.toContain('barrier=kerb')
    expect(query).not.toContain('traffic_signals:sound')
    expect(query).not.toContain('traffic_signals:vibration')
    // 汎用POIタグは含まれる
    expect(query).toContain('[amenity]')
    expect(query).toContain('[shop]')
  })

  it('バリアフリーカテゴリ未選択・目的未選択時も混入しない（cafe選択時）', () => {
    const { query } = buildPoiQuery(testBbox, 'cafe', '')
    expect(query).toContain('[amenity=cafe]')
    expect(query).not.toContain('footway')
    expect(query).not.toContain('barrier=kerb')
    expect(query).not.toContain('traffic_signals')
  })

  it('バリアフリーカテゴリ未選択・目的「バリアフリー」選択時: 空フィルタのため汎用POIにフォールバック', () => {
    const { query } = buildPoiQuery(testBbox, '', '', '', 'バリアフリー')
    // 空tags → purposeUnionFiltersが空 → 汎用POI body
    expect(query).toContain('[amenity]')
    expect(query).toContain('[shop]')
    // 歩道・縁石・音声案内フィルタはまだ含まれない
    expect(query).not.toContain('footway')
    expect(query).not.toContain('barrier=kerb')
    expect(query).not.toContain('traffic_signals')
  })

  it('バリアフリーカテゴリ未選択・目的「暮らす」選択時: バリアフリーフィルタは混入しない', () => {
    const { query } = buildPoiQuery(testBbox, '', '', '', '暮らす')
    // 暮らすにはバリアフリーフィルタが含まれない
    expect(query).not.toContain('footway')
    expect(query).not.toContain('barrier=kerb')
    expect(query).not.toContain('traffic_signals')
    // 暮らすのカテゴリは含まれる
    expect(query).toContain('amenity=pharmacy')
    expect(query).toContain('bank')
  })

  // (#62) 未選択時にバリアフリーが混ざらないことの固定
  it('未選択時: buildPoiQuery に highway・kerb・traffic_signals が含まれない', () => {
    const { query } = buildPoiQuery(testBbox, '', '')
    expect(query).not.toContain('highway')
    expect(query).not.toContain('kerb')
    expect(query).not.toContain('traffic_signals')
  })

  it('未選択時: buildSimpleQuery に highway・kerb・traffic_signals が含まれない', () => {
    const { query } = buildSimpleQuery(testBbox, '', '')
    expect(query).not.toContain('highway')
    expect(query).not.toContain('kerb')
    expect(query).not.toContain('traffic_signals')
  })
})
