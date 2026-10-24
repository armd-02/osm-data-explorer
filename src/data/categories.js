/**
 * 日本語カテゴリ → OSMタグマッピング
 * 
 * 構造:
 * - id: 一意なID
 * - label: 日本語表示名
 * - tags: タグ条件の配列
 *   - 各タグは { key, values } 
 *   - values が配列の場合 → OR（同一キーの複数値）
 *   - 複数タグオブジェクト → AND
 * - description: 対象の説明（任意）
 * 
 * 新規カテゴリを追加する場合:
 * CATEGORIES 配列に新しいエントリを追加するだけでよい。
 * UIロジックの改修は不要。
 */

export const CATEGORIES = [
  {
    id: 'cafe',
    label: 'カフェ',
    tags: [{ key: 'amenity', values: ['cafe'] }],
    description: 'コーヒーショップ・カフェ'
  },
  {
    id: 'restaurant',
    label: 'レストラン',
    tags: [{ key: 'amenity', values: ['restaurant'] }],
    description: 'レストラン・食堂'
  },
  {
    id: 'food_drink',
    label: '飲食店',
    tags: [{ key: 'amenity', values: ['cafe', 'restaurant', 'fast_food', 'bar', 'pub', 'izakaya', 'sushi', 'food_court'] }],
    description: 'カフェ・レストラン・ファストフード・バー・居酒屋など'
  },
  {
    id: 'convenience',
    label: 'コンビニ・スーパー',
    tags: [
      { key: 'shop', values: ['convenience', 'supermarket'] },
      { key: 'amenity', values: ['convenience'] }
    ],
    description: 'コンビニエンスストア・スーパーマーケット'
  },
  {
    id: 'retail',
    label: '小売店',
    tags: [{ key: 'shop', values: ['clothes', 'shoes', 'department_store', 'gift', 'stationery', 'convenience', 'supermarket', 'bakery', 'confectionery', 'butcher', 'greengrocer', 'florist', 'jewelry', 'hairdresser', 'beauty', 'car', 'motorcycle', 'bicycle', 'sports', 'toys', 'books', 'music', 'newsagent', 'alcohol', 'tobacco', 'variety_store', 'hardware', 'furniture', 'carpet', 'diary', 'gift', 'leather', 'optician', 'tattoo', 'car_repair', 'pet', 'office_supplies', 'outdoor', 'computer', 'hifi', 'jewelry', 'charity', 'composite', 'covered_market'] }],
    description: '各種小売店舗'
  },
  {
    id: 'pharmacy',
    label: '薬局・ドラッグストア',
    tags: [
      { key: 'amenity', values: ['pharmacy'] },
      { key: 'shop', values: ['drugstore'] }
    ],
    description: '薬局・ドラッグストア'
  },
  {
    id: 'hospital',
    label: '病院・クリニック',
    tags: [{ key: 'amenity', values: ['hospital', 'clinic', 'doctors', 'dentist'] }],
    description: '病院・クリニック・歯科'
  },
  {
    id: 'public_facility',
    label: '公共施設',
    tags: [
      { key: 'amenity', values: ['townhall', 'post_office', 'police', 'fire_station', 'library', 'community_centre', 'recycling', 'shelter'] },
      { key: 'office', values: ['government', 'municipality'] }
    ],
    description: '役所・郵便局・警察・消防・図書館など'
  },
  {
    id: 'park',
    label: '公園・広場',
    tags: [
      { key: 'leisure', values: ['park', 'playground', 'garden', 'pitch'] },
      { key: 'amenity', values: ['plaza'] }
    ],
    description: '公園・遊具・庭園・広場'
  },
  {
    id: 'school',
    label: '学校・教育施設',
    tags: [
      { key: 'amenity', values: ['school', 'kindergarten', 'university', 'college', 'language_school'] },
      { key: 'leisure', values: ['common'] }
    ],
    description: '幼稚園・小学校・中学校・高校・大学'
  },
  {
    id: 'transport',
    label: '交通・駅',
    tags: [
      { key: 'railway', values: ['station', 'subway_entry', 'tram_stop'] },
      { key: 'highway', values: ['bus_stop', 'platform'] },
      { key: 'amenity', values: ['fuel', 'parking'] }
    ],
    description: '駅・バス停・ガソリンスタンド・駐車場'
  },
  {
    id: 'accommodation',
    label: '宿泊施設',
    tags: [
      { key: 'tourism', values: ['hotel', 'hostel', 'motel', 'guest_house', 'apartment'] },
      { key: 'building', values: ['hotel'] }
    ],
    description: 'ホテル・ゲストハウス・旅館'
  },
  {
    id: 'bank',
    label: '銀行・ATM',
    tags: [
      { key: 'amenity', values: ['bank', 'atm'] }
    ],
    description: '銀行・現金自動預払機'
  },
  {
    id: 'toilets',
    label: 'トイレ',
    tags: [{ key: 'amenity', values: ['toilets'] }],
    description: '公共トイレ・トイレ'
  },
  {
    id: 'worship',
    label: '寺院・神社',
    tags: [
      { key: 'amenity', values: ['place_of_worship'] },
      { key: 'building', values: ['temple', 'shrine', 'church'] }
    ],
    description: '寺・神社・教会'
  },
  {
    id: 'sports',
    label: 'スポーツ施設',
    tags: [
      { key: 'leisure', values: ['sports_centre', 'stadium', 'swimming_pool', 'pitch', 'golf_course', 'tennis_court', 'basketball_court', 'volleyball_court'] }
    ],
    description: 'スポーツセンター・プール・球場・コート'
  },
  {
    id: 'museum',
    label: '美術館・博物館',
    tags: [{ key: 'tourism', values: ['museum', 'art_gallery', 'viewpoint'] }],
    description: '博物館・美術館・展望台'
  },
  {
    id: 'ramen',
    label: 'ラーメン店',
    tags: [
      { key: 'cuisine', values: ['ramen'] },
      { key: 'amenity', values: ['restaurant', 'fast_food'] }
    ],
    description: 'ラーメン店（cuisine=ramen）'
  },
  {
    id: 'supermarket',
    label: 'スーパーマーケット',
    tags: [{ key: 'shop', values: ['supermarket'] }],
    description: 'スーパーマーケット'
  },
  {
    id: 'gas_station',
    label: 'ガソリンスタンド',
    tags: [{ key: 'amenity', values: ['fuel'] }],
    description: 'ガソリンスタンド・EV充電站'
  }
]

