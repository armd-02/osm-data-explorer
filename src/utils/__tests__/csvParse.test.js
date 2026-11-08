/**
 * CSVパーズユーティリティ（csvParse.js）の検証
 *
 * - parseCsvText: RFC4180状態機械（クォート内デリミター・改行・""エスケープ・CRLF）
 * - parseCsvToObjects: ヘッダー検出（2列以上でヘッダーとみなす）・タブ区切り対応
 * - extractNamesFromCsv: キー列の値から店名リストを導出（指定順で最初の空でない値）
 */
import { describe, it, expect } from 'vitest'
import { parseCsvText, parseCsvToObjects, extractNamesFromCsv, extractNamesWithRows } from '../csvParse'

describe('parseCsvText', () => {
  it('基本: カンマ区切りを行配列に変換する', () => {
    expect(parseCsvText('a,b\n1,2', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('クォート内のデリミターはセルの一部として保持される', () => {
    expect(parseCsvText('"x,y",z\n1,2', ',')).toEqual([
      ['x,y', 'z'],
      ['1', '2'],
    ])
  })

  it('クォート内の改行は同一フィールドに保持され行が壊れない', () => {
    const rows = parseCsvText('name,addr\n"田中\nラーメン",大阪市\n山本カフェ,神戸市', ',')
    expect(rows).toEqual([
      ['name', 'addr'],
      ['田中\nラーメン', '大阪市'],
      ['山本カフェ', '神戸市'],
    ])
  })

  it('CRLF改行でも1つの行区切りとして扱われる（幻の空行が増えない）', () => {
    const rows = parseCsvText('name,addr\r\n田中ラーメン,大阪市\r\n山本カフェ,神戸市', ',')
    expect(rows).toEqual([
      ['name', 'addr'],
      ['田中ラーメン', '大阪市'],
      ['山本カフェ', '神戸市'],
    ])
  })

  it('二重引用符（""）は " に復元される', () => {
    expect(parseCsvText('name,addr\n"田中""店",大阪市', ',')).toEqual([
      ['name', 'addr'],
      ['田中"店', '大阪市'],
    ])
  })

  it('タブ区切りでパースできる', () => {
    expect(parseCsvText('a\tb\n1\t2', '\t')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('末尾の改行で空行が生じない', () => {
    expect(parseCsvText('a,b\n1,2\n', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('空テキスト・空白のみは空配列を返す', () => {
    expect(parseCsvText('', ',')).toEqual([])
    expect(parseCsvText('   \n  ', ',')).toEqual([])
  })

  it('行末のセルが欠落しても短い行として返る（パディングは parseCsvToObjects 側）', () => {
    expect(parseCsvText('a,b\n1\n', ',')).toEqual([
      ['a', 'b'],
      ['1'],
    ])
  })
})

describe('parseCsvToObjects', () => {
  it('2列以上のCSVは最初の行をヘッダーとして扱う', () => {
    const { headers, rows } = parseCsvToObjects('name,addr\n田中ラーメン,大阪市\n山本カフェ,神戸市')
    expect(headers).toEqual(['name', 'addr'])
    expect(rows).toEqual([
      { name: '田中ラーメン', addr: '大阪市' },
      { name: '山本カフェ', addr: '神戸市' },
    ])
  })

  it('1列のテキストはヘッダーなしとみなし col_1 を使う', () => {
    const { headers, rows } = parseCsvToObjects('田中ラーメン\n山本カフェ\n鈴木薬局')
    expect(headers).toEqual(['col_1'])
    expect(rows).toEqual([
      { col_1: '田中ラーメン' },
      { col_1: '山本カフェ' },
      { col_1: '鈴木薬局' },
    ])
  })

  it('タブ区切り（TSV）を自動検出する', () => {
    const { headers, rows } = parseCsvToObjects('name\taddr\n田中ラーメン\t大阪市')
    expect(headers).toEqual(['name', 'addr'])
    expect(rows).toEqual([{ name: '田中ラーメン', addr: '大阪市' }])
  })

  it('クォート内の改行を含む行も1行として扱われる', () => {
    const { rows } = parseCsvToObjects('name,addr\n"田中\nラーメン",大阪市\n山本カフェ,神戸市')
    expect(rows).toEqual([
      { name: '田中\nラーメン', addr: '大阪市' },
      { name: '山本カフェ', addr: '神戸市' },
    ])
  })

  it('空テキストは空のheaders・rowsを返す', () => {
    expect(parseCsvToObjects('')).toEqual({ headers: [], rows: [] })
    expect(parseCsvToObjects('   ')).toEqual({ headers: [], rows: [] })
  })

  it('行末のセルが欠落している行は、欠落列が空文字で埋められたオブジェクトになる', () => {
    const { rows } = parseCsvToObjects('name,addr\n田中ラーメン\n')
    expect(rows).toEqual([{ name: '田中ラーメン', addr: '' }])
  })
})

describe('extractNamesFromCsv', () => {
  const rows = [
    { name: '田中ラーメン', addr: '大阪市' },
    { name: '', addr: '神戸市' },
    { name: '  ', addr: '' },
    { name: '鈴木薬局', addr: '' },
  ]

  it('1つのキー列: 各行の値（trim後）を順に返す。空行はスキップ', () => {
    expect(extractNamesFromCsv(rows, ['name'])).toEqual(['田中ラーメン', '鈴木薬局'])
  })

  it('複数キー列: 指定順で最初の空でない値を採用する', () => {
    // 2行目は name が空なので addr の値が採用される
    expect(extractNamesFromCsv(rows, ['name', 'addr'])).toEqual(['田中ラーメン', '神戸市', '鈴木薬局'])
  })

  it('列順の優先度は指定順に従う（先に挙げた列が優先）', () => {
    expect(extractNamesFromCsv(rows, ['addr', 'name'])).toEqual(['大阪市', '神戸市', '鈴木薬局'])
  })

  it('キー列指定なし・行データなしは空配列', () => {
    expect(extractNamesFromCsv(rows, [])).toEqual([])
    expect(extractNamesFromCsv([], ['name'])).toEqual([])
  })
})

describe('extractNamesWithRows', () => {
  const rows = [
    { name: '田中ラーメン', addr: '大阪市' },   // row 0
    { name: '', addr: '神戸市' },              // row 1（name空 → addr採用）
    { name: '', addr: '' },                    // row 2（全列空 → スキップ）
    { name: '山本カフェ', addr: '神戸市' },    // row 3
  ]

  it('キー列順で最初の空でない値を店名として、元の行番号と併せて返す', () => {
    expect(extractNamesWithRows(rows, ['name', 'addr'])).toEqual([
      { name: '田中ラーメン', rowIndex: 0 },
      { name: '神戸市', rowIndex: 1 },
      { name: '山本カフェ', rowIndex: 3 },
    ])
  })

  it('行がスキップされてもrowIndexは元の行配列内の位置（ずれない）', () => {
    expect(extractNamesWithRows(rows, ['name', 'addr']).map(d => d.rowIndex)).toEqual([0, 1, 3])
  })

  it('列順の優先度は指定順に従う（先に挙げた列が優先）', () => {
    // row 0 は name・addr とも空でない → addrを先に指定するとaddrが採用される
    expect(extractNamesWithRows(rows, ['addr', 'name'])[0]).toEqual({ name: '大阪市', rowIndex: 0 })
  })

  it('キー列指定なし・行データなしは空配列', () => {
    expect(extractNamesWithRows(rows, [])).toEqual([])
    expect(extractNamesWithRows([], ['name'])).toEqual([])
  })

  it('extractNamesFromCsv は extractNamesWithRows の名前だけの版と一致する', () => {
    expect(extractNamesFromCsv(rows, ['name', 'addr'])).toEqual(
      extractNamesWithRows(rows, ['name', 'addr']).map(d => d.name)
    )
  })
})
