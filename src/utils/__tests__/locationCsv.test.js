import { describe, it, expect } from 'vitest'
import { matchResultsToLocationCSV, originalCsvWithMatchToCSV } from '../locationCsv'

const matched = {
  type: 'way', id: 123456789, name: '喫茶さくら',
  lat: 34.73612349, lon: 135.52345671,
  url: 'https://www.openstreetmap.org/way/123456789'
}

const row = (index, inputName, confirmed, data = matched, matchType = 'exact') => ({
  index, inputName, confirmed, matched: data, matchType,
  candidates: data ? [{ result: data, match: { type: matchType } }] : []
})

describe('地図作成用の座標付きCSV #42', () => {
  it('確定したwayの座標、OSM型・ID・URLと出典を出力する', () => {
    const csv = matchResultsToLocationCSV([row(1, 'さくら', true)])
    expect(csv.startsWith('\uFEFFname,lat,lon,status,matched_name,osm_type,osm_id,osm_url,source\n')).toBe(true)
    expect(csv).toContain('さくら,34.736123,135.523457,確認済み,喫茶さくら,way,way/123456789,https://www.openstreetmap.org/way/123456789')
    expect(csv).toContain('OpenStreetMap contributors (ODbL)')
  })

  it('未確認候補には座標やOSM IDを出さず、候補なしも元の行順で保持する', () => {
    const csv = matchResultsToLocationCSV([
      row(1, '確定店', true),
      row(2, '曖昧な店', false),
      row(3, '未発見店', false, null, 'none')
    ])
    const lines = csv.replace('\uFEFF', '').trimEnd().split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[1]).toMatch(/^確定店,34\.736123,135\.523457,確認済み,/)
    expect(lines[2]).toBe('曖昧な店,,,要確認,,,,,')
    expect(lines[3]).toBe('未発見店,,,候補なし,,,,,')
  })

  it('座標がない確定候補を座標なしとして空欄にする（0,0は有効）', () => {
    const csv = matchResultsToLocationCSV([
      row(1, '位置不明', true, { ...matched, lat: null, lon: null }),
      row(2, '赤道付近', true, { ...matched, type: 'node', id: 9, lat: 0, lon: 0 })
    ])
    const lines = csv.replace('\uFEFF', '').trimEnd().split('\n')
    expect(lines[1]).toContain('位置不明,,,座標なし,喫茶さくら,way,way/123456789')
    expect(lines[2]).toContain('赤道付近,0.000000,0.000000,確認済み,喫茶さくら,node,node/9')
  })

  it('異常座標・NaNは出力しない', () => {
    const csv = matchResultsToLocationCSV([
      row(1, '外れ値', true, { ...matched, lat: 91 }),
      row(2, 'NaN', true, { ...matched, lon: NaN })
    ])
    const lines = csv.replace('\uFEFF', '').trimEnd().split('\n')
    expect(lines[1]).toContain('外れ値,,,座標なし,')
    expect(lines[2]).toContain('NaN,,,座標なし,')
  })

  it('CSVのカンマ・引用符・改行をエスケープし、数式注入を防ぐ', () => {
    const csv = matchResultsToLocationCSV([
      row(1, '喫茶 "A,B"', true, { ...matched, name: '喫茶 "A,B"' }),
      row(2, '=HYPERLINK("evil")', false)
    ])
    expect(csv).toContain('"喫茶 ""A,B"""')
    expect(csv).toContain("'=HYPERLINK") // 先頭の'で数式を無効化
  })

  it('空配列でもヘッダーのみを出力する', () => {
    const csv = matchResultsToLocationCSV([])
    expect(csv.replace('\uFEFF', '').trim()).toBe('name,lat,lon,status,matched_name,osm_type,osm_id,osm_url,source')
  })
})

