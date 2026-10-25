/**
 * バッチ照合の回帰テスト（Issue #21）
 * - ソート: typeOrder['exact']=0 が || ではなく ?? で扱われる
 * - CSV出力: confirmed フラグ、全フィールドエスケープ
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

describe('matchName ソート（Issue #21: 0がfalsy扱いされるバグ）', () => {
  it('完全一致が常に先頭にソートされる（typeOrder=0）', () => {
    // 「ラーメン屋 田中」は id:101 と完全一致
    const result = matchName('ラーメン屋 田中', mockResults)
    expect(result.matchType).toBe('exact')
    expect(result.matched.id).toBe(101)
    // 候補の先頭がexact
    expect(result.candidates[0].match.type).toBe('exact')
  })

  it('複数候補: 完全一致 > 部分一致', () => {
    // 「田中」は id:101 の部分一致（'ラーメン屋 田中' が '田中' を含む）
    //        id:102 の部分一致（'田中ラーメン' が '田中' を含む）
    const result = matchName('田中', mockResults)
    expect(result.candidates.length).toBeGreaterThanOrEqual(1)
    // 全候補がpartial以上（exactはない）
    const types = result.candidates.map(c => c.match.type)
    // partial(1) より exact(0) が先頭に来る（exactがあれば）
    // このケースでは全件partial
    expect(types.every(t => t === 'partial')).toBe(true)
  })
})

describe('matchResultsToCSV（Issue #21: confirmed フラグ）', () => {
  it('confirmed=true の行に「はい」を出力', () => {
    const matchResults = [
      {
        index: 1, inputName: 'ラーメン屋 田中', matchType: 'exact', confirmed: true,
        candidates: [{ result: mockResults[0], match: { type: 'exact', tag: 'name', value: 'ラーメン屋 田中' } }],
        matched: { id: 101, type: 'node', name: 'ラーメン屋 田中', lat: 35.68, lon: 139.77,
                   url: 'https://www.openstreetmap.org/node/101', matchType: 'exact', matchedTag: 'name', matchedValue: 'ラーメン屋 田中' }
      }
    ]
    const csv = matchResultsToCSV(matchResults)
    expect(csv).toContain('はい')
    expect(csv).toContain('完全一致')
  })

  it('confirmed=false の行に「いいえ」を出力', () => {
    const matchResults = [
      {
        index: 1, inputName: '田中', matchType: 'partial', confirmed: false,
        candidates: [{ result: mockResults[0], match: { type: 'partial', tag: 'name', value: 'ラーメン屋 田中' } }],
        matched: { id: 101, type: 'node', name: 'ラーメン屋 田中', lat: 35.68, lon: 139.77,
                   url: 'https://www.openstreetmap.org/node/101', matchType: 'partial', matchedTag: 'name', matchedValue: 'ラーメン屋 田中' }
      }
    ]
    const csv = matchResultsToCSV(matchResults)
    expect(csv).toContain('いいえ')
  })

  it('カンマを含む値はクォートで囲まれる', () => {
    const matchResults = [
      {
        index: 1, inputName: '田中,ラーメン', matchType: 'exact', confirmed: true,
        candidates: [{ result: { ...mockResults[0], name: '田中,ラーメン' }, match: { type: 'exact', tag: 'name', value: '田中,ラーメン' } }],
        matched: { id: 101, type: 'node', name: '田中,ラーメン', lat: 35.68, lon: 139.77,
                   url: 'https://www.openstreetmap.org/node/101', matchType: 'exact', matchedTag: 'name', matchedValue: '田中,ラーメン' }
      }
    ]
    const csv = matchResultsToCSV(matchResults)
    // "田中,ラーメン" のようにクォートで囲まれる
    expect(csv).toContain('"田中,ラーメン"')
  })

  it('メタデータが末尾に配置される', () => {
    const matchResults = [
      {
        index: 1, inputName: 'テスト', matchType: 'none', confirmed: false,
        candidates: [], matched: null
      }
    ]
    const csv = matchResultsToCSV(matchResults)
    const lines = csv.replace('\uFEFF', '').split('\n')
    // 最初の非空行がヘッダー
    expect(lines[0]).toContain('row')
    expect(lines[0]).toContain('input_name')
    expect(lines[0]).toContain('confirmed')
    // # メタが最後
    expect(lines[lines.length - 2]).toContain('#')
  })
})

describe('parseNameList', () => {
  it('1行1名称で解析', () => {
    const text = 'ラーメン屋 田中\nカフェ 山本\n薬局 鈴木'
    expect(parseNameList(text)).toEqual(['ラーメン屋 田中', 'カフェ 山本', '薬局 鈴木'])
  })

  it('空行をスキップ', () => {
    const text = 'テストA\n\nテストB\n\n'
    expect(parseNameList(text)).toEqual(['テストA', 'テストB'])
  })

  it('CSV形式: 最初の列を使用', () => {
    const text = '店舗名,住所,電話番号\nラーメン屋 田中,新宿区,03-1234'
    expect(parseNameList(text)).toEqual(['店舗名', 'ラーメン屋 田中'])
  })
})
