/**
 * (#63) CSV行 ↔ OSM検索結果 近似照合ユーティリティの検証
 *
 * - キー列の値を順に試し、最初にマッチした列の結果を採用
 * - マッチ時は「要素タイプ/ID」（node/123）形式で osmid に書き込み
 * - ミスマッチ時は空のまま
 * - osmid 列がヘッダーにない場合は末尾追加
 * - 入力行・ヘッダーを変更しない（イミュータブル）
 * - 集計（matched / unmatched）が正しい
 */
import { describe, it, expect } from 'vitest'
import { matchCsvRowsOsmid, OSMID_COLUMN } from '../csvOsmidMatch'

const results = [
  { type: 'node', id: 123, lat: 34.85, lon: 135.5, tags: { name: 'テスト珈琲店', amenity: 'cafe' } },
  { type: 'node', id: 456, lat: 34.8, lon: 135.6, tags: { name: 'さくら薬局', shop: 'pharmacy' } },
  { type: 'way', id: 789, lat: 34.9, lon: 135.4, tags: { name: '駅前書店', shop: 'book' } },
  { type: 'node', id: 1010, lat: 35.0, lon: 135.7, tags: { name: 'Station Coffee' } },
  { type: 'node', id: 2020, lat: 35.1, lon: 135.8, tags: { name: '12' } },
]

const HEADERS = ['店舗名', '名称_ja', '住所']
const KEYS = ['店舗名', '名称_ja']