describe('取込元のCSVに座標・osmidを付加して出力（originalCsvWithMatchToCSV）', () => {
  const CSV_DATA = {
    fileName: 'shops.csv',
    headers: ['name', 'addr'],
    rows: [
      { name: '田中ラーメン', addr: '大阪市' },   // row 0
      { name: '', addr: '神戸市' },              // row 1
      { name: '', addr: '' },                    // row 2（全列空 → 導出されない）
      { name: '山本カフェ', addr: '神戸市' },    // row 3
    ]
  }
  const NODE_MATCHED = {
    type: 'node', id: 777, name: '神戸市',
    lat: 34.6969, lon: 135.1957,
    url: 'https://www.openstreetmap.org/node/777'
  }
  const lines = (csv) => csv.replace('\uFEFF', '').trimEnd().split('\n')

  it('元のCSVの全列・列順・行順をそのまま保ち、lat/lon/osmid列を追加する', () => {
    // matchResults は元のCSVの行順に揃ったもの（2行目は導出されない → 'empty'）
    const csv = originalCsvWithMatchToCSV(CSV_DATA, [
      row(1, '田中ラーメン', false),
      row(2, '神戸市', false, NODE_MATCHED),
      row(3, '', false, null, 'empty'),
      row(4, '山本カフェ', false)
    ])
    expect(lines(csv)).toEqual([
      'name,addr,lat,lon,osmid',
      '田中ラーメン,大阪市,,,',
      ',神戸市,,,',
      ',,,,',
      '山本カフェ,神戸市,,,'
    ])
  })

  it('確定した施設は対応する元の行に座標（6桁小数）とosmid（type/id）を書く', () => {
    const csv = originalCsvWithMatchToCSV(CSV_DATA, [
      row(1, '田中ラーメン', false),
      row(2, '神戸市', true, NODE_MATCHED),
      row(3, '', false, null, 'empty'),
      row(4, '山本カフェ', false)
    ])
    const l = lines(csv)
    expect(l[2]).toBe(',神戸市,34.696900,135.195700,node/777')
    // 未確認・導出されない行は空欄のまま
    expect(l[1]).toBe('田中ラーメン,大阪市,,,' )
    expect(l[3]).toBe(',,,,')
    expect(l[4]).toBe('山本カフェ,神戸市,,,' )
  })

  it('確定済みでもIDが不正な場合はosmidだけ空欄にする（座標は出力）', () => {
    const csv = originalCsvWithMatchToCSV(
      { ...CSV_DATA, rows: [{ name: '田中ラーメン', addr: '大阪市' }] },
      [row(1, '田中ラーメン', true, { ...NODE_MATCHED, id: 'abc' })]
    )
    expect(lines(csv)[1]).toBe('田中ラーメン,大阪市,34.696900,135.195700,')
  })

  it('way/relationの確定施設は代表座標とtype/id形式のosmidを出力する', () => {
    const wayMatched = { ...NODE_MATCHED, type: 'way', id: 202, name: '山本カフェ' }
    const csv = originalCsvWithMatchToCSV(
      { ...CSV_DATA, rows: [{ name: '山本カフェ', addr: '神戸市' }] },
      [row(1, '山本カフェ', true, wayMatched, 'partial')]
    )
    expect(lines(csv)[1]).toBe('山本カフェ,神戸市,34.696900,135.195700,way/202')
  })

  it('カンマ・クォートを含む元の値はCSVエスケープされる', () => {
    const csv = originalCsvWithMatchToCSV(
      { ...CSV_DATA, rows: [{ name: '喫茶 "A,B"', addr: '中北区,大阪市' }] },
      [row(1, '喫茶 "A,B"', false)]
    )
    expect(lines(csv)[1]).toBe('"喫茶 ""A,B""","中北区,大阪市",,,')
  })

  it('UTF-8 BOM付きで、末尾に改行を付ける', () => {
    const csv = originalCsvWithMatchToCSV(CSV_DATA, [row(1, '田中ラーメン', false)])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv.endsWith('\n')).toBe(true)
  })

  it('matchResultsが行数より短い場合もエラーにならない（結果のない行は元データのまま）', () => {
    const csv = originalCsvWithMatchToCSV(CSV_DATA, [
      row(1, '田中ラーメン', true, NODE_MATCHED)
    ])
    const l = lines(csv)
    expect(l[1]).toBe('田中ラーメン,大阪市,34.696900,135.195700,node/777')
    // 結果のない行は元データのまま（lat/lon/osmidは空欄）
    expect(l.length).toBe(5)
    expect(l[2]).toBe(',神戸市,,,' )
  })

  it('csvDataがnull・matchResultsが空でもヘッダーと行を出力する', () => {
    // csvDataがない場合は元の列が存在せず、追加列のみ
    expect(originalCsvWithMatchToCSV(null, [])).toBe('\uFEFF' + 'lat,lon,osmid\n')
    const csv = originalCsvWithMatchToCSV(CSV_DATA, [])
    expect(lines(csv)).toEqual(['name,addr,lat,lon,osmid', '田中ラーメン,大阪市,,,' , ',神戸市,,,' , ',,,,' , '山本カフェ,神戸市,,,'])
  })
})

