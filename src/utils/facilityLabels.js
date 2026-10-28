/**
 * (#44 生活者目線UI) OSMタグ → 日本語の施設タイプラベル
 *
 * 「生活者目線UI」方針: 施設カード・一覧表では「OSM生データ（node/way、
 * amenity=cafe など）」を主表示にせず、生活者の言葉で施設の種類を表示する。
 * OSM ID やタグ全文は補助情報として扱い（MobileFacilityDetail 等で）非表示の
 * 詳細部に退ける。
 *
 * 解決順序:
 *   1. 主要タグ（amenity > shop > tourism > leisure > healthcare > office >
 *      craft > sport > railway > aeroway）の値を辞書で日本語化
 *   2. 辞書未登録値 → 施設カテゴリ（CATEGORIES）との照合でラベル取得
 *   3. それでもダメなら生の値をそのまま返す（稀）
 */
import { CATEGORIES } from '../data/categories'
import { categoryMatchesElement } from './categoryMatch'

/**
 * 施設名を取得（name → name:ja → フォールバック）
 */
export function facilityName(result) {
  if (!result) return '名前のない要素'
  return result.name || result.tags?.['name:ja'] || '名前のない要素'
}

/**
 * 住所表示（city → suburb → street → housenumber の順）
 * @param {object|null} tags
 * @returns {string} 住所文字列（該当タグがなければ ''）
 */
export function formatAddress(tags) {
  if (!tags) return ''
  const parts = [
    tags['addr:city'] || tags['addr:town'] || tags['addr:village'],
    tags['addr:suburb'] || tags['addr:neighbourhood'],
    tags['addr:street'],
    tags['addr:housenumber']
  ].filter(Boolean)
  return parts.join(' ')
}

/**
 * 公式サイトURLを取得（scheme付きのhttp(s) URLのみ有効とみなす）
 */
export function safeWebsite(tags) {
  if (!tags) return ''
  const url = tags.website || tags.official_website || ''
  return /^https?:\/\//.test(url) ? url : ''
}

// ===== 日本語ラベル辞書 =====

const AMENITY_LABELS = {
  cafe: 'カフェ', restaurant: 'レストラン', fast_food: 'ファストフード',
  bar: 'バー', pub: 'パブ', izakaya: '居酒屋', food_court: 'フードコート',
  pharmacy: '薬局', hospital: '病院', clinic: 'クリニック', dentist: '歯科',
  veterinary: '動物病院', doctors: '診療所',
  bank: '銀行', post_office: '郵便局', police: '警察', fire_station: '消防署',
  townhall: '役場・庁舎', library: '図書館', community_centre: '公民館',
  place_of_worship: '寺院・教会', fountain: '飲水機', drinking_water: '飲料水',
  toilets: '公共トイレ', shower: 'シャワー',
  school: '学校', university: '大学', college: '大学・短大', kindergarten: '幼稚園',
  daycare: '保育園', driving_school: '自動車教習所',
  gym: 'スポーツジム', internet_cafe: 'ネットカフェ', taxi: 'タクシー乗り場',
  fuel: 'ガソリンスタンド', vending_machine: '自販機', water_point: '水場',
  ambulance_station: '救急センター', courthouse: '裁判所',
  recycling: 'リサイクル回収', waste_basket: 'ごみ箱',
  money_transfer: '送金窓口', money_exchange: '為替所',
  social_facility: '社会施設',
  monastery: '寺院'
}

