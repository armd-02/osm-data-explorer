import { describe, it, expect } from 'vitest'
import { parseAccessibility, wheelchairBadge, toneOf, pickLocalized } from '../accessibility'

/**
 * (#61) バリアフリータグ解釈のテスト
 * wheelchair（yes/no/limited/designated/生値）+ 補足説明の地域言語優先 +
 * トイレ・駐車・エレベーター・点字ブロック・ヒアリングループ・ベビーカー
 */

describe('toneOf', () => {
  it.each([
    ['yes', 'yes'], ['full', 'yes'],
    ['no', 'no'], ['none', 'no'],
    ['limited', 'limited'], ['partial', 'limited'],
    ['designated', 'designated'],
    ['weird-value', 'unknown']
  ])('%s → %s', (value, expected) => {
    expect(toneOf(value)).toBe(expected)
  })
})

describe('pickLocalized', () => {
  it(':ja が最優先', () => {
    expect(pickLocalized({ 'wheelchair:description': '3 rooms', 'wheelchair:description:ja': '車椅子対応3室' }, 'wheelchair:description'))
      .toBe('車椅子対応3室')
  })
  it(':ja がなければ本体キー', () => {
    expect(pickLocalized({ 'wheelchair:description': '3 rooms' }, 'wheelchair:description'))
      .toBe('3 rooms')
  })
  it('本体がなければ :en', () => {
    expect(pickLocalized({ 'wheelchair:description:en': '3 rooms' }, 'wheelchair:description'))
      .toBe('3 rooms')
  })
  it('何もなければ空文字', () => {
    expect(pickLocalized({}, 'wheelchair:description')).toBe('')
    expect(pickLocalized(null, 'wheelchair:description')).toBe('')
  })
})

describe('parseAccessibility', () => {
  it('タグがなければ空配列', () => {
    expect(parseAccessibility(null)).toEqual([])
    expect(parseAccessibility({})).toEqual([])
  })

  it('wheelchair=yes → 車椅子対応（greenトーン）', () => {
    const items = parseAccessibility({ wheelchair: 'yes' })
    expect(items).toHaveLength(1)
    const wc = items[0]
    expect(wc.key).toBe('wheelchair')
    expect(wc.label).toBe('車椅子')
    expect(wc.status).toBe('車椅子対応')
    expect(wc.tone).toBe('yes')
    expect(wc.cls).toContain('emerald')
    expect(wc.note).toBe('')
  })

  it('wheelchair=no → 車椅子非対応（redトーン）', () => {
    const [wc] = parseAccessibility({ wheelchair: 'no' })
    expect(wc.status).toBe('車椅子非対応')
    expect(wc.tone).toBe('no')
    expect(wc.cls).toContain('rose')
  })

  it('wheelchair=limited → 車椅子一部対応（amberトーン）', () => {
    const [wc] = parseAccessibility({ wheelchair: 'limited' })
    expect(wc.status).toBe('車椅子一部対応')
    expect(wc.tone).toBe('limited')
    expect(wc.cls).toContain('amber')
  })

  it('wheelchair=designated → 専用スペースあり（skyトーン）', () => {
    const [wc] = parseAccessibility({ wheelchair: 'designated' })
    expect(wc.status).toBe('車椅子専用スペースあり')
    expect(wc.tone).toBe('designated')
  })

  it('未定義の生値はそのまま表示（unknownトーン）', () => {
    const [wc] = parseAccessibility({ wheelchair: 'permissive' })
    expect(wc.status).toBe('permissive')
    expect(wc.tone).toBe('unknown')
  })

  it('wheelchair:description は :ja 優先でnoteに入る', () => {
    const [wc] = parseAccessibility({
      wheelchair: 'limited',
      'wheelchair:description': 'there are steps, but ramp available on request',
      'wheelchair:description:ja': '階段があるが、段差坂を事前連絡で用意可'
    })
    expect(wc.note).toBe('階段があるが、段差坂を事前連絡で用意可')
  })

  it('バリアフリートイレ（toilets:wheelchair）', () => {
    const items = parseAccessibility({ wheelchair: 'yes', 'toilets:wheelchair': 'no' })
    const toilet = items.find((i) => i.key === 'toilets:wheelchair')
    expect(toilet.label).toBe('バリアフリートイレ')
    expect(toilet.status).toBe('なし')
    expect(toilet.tone).toBe('no')
  })

  it('バリアフリー駐車（capacity:disabled）は台数表示', () => {
    const [parking] = parseAccessibility({ 'capacity:disabled': '3' })
    expect(parking.label).toBe('バリアフリー駐車')
    expect(parking.status).toBe('3台')
    expect(parking.tone).toBe('yes')
  })

  it('エレベーター（elevator + elevator:count）', () => {
    const items = parseAccessibility({ elevator: 'yes', 'elevator:count': '2' })
    const el = items.find((i) => i.key === 'elevator')
    expect(el.status).toBe('あり')
    expect(el.note).toBe('2基')
  })

  it('点字ブロック: separate は「別設置」でyesトーン', () => {
    const [tp] = parseAccessibility({ tactile_paving: 'separate' })
    expect(tp.status).toBe('別設置（誘導線等）')
    expect(tp.tone).toBe('yes')
  })

  it('点字ブロック: yes / no', () => {
    expect(parseAccessibility({ tactile_paving: 'yes' })[0].status).toBe('あり')
    expect(parseAccessibility({ tactile_paving: 'no' })[0].status).toBe('なし')
  })

  it('ヒアリングループ・ベビーカー', () => {
    const items = parseAccessibility({ hearing_loop: 'yes', stroller: 'no' })
    const loop = items.find((i) => i.key === 'hearing_loop')
    const stroller = items.find((i) => i.key === 'stroller')
    expect(loop.status).toBe('あり')
    expect(stroller.status).toBe('なし')
  })

  it('複数のタグが同時に並び（順序: 車椅子が先頭）', () => {
    const items = parseAccessibility({
      wheelchair: 'limited',
      'toilets:wheelchair': 'yes',
      'capacity:disabled': '2',
      elevator: 'yes'
    })
    expect(items.map((i) => i.key)).toEqual(['wheelchair', 'toilets:wheelchair', 'capacity:disabled', 'elevator'])
  })
})

describe('wheelchairBadge', () => {
  it('wheelchairタグがなければnull', () => {
    expect(wheelchairBadge(null)).toBeNull()
    expect(wheelchairBadge({})).toBeNull()
    expect(wheelchairBadge({ amenity: 'cafe' })).toBeNull()
  })

  it.each([
    ['yes', '車椅子対応', 'emerald'],
    ['no', '車椅子非対応', 'rose'],
    ['limited', '車椅子一部対応', 'amber'],
    ['designated', '車椅子専用スペースあり', 'sky']
  ])('wheelchair=%s → %s', (value, text, color) => {
    const badge = wheelchairBadge({ wheelchair: value })
    expect(badge.text).toBe(text)
    expect(badge.cls).toContain(color)
  })

  it('未定義値は生値をそのまま使う', () => {
    const badge = wheelchairBadge({ wheelchair: 'permissive' })
    expect(badge.text).toBe('♿ permissive')
  })
})