describe('originalCsvWithMatchToCSV: 既存列への書き込み（上書き）', () => {
  const NODE = {
    type: 'node', id: 777, name: '神戸市',
    lat: 34.6969, lon: 135.1957,
    url: 'https://www.openstreetmap.org/node/777'
  }
  const lines = (csv) => csv.replace('\uFEFF', '').trimEnd().split('\n')

  it('lat/lon列が既存（空プレースホルダー）ならその位置に上書きし、osmidのみ末尾追加', () => {
    const csvData = {
      fileName: 'x.csv',
      headers: ['name', 'addr', 'lat', 'lon'],
      rows: [
        { name: '田中ラーメン', addr: '大阪市', lat: '', lon: '' },
        { name: '神戸店', addr: '神戸市', lat: '', lon: '' },
      ]
    }
    const csv = originalCsvWithMatchToCSV(csvData, [
      row(1, '田中ラーメン', false),
      row(2, '神戸店', true, NODE)
    ])
    expect(lines(csv)).toEqual([
      'name,addr,lat,lon,osmid',
      '田中ラーメン,大阪市,,,' ,
      '神戸店,神戸市,34.696900,135.195700,node/777'
    ])
  })

  it('latitude/longitude別名も認識し、ヘッダーは元の列名を保持する', () => {
    const csvData = {
      headers: ['name', 'latitude', 'longitude'],
      rows: [{ name: '神戸店', latitude: '', longitude: '' }]
    }
    const csv = originalCsvWithMatchToCSV(csvData, [row(1, '神戸店', true, NODE)])
    expect(lines(csv)).toEqual([
      'name,latitude,longitude,osmid',
      '神戸店,34.696900,135.195700,node/777'
    ])
  })

  it('日本語列名（緯度/経度）も認識する', () => {
    const csvData = {
      headers: ['店名', '緯度', '経度'],
      rows: [{ 店名: '神戸店', 緯度: '', 経度: '' }]
    }
    const csv = originalCsvWithMatchToCSV(csvData, [row(1, '神戸店', true, NODE)])
    expect(lines(csv)).toEqual([
      '店名,緯度,経度,osmid',
      '神戸店,34.696900,135.195700,node/777'
    ])
  })

  it('osmid列が既存ならそこに書き込み、未確認行のosmidは空欄で上書きする', () => {
    const csvData = {
      headers: ['name', 'addr', 'osmid'],
      rows: [
        { name: '神戸店', addr: '神戸市', osmid: '' },
        { name: '旧データ', addr: '旧', osmid: 'node/42' },   // 未確認 → 元値は空欄に
      ]
    }
    const csv = originalCsvWithMatchToCSV(csvData, [
      row(1, '神戸店', true, NODE),
      row(2, '旧データ', false)
    ])
    expect(lines(csv)).toEqual([
      'name,addr,osmid,lat,lon',
      '神戸店,神戸市,node/777,34.696900,135.195700',
      '旧データ,旧,,,'
    ])
  })

  it('座標列が片方だけ既存なら、既存はその場で書き込み・不足分のみ末尾追加', () => {
    const csvData = {
      headers: ['name', 'lat'],
      rows: [{ name: '神戸店', lat: '' }]
    }
    const csv = originalCsvWithMatchToCSV(csvData, [row(1, '神戸店', true, NODE)])
    expect(lines(csv)).toEqual([
      'name,lat,lon,osmid',
      '神戸店,34.696900,135.195700,node/777'
    ])
  })

  it('確定行は既存の古い座標を上書きし、未確認行の座標は空欄で上書きする', () => {
    const csvData = {
      headers: ['name', 'lat', 'lon'],
      rows: [
        { name: '神戸店', lat: '99.999999', lon: '88.888888' },  // 古い値 → 確定で上書き
        { name: '未確認店', lat: '12.5', lon: '13.5' },          // 未確認 → 空欄に
      ]
    }
    const csv = originalCsvWithMatchToCSV(csvData, [
      row(1, '神戸店', true, NODE),
      row(2, '未確認店', false)
    ])
    const l = lines(csv)
    expect(l[1]).toBe('神戸店,34.696900,135.195700,node/777')
    expect(l[2]).toBe('未確認店,,,' )
  })

  it('lng/longitude/osm_id別名とヘッダーの大文字小文字の違いも認識する', () => {
    const csvData = {
      fileName: 'x.csv',
      headers: ['name', 'LAT', 'longitude', 'osm_id'],
      rows: [
        { name: '神戸店', LAT: '', longitude: '', osm_id: '' },
        { name: '未確認店', LAT: '', longitude: '', osm_id: '' },
      ]
    }
    const csv = originalCsvWithMatchToCSV(csvData, [
      row(1, '神戸店', true, NODE),
      row(2, '未確認店', false)
    ])
    // 全フィールドが既存列として認識 → 追加列なし、ヘッダーは元の列名を保持
    expect(lines(csv)).toEqual([
      'name,LAT,longitude,osm_id',
      '神戸店,34.696900,135.195700,node/777',
      '未確認店,,,'
    ])
  })

  it('導出されない行（キー列全空）も、既存の座標・osmid列は空欄で出力する', () => {
    const csvData = {
      headers: ['name', 'lat', 'lon', 'osmid'],
      rows: [
        { name: '神戸店', lat: '', lon: '', osmid: '' },
        { name: '', lat: '12.5', lon: '13.5', osmid: 'way/55' },  // 導出されない行
      ]
    }
    const csv = originalCsvWithMatchToCSV(csvData, [row(1, '神戸店', true, NODE)])
    const l = lines(csv)
    expect(l[1]).toBe('神戸店,34.696900,135.195700,node/777')
    expect(l[2]).toBe(',,,')    // 4セル全空欄 → 既存列すべて空欄に上書き
  })
})
