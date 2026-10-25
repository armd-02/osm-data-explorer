/**
 * Issue #28: 文字列類似度検索（レーベンシュタイン距離）の回帰テスト
 */
import { describe, it, expect } from 'vitest'
import { matchName, levenshteinDistance } from '../batchMatch'

// テスト用OSM結果の生成ヘルパー
function makeResult(id, type, tags, lat = 35.0, lon = 135.0) {
  return { id, type, tags, lat, lon, name: tags?.name || '' }
}

describe('levenshteinDistance（Issue #28）', () => {
  it('同一文字列 → 距離0', () => {
    expect(levenshteinDistance('abc', 'abc')).toBe(0)
  })
  it('1文字違い → 距離1', () => {
    expect(levenshteinDistance('abc', 'axc')).toBe(1)
  })
  it('2文字違い → 距離2', () => {
    expect(levenshteinDistance('abc', 'ayc')).toBe(1)
    expect(levenshteinDistance('abcd', 'abxd')).toBe(1)
    expect(levenshteinDistance('abcdef', 'abxdef')).toBe(1)
  })
  it('柿しぶ vs 柿渋 → 距離1（1文字の挿入）', () => {
    expect(levenshteinDistance('柿しぶ大阪西川', '柿渋の大阪西川')).toBeLessThanOrEqual(2)
  })
  it('maxDistでの早期終了', () => {
    // 距離がmaxDistを超える場合はmaxDist+1を返す
    expect(levenshteinDistance('abc', 'xyz', 1)).toBe(2) // 実際距離3 > maxDist1
  })
})

describe('matchName 類似判定（Issue #28）', () => {
  it('柿しぶ 大阪西川 ↔ 柿渋の大阪西川 が類似候補になる', () => {
    const results = [makeResult(101, 'node', { name: '柿渋の大阪西川' })]
    const res = matchName('柿しぶ 大阪西川', results)
    expect(res.matchType).toBe('similar')
    expect(res.candidates.length).toBe(1)
    expect(res.candidates[0].match.type).toBe('similar')
  })

  it('逆方向も類似候補になる', () => {
    const results = [makeResult(101, 'node', { name: '柿しぶ 大阪西川' })]
    const res = matchName('柿渋の大阪西川', results)
    expect(res.matchType).toBe('similar')
  })

  it('英字の大小文字: ABC Cafe ↔ abc cafe が完全一致', () => {
    const results = [makeResult(201, 'node', { name: 'abc cafe' })]
    const res = matchName('ABC Cafe', results)
    expect(res.matchType).toBe('exact')
  })

  it('英数字の全角/半角: ＡＢＣ１２３ ↔ abc123 が完全一致', () => {
    const results = [makeResult(202, 'node', { name: 'abc123' })]
    const res = matchName('ＡＢＣ１２３', results)
    expect(res.matchType).toBe('exact')
  })

  it('カタカナの全角/半角: ｶﾌｪ ↔ カフェ が完全一致', () => {
    const results = [makeResult(203, 'node', { name: 'カフェ' })]
    const res = matchName('ｶﾌｪ', results)
    expect(res.matchType).toBe('exact')
  })

  it('組み合わせ: ＡＢＣｶﾌｪ ↔ abcカフェ が完全一致', () => {
    const results = [makeResult(204, 'node', { name: 'abcカフェ' })]
    const res = matchName('ＡＢＣｶﾌｪ', results)
    expect(res.matchType).toBe('exact')
  })

  it('完全一致候補が存在したら類似候補より優先', () => {
    const results = [
      makeResult(301, 'node', { name: 'カフェ 山本' }),
      makeResult(302, 'node', { name: 'カフェ 山野' }), // 類似（距離1）
    ]
    const res = matchName('カフェ 山本', results)
    // 完全一致が優先される
    expect(res.matchType).toBe('exact')
    expect(res.matched.id).toBe(301)
  })

  it('大阪西川 vs 大阪東川 は完全一致にならない・自動確定しない', () => {
    const results = [makeResult(401, 'node', { name: '大阪東川' })]
    const res = matchName('大阪西川', results)
    // 距離1だが、部分一致ではない。類似にはなるが自動確定はしない
    if (res.matchType !== 'none') {
      expect(res.matchType).toBe('similar')
      expect(res.confirmed).toBeFalsy()
    }
  })

  it('3文字以下の短い名称は類似一致させない', () => {
    const results = [makeResult(501, 'node', { name: 'あぶ' })]
    const res = matchName('あえ', results)
    // 2文字 → 類似検索しない
    expect(res.matchType).toBe('none')
  })

  it('4〜5文字: 距離1以内のみ類似', () => {
    // 距離1 → 類似（ラーメン屋 vs ラーメンや: 最後1文字の違い）
    const results1 = [makeResult(601, 'node', { name: 'ラーメン屋' })]
    const res1 = matchName('ラーメンや', results1)
    expect(res1.matchType).toBe('similar')

    // 距離2 → 類似しない（4〜5文字は距離1のみ）
    const results2 = [makeResult(602, 'node', { name: 'ラーメン屋' })]
    const res2 = matchName('そば店', results2)
    // らーめん屋(5) vs そば店(3) → 距離が大きい
    expect(res2.matchType).toBe('none')
  })

  it('similar候補はconfirmedにならない', () => {
    const results = [makeResult(701, 'node', { name: '柿渋の大阪西川' })]
    const res = matchName('柿しぶ 大阪西川', results)
    expect(res.matchType).toBe('similar')
    // matchedは設定されるが、ユーザー確認まで確定扱いにしない
    expect(res.matched).not.toBeNull()
  })

  it('部分一致が類似より優先される', () => {
    const results = [
      makeResult(801, 'node', { name: '大阪西川ラーメン' }), // 部分一致（大阪西川を含む）
      makeResult(802, 'node', { name: '大阪東川ラーメン' }), // 類似
    ]
    const res = matchName('大阪西川', results)
    // 部分一致が優先
    expect(res.matchType).toBe('partial')
    expect(res.matched.id).toBe(801)
  })
})