/**
 * カテゴリIDからカテゴリオブジェクトを取得
 */
export function getCategoryById(id) {
  return CATEGORIES.find((c) => c.id === id) || null
}

/**
 * カテゴリのタグ条件をOverpassクエリ用の形式に変換
 * - 同一キーの複数values → OR: (key=v1 OR key=v2)
 * - 複数タグオブジェクト → AND
 * 
 * @param {object} category - カテゴリオブジェクト
 * @returns {string} Overpassクエリのタグフィルタ部分
 */
export function categoryToQueryFilter(category) {
  if (!category || !category.tags || category.tags.length === 0) return ''

  return category.tags.map((tag) => {
    const safeKey = escapeStr(tag.key)
    if (tag.values && tag.values.length > 1) {
      // 複数値 → OR条件
      const orConditions = tag.values.map((v) => `${safeKey}=${escapeStr(v)}`)
      return `(${orConditions.join(' ')})`
    } else if (tag.values && tag.values.length === 1) {
      return `${safeKey}=${escapeStr(tag.values[0])}`
    }
    return `${safeKey}=*`
  }).join(' ')
}

/**
 * カテゴリのタグを人間可読な形式で表示
 */
export function categoryToReadableTags(category) {
  if (!category || !category.tags) return ''
  return category.tags.map((tag) => {
    if (tag.values && tag.values.length > 1) {
      return `${tag.key} ∈ {${tag.values.join(', ')}}`
    } else if (tag.values && tag.values.length === 1) {
      return `${tag.key}=${tag.values[0]}`
    }
    return `${tag.key} (存在)`
  }).join(' AND ')
}

function escapeStr(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}