describe('matchCsvRowsOsmid', () => {
  it('完全一致で osmid を埋め、osmid 列がヘッダー末尾に追加される', () => {
    const out = matchCsvRowsOsmid(
      HEADERS,
      [{ 店舗名: 'テスト珈琲店', 住所: '大阪市北区' }],
      KEYS,
      results
    )
    expect(out.headers).toEqual(['店舗名', '名称_ja', '住所', 'osmid'])
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0].osmid).toBe('node/123')
    expect(out.matched).toBe(1)
    expect(out.unmatched).toBe(0)
  })

  it('osmid 列がヘッダーに既存の場合は位置を維持し末尾に追加しない', () => {
    const headers = ['店舗名', 'osmid', '住所']
    const out = matchCsvRowsOsmid(
      headers,
      [{ 店舗名: 'さくら薬局', 住所: '大阪市' }],
      ['店舗名'],
      results
    )
    expect(out.headers).toEqual(['店舗名', 'osmid', '住所'])
    expect(out.rows[0].osmid).toBe('node/456')
  })

  it('キー列を指定順に試し、最初にマッチした列の結果を採用する', () => {
    // 1列目が空 → スキップ、2列目がマッチ
    const out = matchCsvRowsOsmid(
      HEADERS,
      [{ 店舗名: '', 名称_ja: 'さくら薬局', 住所: '大阪市' }],
      KEYS,
      results
    )
    expect(out.rows[0].osmid).toBe('node/456')
    expect(out.matched).toBe(1)
  })

  it('1列目でマッチした場合は2列目を試さない（優先順）', () => {
    // 両列とも別の結果にマッチする値を持つ: 1列目の結果が採用される
    const out = matchCsvRowsOsmid(
      HEADERS,
      [{ 店舗名: 'テスト珈琲店', 名称_ja: 'さくら薬局' }],
      KEYS,
      results
    )
    expect(out.rows[0].osmid).toBe('node/123')
  })

  it('どのキー列もマッチしなければ osmid は空のまま', () => {
    const out = matchCsvRowsOsmid(
      HEADERS,
      [{ 店舗名: '駅前行', 名称_ja: '無名商店' }],
      KEYS,
      results
    )
    expect(out.rows[0].osmid).toBe('')
    expect(out.matched).toBe(0)
    expect(out.unmatched).toBe(1)
  })

  it('空・未定義・空白だけのキー列値はスキップして次列を試す', () => {
    const rows = [
      { 店舗名: '   ', 名称_ja: 'さくら薬局' }, // 空白だけ → スキップ
      { 名称_ja: 'さくら薬局' },                  // 1列目キーが存在しない → スキップ
    ]
    const out = matchCsvRowsOsmid(HEADERS, rows, KEYS, results)
    expect(out.rows[0].osmid).toBe('node/456')
    expect(out.rows[1].osmid).toBe('node/456')
    expect(out.matched).toBe(2)
    expect(out.unmatched).toBe(0)
  })

  it('部分一致・類似（編集距離）のマッチでも osmid を埋める', () => {
    const rows = [
      { 店舗名: 'テスト珈琲' },        // 部分一致（部分文字列）
      { 店舗名: 'Stasion Coffee' },    // 類似（編集距離1）
      { 店舗名: 'サクラ薬局' },        // ローマ字変換で一致
    ]
    const out = matchCsvRowsOsmid(HEADERS, rows, ['店舗名'], results)
    expect(out.rows[0].osmid).toBe('node/123')
    expect(out.rows[1].osmid).toBe('node/1010')
    expect(out.rows[2].osmid).toBe('node/456')
    expect(out.matched).toBe(3)
  })

  it('node以外の要素タイプ（way等）も type/id 形式で埋める', () => {
    const out = matchCsvRowsOsmid(
      HEADERS,
      [{ 店舗名: '駅前書店' }],
      ['店舗名'],
      results
    )
    expect(out.rows[0].osmid).toBe('way/789')
  })

  it('全角文字・数値の値も正規化して照合できる', () => {
    const rows = [
      { 店舗名: '１２' }, // 全角数字 → '12'
      { 店舗名: 12 },     // 数値 → String 変換
    ]
    const out = matchCsvRowsOsmid(HEADERS, rows, ['店舗名'], results)
    expect(out.rows[0].osmid).toBe('node/2020')
    expect(out.rows[1].osmid).toBe('node/2020')
  })

  it('元のヘッダー・行データを一切変更しない（イミュータブル）', () => {
    const headers = ['店舗名', '住所']
    const rows = [
      { 店舗名: 'テスト珈琲店', 住所: '大阪市' },
      { 店舗名: '駅前行', 住所: '神戸市' },
    ]
    const before = JSON.stringify({ headers, rows })

    const out = matchCsvRowsOsmid(headers, rows, ['店舗名'], results)

    expect(JSON.stringify({ headers, rows })).toBe(before)
    // 戻り値は新しいオブジェクト
    expect(out.rows[0]).not.toBe(rows[0])
    expect(out.rows[1]).not.toBe(rows[1])
    expect(out.headers).not.toBe(headers)
    // 入力行には osmid キーが追加されていない
    expect('osmid' in rows[0]).toBe(false)
  })

  it('行データが空なら全件数ゼロで返す（osmid列は追加される）', () => {
    const out = matchCsvRowsOsmid(HEADERS, [], KEYS, results)
    expect(out.rows).toEqual([])
    expect(out.matched).toBe(0)
    expect(out.unmatched).toBe(0)
    expect(out.headers).toEqual([...HEADERS, 'osmid'])
  })

  it('検索結果が空なら全行未マッチ（osmid列は末尾追加される）', () => {
    const out = matchCsvRowsOsmid(
      HEADERS,
      [
        { 店舗名: 'テスト珈琲店' },
        { 店舗名: 'さくら薬局' },
      ],
      KEYS,
      []
    )
    expect(out.rows[0].osmid).toBe('')
    expect(out.rows[1].osmid).toBe('')
    expect(out.matched).toBe(0)
    expect(out.unmatched).toBe(2)
    expect(out.headers).toEqual([...HEADERS, 'osmid'])
  })

  it('複数行の集計（matched/unmatched）が正しい', () => {
    const rows = [
      { 店舗名: 'テスト珈琲店' },   // 完全一致
      { 店舗名: '駅前書店' },       // way 完全一致
      { 店舗名: '駅前行' },         // ミスマッチ
      { 店舗名: '' },               // 空 → ミスマッチ
    ]
    const out = matchCsvRowsOsmid(HEADERS, rows, ['店舗名'], results)
    expect(out.matched).toBe(2)
    expect(out.unmatched).toBe(2)
    expect(out.rows.map((r) => r.osmid)).toEqual(['node/123', 'way/789', '', ''])
  })
})

describe('OSMID_COLUMN', () => {
  it('osmid である', () => {
    expect(OSMID_COLUMN).toBe('osmid')
  })
})
