import { describe, it, expect } from 'vitest'
import { buildPoiDescription } from '../poiDescription'

// ===== 施設POI =====

describe('buildPoiDescription — 施設POI', () => {
  it('名前・種類・住所・営業時間・電話・Webを出力する', () => {
    const poi = {
      type: 'node', id: 123,
      name: 'テストカフェ',
      tags: {
        amenity: 'cafe',
        name: 'テストカフェ',
        'addr:city': '大阪市',
        'addr:street': '梅田',
        'addr:housenumber': '1-1',
        opening_hours: '09:00-18:00',
        phone: '06-1234-5678',
        website: 'https://example.com'
      },
      lat: 34.6, lon: 135.5
    }
    const desc = buildPoiDescription(poi)
    expect(desc.name).toBe('テストカフェ')
    expect(desc.typeLabel).toBe('カフェ')
    // items の順: 住所 → 営業時間 → 電話 → Web
    expect(desc.items[0]).toEqual({ icon: '📍', text: '大阪市 梅田 1-1' })
    expect(desc.items[1]).toEqual({ icon: '🕐', text: '09:00-18:00' })
    expect(desc.items[2]).toEqual({ icon: '📞', text: '06-1234-5678' })
    expect(desc.items[3]).toEqual({ icon: '🔗', text: 'Webサイト', href: 'https://example.com' })
    expect(desc.osmUrl).toContain('node/123')
  })

  it('未登録項目は省く', () => {
    const poi = {
      type: 'node', id: 456,
      name: '名前のない公園',
      tags: { leisure: 'park', name: '名前のない公園' },
      lat: 34.7, lon: 135.6
    }
    const desc = buildPoiDescription(poi)
    // 住所・営業時間・電話・Web・バリアフリー いずれもない
    expect(desc.items).toEqual([])
    expect(desc.name).toBe('名前のない公園')
  })

  it('バリアフリー情報（車椅子）を含む', () => {
    const poi = {
      type: 'way', id: 789,
      name: 'テスト病院',
      tags: {
        amenity: 'hospital',
        name: 'テスト病院',
        wheelchair: 'yes',
        'wheelchair:description': 'スロープあり'
      },
      lat: 34.8, lon: 135.7
    }
    const desc = buildPoiDescription(poi)
    const wc = desc.items.find((it) => it.text.includes('車椅子'))
    expect(wc).toBeDefined()
    expect(wc.icon).toBe('♿')
    expect(wc.text).toBe('車椅子: 車椅子対応')
    expect(wc.note).toBe('スロープあり')
  })

  it('contact:phone にも対応する', () => {
    const poi = {
      type: 'node', id: 1,
      tags: { amenity: 'cafe', 'contact:phone': '090-1234-5678' },
      lat: 34.6, lon: 135.5
    }
    const desc = buildPoiDescription(poi)
    const phone = desc.items.find((it) => it.icon === '📞')
    expect(phone).toEqual({ icon: '📞', text: '090-1234-5678' })
  })

  it('非http(s)のwebsiteは含まれない', () => {
    const poi = {
      type: 'node', id: 2,
      tags: { amenity: 'cafe', website: 'ftp://example.com' },
      lat: 34.6, lon: 135.5
    }
    const desc = buildPoiDescription(poi)
    const web = desc.items.find((it) => it.icon === '🔗')
    expect(web).toBeUndefined()
  })
})

// ===== バリアフリーPOI =====

describe('buildPoiDescription — バリアフリーPOI', () => {
  it('歩道（way）: 点字ブロック・長さを出力する', () => {
    const poi = {
      type: 'way', id: 100,
      name: null,
      tags: { highway: 'footway', tactile_paving: 'yes' },
      lat: 34.6, lon: 135.5,
      bf: { kind: 'way', tactile: 'yes', lengthM: 150, kerb: null, hasSound: false, hasVibration: false }
    }
    const desc = buildPoiDescription(poi)
    expect(desc.typeLabel).toBe('歩道')
    // 点字ブロック: 有（緑）
    expect(desc.items[0]).toEqual({ icon: '🦯', text: '点字ブロック: 有', cls: 'text-emerald-700' })
    // 長さ
    expect(desc.items[1]).toEqual({ icon: '📏', text: '長さ: 150 m' })
    expect(desc.osmUrl).toContain('way/100')
  })

  it('点字ブロックなし（no）は赤で表示', () => {
    const poi = {
      type: 'way', id: 101,
      name: null,
      tags: { highway: 'footway', tactile_paving: 'no' },
      lat: 34.6, lon: 135.5,
      bf: { kind: 'way', tactile: 'no', lengthM: 80, kerb: null, hasSound: false, hasVibration: false }
    }
    const desc = buildPoiDescription(poi)
    const tactile = desc.items.find((it) => it.text.includes('点字ブロック'))
    expect(tactile.cls).toBe('text-rose-600')
  })

  it('点字ブロック未登録（null）は出力しない', () => {
    const poi = {
      type: 'way', id: 102,
      name: null,
      tags: { highway: 'footway' },
      lat: 34.6, lon: 135.5,
      bf: { kind: 'way', tactile: null, lengthM: null, kerb: null, hasSound: false, hasVibration: false }
    }
    const desc = buildPoiDescription(poi)
    // items が空（点字ブロックも長さも無し）
    expect(desc.items).toEqual([])
  })

  it('案内信号ノード: 音声・振動を出力する', () => {
    const poi = {
      type: 'node', id: 200,
      name: '梅田交差点',
      tags: { name: '梅田交差点', 'traffic_signals:sound': 'yes', 'traffic_signals:vibration': 'yes' },
      lat: 34.7, lon: 135.6,
      bf: { kind: 'node', tactile: null, lengthM: null, kerb: null, hasSound: true, hasVibration: true }
    }
    const desc = buildPoiDescription(poi)
    expect(desc.typeLabel).toBe('音・振動案内信号')
    expect(desc.name).toBe('梅田交差点')
    const signal = desc.items.find((it) => it.icon === '🔔')
    expect(signal.text).toBe('音声・振動案内あり')
    expect(signal.cls).toBe('text-amber-700')
  })

  it('縁石ノード: kerb種別を出力する', () => {
    const poi = {
      type: 'node', id: 300,
      name: null,
      tags: { barrier: 'kerb', kerb: 'cut' },
      lat: 34.8, lon: 135.7,
      bf: { kind: 'node', tactile: null, lengthM: null, kerb: 'cut', hasSound: false, hasVibration: false }
    }
    const desc = buildPoiDescription(poi)
    expect(desc.typeLabel).toBe('縁石')
    const kerbItem = desc.items.find((it) => it.icon === '🧱')
    expect(kerbItem.text).toBe('縁石: cut')
  })
})

// ===== 共通 =====

describe('buildPoiDescription — 共通', () => {
  it('null を渡すと null を返す', () => {
    expect(buildPoiDescription(null)).toBeNull()
  })

  it('OSMリンクが常に含まれる', () => {
    const poi = { type: 'node', id: 42, tags: { amenity: 'toilets' }, lat: 34.6, lon: 135.5 }
    const desc = buildPoiDescription(poi)
    expect(desc.osmUrl).toBe('https://www.openstreetmap.org/node/42')
  })
})