const SHOP_LABELS = {
  convenience: 'コンビニエンスストア', supermarket: 'スーパーマーケット',
  bakery: 'パン屋', butcher: '精肉店', chemist: 'ドラッグストア',
  pharmacy: '薬局', florist: '花屋', clothes: 'アパレル', boutique: 'ブティック',
  shoes: '靴屋', hardware: 'ホームセンター', garden: '園芸店',
  garden_centre: 'ガーデンセンター', car: '自動車関連', car_repair: '車整備',
  hairdresser: '美容室', beauty: '美容室', books: '書店', stationery: '文房具店',
  tobacco: 'タバコ屋', bureau_de_tabac: 'タバコ屋', lottery: '宝くじ',
  jewellery: 'ジュエリー', sweet_shop: '洋菓子店', tea: '茶葉店',
  cafe: 'カフェ', restaurant: 'レストラン', fast_food: 'ファストフード',
  pizza: 'ピザ屋', ice_cream: 'アイスクリーム', beverages: '飲料店',
  liquor: '酒類店', wine: 'ワイン店', toys: 'おもちゃ屋',
  sport_goods: 'スポーツ用品店', newsagent: '新聞屋', optician: '眼鏡店',
  pet: 'ペットショップ', doityourself: 'DIY店', electronics: '電気店',
  computer: 'パソコン店', video_games: 'ゲーム店', hifi: 'オーディオ店',
  fairtrade: 'フェアトレード', farm: '農産物直売', fishmonger: '魚屋',
  general: '雑貨店', laundry: 'クリーニング店', massage: 'マッサージ',
  motorcycle: 'バイク店', music: '楽器店', office_supplies: 'オフィス用品',
  outdoor: 'アウトドア用品', perfume: '香水店', securities: '証券会社',
  interior: 'インテリア店', home: '住宅関連', taxi: 'タクシー',
  travel_agency: '旅行代理店', copyshop: 'コピー店', compost: '堆肥店',
  aquarium: '観魚用品店'
}

const TOURISM_LABELS = {
  hotel: 'ホテル', hostel: 'ホステル', apartment: 'ゲストアパートメント',
  guest_house: 'ゲストハウス', camp_site: 'キャンプ場',
  museum: '博物館・美術館', gallery: 'ギャラリー', zoo: '動物園',
  aquarium: '水族館', theme_park: 'テーマパーク', viewpoint: '展望スポット',
  information: '観光案内所', picnic_site: 'ピクニック場',
  art: '美術館', history: '歴史博物館', architecture: '建築博物館',
  natural_history: '自然科学博物館', technology: '科学技術博物館',
  science: '科学館', open_air: '野外博物館', military: '軍事博物館',
  children: '子ども博物館', railway: '鉄道博物館',
  heritage: '文化遺産', attraction: '観光スポット'
}

const LEISURE_LABELS = {
  park: '公園', garden: '庭園', playground: '遊び場の広場',
  sports_centre: 'スポーツセンター', gym: 'スポーツジム',
  swimming_pool: 'プール', pitch: 'グラウンド', track: 'トラック',
  common: '広場', slipway: 'ボート発着場', marina: 'マリーナ',
  dance: 'ダンススタジオ', beach: 'ビーチ', nature_reserve: '自然保護区',
  water_park: 'ウォーターパーク', stadium: 'スタジアム',
  slide: 'スライダー', adventure_course: 'アスレチック'
}

const HEALTHCARE_LABELS = {
  centre: '医療センター', clinic: 'クリニック', dentist: '歯科',
  doctor: '診療所', gym: 'リハビリジム', laboratory: '検査ラボ',
  pharmacy: '薬局', psychologist: '心理カウンセラー',
  therapist: '療法士', alternative: '代替医療', podiatrist: '足専門医',
  veterinary: '動物病院', hospital: '病院'
}

const OFFICE_LABELS = {
  library: '図書館', government: '官公庁', townhall: '役場・庁舎',
  post_office: '郵便局', police: '警察', fire_service: '消防',
  water_board: '水道局', company: '企業', school: '学校', university: '大学',
  engineer: '設計事務所', architect: '建築事務所', lawyer: '法律事務所',
  accountant: '会計事務所', insurance: '保険会社', factory: '工場',
  ngo: 'NGO・団体', education: '教育機関', religious: '宗教団',
  employment_agency: 'ハローワーク・人材', survey: '測量事務所',
  dentist: '歯科', doctor: '診療所',
  notary: '公証役場', tax_advisor: '税理士'
}

const CRAFT_LABELS = {
  baker: 'パン屋', butcher: '精肉店', carpenter: '大工・木工',
  electrician: '電気工事店', plumber: '水道工事店', painter: '塗装店',
  jeweller: '宝石店', tailor: '仕立て屋', shoemaker: '靴修理',
  printer: '印刷店', mason: '石工', welder: '溶接店', tinker: '金物店',
  beekeeper: '養蜂', blacksmith: '金物屋', locksmith: '鍵屋',
  roofer: '屋根職人', signmaker: '看板屋', stonemason: '石工',
  wheelmaker: '自転車工房', winemaker: 'ワイナリー',
  sawmill: '製材所', potter: '陶芸家', wainwright: '車体工房',
  wood_carver: '木工彫刻', wall_coverer: '壁紙店', glazier: 'ガラス店',
  toolmaker: '工具製造', toymaker: '玩具工房', copyshop: 'コピー店'
}

