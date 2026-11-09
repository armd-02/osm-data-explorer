// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import PoiDescription from '../PoiDescription'

afterEach(() => { cleanup() })

// ===== 未選択時の案内文 =====

describe('PoiDescription — 未選択時', () => {
  it('tappedPoi が null のとき案内文を表示する', () => {
    render(<PoiDescription tappedPoi={null} />)
    expect(screen.getByText('地図のPOIをタップすると、ここに説明が表示されます')).toBeTruthy()
  })

  it('tappedPoi が undefined のとき案内文を表示する', () => {
    render(<PoiDescription />)
    expect(screen.getByText('地図のPOIをタップすると、ここに説明が表示されます')).toBeTruthy()
  })
})

// ===== 施設POI: タグがある場合 =====

describe('PoiDescription — 施設POI（タグあり）', () => {
  it('名前・種類・住所・営業時間・電話・Web・OSMリンクを表示する', () => {
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
    render(<PoiDescription tappedPoi={poi} />)
    expect(screen.getByText('テストカフェ')).toBeTruthy()
    expect(screen.getByText('カフェ')).toBeTruthy()
    expect(screen.getByText(/大阪市/)).toBeTruthy()
    expect(screen.getByText(/09:00-18:00/)).toBeTruthy()
    expect(screen.getByText(/06-1234-5678/)).toBeTruthy()
    expect(screen.getByText(/Webサイト/)).toBeTruthy()
    expect(screen.getByText(/OSMで見る/)).toBeTruthy()
  })

  it('バリアフリー情報（車椅子）も表示する', () => {
    const poi = {
      type: 'way', id: 456,
      name: 'テスト病院',
      tags: {
        amenity: 'hospital',
        name: 'テスト病院',
        wheelchair: 'yes',
        'wheelchair:description': 'スロープあり'
      },
      lat: 34.7, lon: 135.6
    }
    render(<PoiDescription tappedPoi={poi} />)
    expect(screen.getByText(/車椅子/)).toBeTruthy()
    expect(screen.getByText(/スロープあり/)).toBeTruthy()
  })
})

// ===== 施設POI: タグがない場合 =====

describe('PoiDescription — 施設POI（タグ少ない）', () => {
  it('タグが amenity のみなら住所等なしで表示する', () => {
    const poi = {
      type: 'node', id: 789,
      name: null,
      tags: { amenity: 'toilets' },
      lat: 34.6, lon: 135.5
    }
    render(<PoiDescription tappedPoi={poi} />)
    expect(screen.getByText('名前のない要素')).toBeTruthy()
    expect(screen.getByText('公共トイレ')).toBeTruthy()
    // OSMリンクはある
    expect(screen.getByText(/OSMで見る/)).toBeTruthy()
    // 住所・電話等は出ない
    expect(screen.queryByText(/📍/)).toBeNull()
    expect(screen.queryByText(/📞/)).toBeNull()
  })
})

// ===== バリアフリーPOI: タグがある場合 =====

describe('PoiDescription — バリアフリーPOI（タグあり）', () => {
  it('歩道: 点字ブロック・長さを表示する', () => {
    const poi = {
      type: 'way', id: 100,
      name: null,
      tags: { highway: 'footway', tactile_paving: 'yes' },
      lat: 34.6, lon: 135.5,
      bf: { kind: 'way', tactile: 'yes', lengthM: 150, kerb: null, hasSound: false, hasVibration: false }
    }
    render(<PoiDescription tappedPoi={poi} />)
    expect(screen.getByText('歩道')).toBeTruthy()
    expect(screen.getByText(/点字ブロック: 有/)).toBeTruthy()
    expect(screen.getByText(/長さ: 150 m/)).toBeTruthy()
    expect(screen.getByText(/OSMで見る/)).toBeTruthy()
  })

  it('案内信号ノード: 音声・振動を表示する', () => {
    const poi = {
      type: 'node', id: 200,
      name: '梅田交差点',
      tags: { name: '梅田交差点', 'traffic_signals:sound': 'yes', 'traffic_signals:vibration': 'yes' },
      lat: 34.7, lon: 135.6,
      bf: { kind: 'node', tactile: null, lengthM: null, kerb: null, hasSound: true, hasVibration: true }
    }
    render(<PoiDescription tappedPoi={poi} />)
    expect(screen.getByText('梅田交差点')).toBeTruthy()
    expect(screen.getByText('音・振動案内信号')).toBeTruthy()
    expect(screen.getByText(/音声・振動案内あり/)).toBeTruthy()
  })

  it('縁石ノード: kerb種別を表示する', () => {
    const poi = {
      type: 'node', id: 300,
      name: null,
      tags: { barrier: 'kerb', kerb: 'cut' },
      lat: 34.8, lon: 135.7,
      bf: { kind: 'node', tactile: null, lengthM: null, kerb: 'cut', hasSound: false, hasVibration: false }
    }
    render(<PoiDescription tappedPoi={poi} />)
    expect(screen.getByText('縁石')).toBeTruthy()
    expect(screen.getByText(/縁石: cut/)).toBeTruthy()
  })
})

// ===== バリアフリーPOI: タグがない場合 =====

describe('PoiDescription — バリアフリーPOI（タグ少ない）', () => {
  it('属性が未登録なら種類のみ＋OSMリンク', () => {
    const poi = {
      type: 'way', id: 400,
      name: null,
      tags: { highway: 'path' },
      lat: 34.6, lon: 135.5,
      bf: { kind: 'way', tactile: null, lengthM: null, kerb: null, hasSound: false, hasVibration: false }
    }
    render(<PoiDescription tappedPoi={poi} />)
    expect(screen.getByText('歩行者用通路')).toBeTruthy()
    // 点字ブロック・長さ等は出ない
    expect(screen.queryByText(/点字ブロック:/)).toBeNull()
    expect(screen.queryByText(/長さ:/)).toBeNull()
    // OSMリンクはある
    expect(screen.getByText(/OSMで見る/)).toBeTruthy()
  })
})

// ===== タップで枠が更新されること =====

describe('PoiDescription — タップで更新', () => {
  const poiA = {
    type: 'node', id: 1,
    name: 'カフェA',
    tags: { amenity: 'cafe', name: 'カフェA', phone: '06-1111-1111' },
    lat: 34.6, lon: 135.5
  }
  const poiB = {
    type: 'node', id: 2,
    name: '薬局B',
    tags: { amenity: 'pharmacy', name: '薬局B', website: 'https://pharmacy-b.example.com' },
    lat: 34.7, lon: 135.6
  }

  it('tappedPoi が変わると表示内容も変わる', () => {
    const { rerender } = render(<PoiDescription tappedPoi={poiA} />)
    expect(screen.getByText('カフェA')).toBeTruthy()
    expect(screen.getByText(/06-1111-1111/)).toBeTruthy()

    // 別のPOIをタップ
    rerender(<PoiDescription tappedPoi={poiB} />)
    expect(screen.queryByText('カフェA')).toBeNull()
    expect(screen.getByText('薬局B')).toBeTruthy()
    expect(screen.getByText(/Webサイト/)).toBeTruthy()
  })

  it('tappedPoi が null に戻ると案内文に戻る', () => {
    const { rerender } = render(<PoiDescription tappedPoi={poiA} />)
    expect(screen.getByText('カフェA')).toBeTruthy()

    rerender(<PoiDescription tappedPoi={null} />)
    expect(screen.queryByText('カフェA')).toBeNull()
    expect(screen.getByText('地図のPOIをタップすると、ここに説明が表示されます')).toBeTruthy()
  })
})
