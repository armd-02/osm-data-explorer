import { describe, it, expect } from 'vitest'
import { matchResultsToLocationCSV } from '../locationCsv'

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
    expect(csv).toContain(''"'') // quoting is applied to formula-like cell
  })

  it('空配列でもヘッダーのみを出力する', () => {
    const csv = matchResultsToLocationCSV([])
    expect(csv.replace('\uFEFF', '').trim()).toBe('name,lat,lon,status,matched_name,osm_type,osm_id,osm_url,source')
  })
})