const SPORT_LABELS = {
  swimming: '水泳', football: 'サッカー', basketball: 'バスケットボール',
  baseball: '野球', tennis: 'テニス', badminton: 'バドミントン',
  volleyball: 'バレーボール', rugby: 'ラグビー', athletics: '陸上',
  running: 'ランニング', cycling: 'サイクリング', horse: '馬',
  golf: 'ゴルフ', ski: 'スキー', climbing: 'クライミング', yoga: 'ヨガ',
  karate: '空手', judo: '柔道', taekwondo: 'テコンドー',
  archery: '弓道', bowling: 'ボウリング', darts: 'ダーツ',
  pingpong: '卓球', table_tennis: '卓球', squash: 'スクワッシュ',
  handball: 'ハンドボール', hockey: 'ホッケー', surfing: 'サーフィン',
  skateboarding: 'スケートボード', ice_skating: 'アイススケート',
  martial_arts: '格闘武道', dance: 'ダンス', aerobics: 'エアロビクス',
  tai_chi: '太極拳', weightlifting: 'ウエイトトレーニング',
  strength: 'ストレングス', spinning: 'インドアサイクル',
  futsal: 'フットサル'
}

const RAILWAY_LABELS = {
  station: '駅', halt: '駅', platform: 'ホーム',
  tram: '路面電車', subway: '地下鉄', light_rail: 'ライトレール',
  monorail: 'モノレール', funicular: 'ケーブルカー式鉄道',
  cable_car: 'ロープウェイ', aerial_way: '空中ロープウェイ',
  trolleybus: 'トロリーバス'
}

const AEROWAY_LABELS = {
  airport: '空港', aerodrome: '飛行場', helipad: 'ヘリポート',
  heliport: 'ヘリポート', terminal: 'ターミナル'
}

// 解決順序（先に一致したタグの種類でラベルを確定）
const TAG_SOURCES = [
  ['amenity', AMENITY_LABELS],
  ['shop', SHOP_LABELS],
  ['tourism', TOURISM_LABELS],
  ['leisure', LEISURE_LABELS],
  ['healthcare', HEALTHCARE_LABELS],
  ['office', OFFICE_LABELS],
  ['craft', CRAFT_LABELS],
  ['sport', SPORT_LABELS],
  ['railway', RAILWAY_LABELS],
  ['aeroway', AEROWAY_LABELS]
]

/**
 * 施設カテゴリの照合順（単一タイプ優先 → 合集合は後回し）
 * 辞書に載らない値に対して、どのカテゴリラベルで表示するか決める。
 */
const CATEGORY_MATCH_ORDER = [
  'cafe', 'restaurant', 'fast_food', 'bar_izakaya', 'convenience',
  'retail', 'pharmacy', 'hospital', 'school', 'bank', 'toilets',
  'public_facility', 'park', 'sports', 'museum', 'worship',
  'accommodation', 'transport', 'food_drink'
]

/**
 * 要素の施設タイプを日本語ラベルで返す（#44）
 * @param {object} result - Overpass result（{ type, id, tags }）
 * @returns {string} 例: 'カフェ' / '公園' / '駅'
 */
export function facilityTypeLabel(result) {
  const tags = (result && result.tags) || {}

  // 1. 主要タグ値を辞書で日本語化
  for (const [key, dict] of TAG_SOURCES) {
    const value = tags[key]
    if (typeof value === 'string' && dict[value]) {
      return dict[value]
    }
  }

  // 2. カテゴリ照合（例: leisure=marina → 「公園」に該当しなければ次へ…）
  for (const catId of CATEGORY_MATCH_ORDER) {
    if (categoryMatchesElement(catId, result)) {
      const cat = CATEGORIES.find((c) => c.id === catId)
      if (cat) return cat.label
    }
  }

  // 3. フォールバック: 生値（稀）
  const raw = tags.amenity || tags.shop || tags.tourism || tags.leisure ||
    tags.healthcare || tags.office || tags.craft || tags.sport ||
    tags.railway || tags.aeroway
  return raw || '施設'
}
