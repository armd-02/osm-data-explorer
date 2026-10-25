/**
 * バッチ照合の回帰テスト（Issue #21）
 * - ソート: typeOrder['exact']=0 が ?? で扱われる
 * - CSV出力: 全行同一列幅、#メタ行なし、osm_idがtype/id形式
 * - 候補なし行も同一列幅
 */
import { describe, it, expect } from 'vitest'
import { batchMatch, matchResultsToCSV, matchName, parseNameList } from '../batchMatch'

// テスト用OSM結果
const mockResults = [
  { type: 'node', id: 101, name: 'ラーメン屋 田中', lat: 35.68, lon: 139.77, tags: { name: 'ラーメン屋 田中', cuisine: 'ramen' } },
  { type: 'node', id: 102, name: '田中ラーメン', lat: 35.69, lon: 139.78, tags: { name: '田中ラーメン', 'name:ja': 'ラーメン屋田中' } },
  { type: 'way', id: 103, name: 'カフェ 山本', lat: 35.70, lon: 139.79, tags: { name: 'カフェ 山本', amenity: 'cafe' } },
  { type: 'node', id: 104, name: '薬局 鈴木', lat: 35.71, lon: 139.80, tags: { name: '薬局 鈴木', amenity: 'pharmacy' } },
  { type: 'node', id: 105, name: 'ドラッグ 鈴木', lat: 35.72, lon: 139.81, tags: { name: 'ドラッグ 鈴木', amenity: 'pharmacy' } }
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

describe('matchName ソート（Issue #21）', () => {
  it('完全一致が常に先頭にソートされる（typeOrder=0）', () => {
    const result = matchName('ラーメン屋 田中', mockResults)
    expect(result.matchType).toBe('exact')
    expect(result.matched.id).toBe(101)
    expect(result.candidates[0].match.type).toBe('exact')
  })

  it('複数候補: 完全一致 > 部分一致', () => {
    const result = matchName('田中', mockResults)
    expect(result.candidates.length).toBeGreaterThanOrEqual(1)
    const types = result.candidates.map(c => c.match.type)
    expect(types.every(t => t === 'partial')).toBe(true)
  })
})

describe('matchResultsToCSV（Issue #21）', () => {
  const makeMatchResult = (index, inputName, matchType, confirmed, matched, candidates) => ({
    index, inputName, matchType, confirmed,
    candidates: candidates || [],
    matched
  })

  it('ヘッダーが最初の行（row, input_name, status, ...）', () => {
    const mr = makeMatchResult(1, 'テスト', 'exact', true,
      { id: 101, type: 'node', name: 'テスト', lat: 35.0, lon: 139.0, url: 'https://www.openstreetmap.org/node/101', matchType: 'exact', matchedTag: 'name', matchedValue: 'テスト' },
      [{ result: mockResults[0], match: { type: 'exact', tag: 'name', value: 'テスト' } }]
    )
    const csv = matchResultsToCSV([mr])
    const lines = csv.replace('\uFEFF', '').split('\n')
    expect(lines[0]).toContain('row')
    expect(lines[0]).toContain('input_name')
    expect(lines[0]).toContain('status')
    expect(lines[0]).toContain('osm_id')
  })

  it('全行が同一列幅（完全一致・候補なしが同一幅）', () => {
    const confirmed = makeMatchResult(1, 'ラーメン屋 田中', 'exact', true,
      { id: 101, type: 'node', name: 'ラーメン屋 田中', lat: 35.68, lon: 139.77, url: 'https://www.openstreetmap.org/node/101', matchType: 'exact', matchedTag: 'name', matchedValue: 'ラーメン屋 田中' },
      [{ result: mockResults[0], match: { type: 'exact', tag: 'name', value: 'ラーメン屋 田中' } }]
    )
    const none = makeMatchResult(2, '存在しない店', 'none', false, null, [])
    const csv = matchResultsToCSV([confirmed, none])
    const lines = csv.replace('\uFEFF', '').split('\n').filter(l => l.trim())
    const headerFields = countFields(lines[0])
    for (let i = 1; i < lines.length; i++) {
      expect(countFields(lines[i]), `行${i+1}の列数が一致しない: ${lines[i]}`).toBe(headerFields)
    }
  })

  it('# メタデータ行を含まない', () => {
    const mr = makeMatchResult(1, 'テスト', 'none', false, null, [])
    const csv = matchResultsToCSV([mr])
    const lines = csv.replace('\uFEFF', '').split('\n').filter(l => l.trim())
    for (const line of lines) {
      expect(line, `行が#で始まる: ${line}`).not.toMatch(/^#/)
    }
  })

  it('confirmed=true → status=確認済み', () => {
    const mr = makeMatchResult(1, 'ラーメン屋 田中', 'exact', true,
      { id: 101, type: 'node', name: 'ラーメン屋 田中', lat: 35.68, lon: 139.77, url: 'https://www.openstreetmap.org/node/101', matchType: 'exact', matchedTag: 'name', matchedValue: 'ラーメン屋 田中' },
      [{ result: mockResults[0], match: { type: 'exact', tag: 'name', value: 'ラーメン屋 田中' } }]
    )
    const csv = matchResultsToCSV([mr])
    expect(csv).toContain('確認済み')
    expect(csv).toContain('完全一致')
  })

  it('confirmed=false → status=要確認', () => {
    const mr = makeMatchResult(1, '田中', 'partial', false,
      { id: 101, type: 'node', name: 'ラーメン屋 田中', lat: 35.68, lon: 139.77, url: 'https://www.openstreetmap.org/node/101', matchType: 'partial', matchedTag: 'name', matchedValue: 'ラーメン屋 田中' },
      [{ result: mockResults[0], match: { type: 'partial', tag: 'name', value: 'ラーメン屋 田中' } }]
    )
    const csv = matchResultsToCSV([mr])
    expect(csv).toContain('要確認')
  })

  it('osm_idがtype/id形式（Issue #24）', () => {
    const mr = makeMatchResult(1, 'カフェ 山本', 'exact', true,
      { id: 103, type: 'way', name: 'カフェ 山本', lat: 35.70, lon: 139.79, url: 'https://www.openstreetmap.org/way/103', matchType: 'exact', matchedTag: 'name', matchedValue: 'カフェ 山本' },
      [{ result: mockResults[2], match: { type: 'exact', tag: 'name', value: 'カフェ 山本' } }]
    )
    const csv = matchResultsToCSV([mr])
    expect(csv).toContain('way/103')
  })

  it('カンマを含む値はクォートで囲まれる', () => {
    const mr = makeMatchResult(1, '田中,ラーメン', 'exact', true,
      { id: 101, type: 'node', name: '田中,ラーメン', lat: 35.68, lon: 139.77, url: 'https://www.openstreetmap.org/node/101', matchType: 'exact', matchedTag: 'name', matchedValue: '田中,ラーメン' },
      [{ result: { ...mockResults[0], name: '田中,ラーメン' }, match: { type: 'exact', tag: 'name', value: '田中,ラーメン' } }]
    )
    const csv = matchResultsToCSV([mr])
    expect(csv).toContain('"田中,ラーメン"')
  })

  it('複数候補: candidates_countが正しい', () => {
    const mr = makeMatchResult(1, '田中', 'partial', false,
      { id: 101, type: 'node', name: 'ラーメン屋 田中', lat: 35.68, lon: 139.77, url: 'https://www.openstreetmap.org/node/101', matchType: 'partial', matchedTag: 'name', matchedValue: 'ラーメン屋 田中' },
      [
        { result: mockResults[0], match: { type: 'partial', tag: 'name', value: 'ラーメン屋 田中' } },
        { result: mockResults[1], match: { type: 'partial', tag: 'name', value: '田中ラーメン' } }
      ]
    )
    const csv = matchResultsToCSV([mr])
    const lines = csv.replace('\uFEFF', '').split('\n').filter(l => l.trim())
    expect(lines[1]).toContain('2')
  })
})

describe('parseNameList（Issue #25: RFC4180対応）', () => {
  it('1行1名称で解析', () => {
    const text = 'ラーメン屋 田中\nカフェ 山本\n薬局 鈴木'
    expect(parseNameList(text)).toEqual(['ラーメン屋 田中', 'カフェ 山本', '薬局 鈴木'])
  })

  it('空行をスキップ', () => {
    const text = 'テストA\n\nテストB\n\n'
    expect(parseNameList(text)).toEqual(['テストA', 'テストB'])
  })

  it('CSV: 最初の列を使用（カンマ区切り）', () => {
    const text = '店舗名,住所,電話番号\nラーメン屋 田中,新宿区,03-1234\nカフェ 山本,渋谷区,03-5678'
    expect(parseNameList(text)).toEqual(['ラーメン屋 田中', 'カフェ 山本'])
  })

  it('CSV: ヘッダー行を自動スキップ', () => {
    const text = 'name,address,phone\nラーメン屋 田中,新宿区,03-1234\nカフェ 山本,渋谷区,03-5678'
    const result = parseNameList(text)
    expect(result).not.toContain('name')
    expect(result).toContain('ラーメン屋 田中')
  })

  it('CSV: クォート内のカンマを保持', () => {
    const text = 'name,addr\n"田中, ラーメン",新宿区\n"カフェ ""山本""",渋谷区'
    const result = parseNameList(text)
    expect(result).toContain('田中, ラーメン')
    expect(result).toContain('カフェ "山本"')
  })

  it('CSV: エスケープされたダブルクォート（""）', () => {
    const text = 'name\n"Cafe ""Mountain"""'
    const result = parseNameList(text)
    expect(result).toEqual(['Cafe "Mountain"'])
  })

  it('TSV: タブ区切りをサポート', () => {
    const text = '店舗名\t住所\t電話番号\nラーメン屋 田中\t新宿区\t03-1234\nカフェ 山本\t渋谷区\t03-5678'
    const result = parseNameList(text)
    expect(result).toEqual(['ラーメン屋 田中', 'カフェ 山本'])
  })

  it('CRLF改行に対応', () => {
    const text = '店舗名,住所\r\nラーメン屋 田中,新宿区\r\nカフェ 山本,渋谷区'
    const result = parseNameList(text)
    expect(result).toEqual(['ラーメン屋 田中', 'カフェ 山本'])
  })

  it('クォート内の改行を保持', () => {
    const text = 'name\n"多行\n名称"'
    const result = parseNameList(text)
    expect(result).toEqual(['多行\n名称'])
  })
})
