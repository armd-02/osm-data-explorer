// 日本語カテゴリ → OSMタグマッピング
export const CATEGORIES = [
  {
    id: 'cafe',
    label: 'カフェ',
    tags: { amenity: 'cafe' }
  },
  {
    id: 'restaurant',
    label: 'レストラン',
    tags: { amenity: 'restaurant' }
  },
  {
    id: 'ramen',
    label: 'ラーメン店',
    tags: { amenity: 'restaurant', cuisine: 'japanese;ramen' }
  },
  {
    id: 'convenience_store',
    label: 'コンビニエンスストア',
    tags: { shop: 'convenience' }
  },
  {
    id: 'supermarket',
    label: 'スーパーマーケット',
    tags: { shop: 'supermarket' }
  },
  {
    id: 'pharmacy',
    label: 'ドラッグストア・薬局',
    tags: { shop: 'pharmacy' }
  },
  {
    id: 'hospital',
    label: '病院',
    tags: { amenity: 'hospital' }
  },
  {
    id: 'clinic',
    label: '診療所',
    tags: { amenity: 'clinic' }
  },
  {
    id: 'school',
    label: '学校',
    tags: { amenity: 'school' }
  },
  {
    id: 'park',
    label: '公園',
    tags: { leisure: 'park' }
  },
  {
    id: 'library',
    label: '図書館',
    tags: { amenity: 'library' }
  },
  {
    id: 'post_office',
    label: '郵便局',
    tags: { office: 'postal' }
  },
  {
    id: 'bank',
    label: '銀行',
    tags: { amenity: 'bank' }
  },
  {
    id: 'gas_station',
    label: 'ガソリンスタンド',
    tags: { amenity: 'fuel' }
  },
  {
    id: 'hotel',
    label: 'ホテル・旅館',
    tags: { tourism: 'hotel' }
  },
  {
    id: 'train_station',
    label: '駅',
    tags: { railway: 'station' }
  },
  {
    id: 'bus_stop',
    label: 'バス停',
    tags: { highway: 'bus_stop' }
  },
  {
    id: 'parking',
    label: '駐車場',
    tags: { amenity: 'parking' }
  },
  {
    id: 'toilet',
    label: 'トイレ',
    tags: { amenity: 'toilets' }
  },
  {
    id: 'gym',
    label: 'スポーツ施設',
    tags: { leisure: 'sports_centre' }
  }
]

export function getCategoryById(id) {
  return CATEGORIES.find((c) => c.id === id)
}
