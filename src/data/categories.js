/**
 * 日本語カテゴリ → OSMタグマッピング
 * 
 * 構造:
 * - id: 一意なID
 * - label: 日本語表示名
 * - tags: タグ条件の配列
 *   - 各タグは { key, values } 
 *   - values が配列の場合 → 同一キーの複数値を OR
 * - logic: 複数tags間をどう組み合わせるか
 *   - 'or'  : いずれかのtagsが一致すればOK（デフォルト）
 *   - 'and' : 全てのtagsが一致する場合のみ
 * - description: 対象の説明（任意）
 * 
 * 新規カテゴリを追加する場合:
 * (1) CATEGORIES 配列に新しいエントリを追加
 * (2) CATEGORY_GROUPS の適切なグループの ids にIDを追加（セレクト表示用）
 */

export const CATEGORIES = [
  {
    id: 'cafe',
    label: 'カフェ',
    tags: [{ key: 'amenity', values: ['cafe'] }],
    logic: 'or',
    description: 'コーヒーショップ・カフェ'
  },
  {
    id: 'restaurant',
    label: 'レストラン',
    tags: [{ key: 'amenity', values: ['restaurant'] }],
    logic: 'or',
    description: 'レストラン・食堂'
  },
  {
    id: 'food_drink',
    label: '飲食店',
    tags: [{ key: 'amenity', values: ['cafe', 'restaurant', 'fast_food', 'bar', 'pub', 'izakaya', 'sushi', 'food_court'] }],
    logic: 'or',
    description: 'カフェ・レストラン・ファストフード・バー・居酒屋など'
  },
  {
    id: 'convenience',
    label: 'コンビニ・スーパー',
    tags: [
      { key: 'shop', values: ['convenience', 'supermarket'] },
      { key: 'amenity', values: ['convenience'] }
    ],
    logic: 'or',
    description: 'コンビニエンスストア・スーパーマーケット'
  },
  {
    id: 'retail',
    label: '小売店',
    tags: [{ key: 'shop', values: ['clothes', 'shoes', 'department_store', 'gift', 'stationery', 'convenience', 'supermarket', 'bakery', 'confectionery', 'butcher', 'greengrocer', 'florist', 'jewelry', 'hairdresser', 'beauty', 'car', 'motorcycle', 'bicycle', 'sports', 'toys', 'books', 'music', 'newsagent', 'alcohol', 'tobacco', 'variety_store', 'hardware', 'furniture', 'carpet', 'diary', 'leather', 'optician', 'tattoo', 'car_repair', 'pet', 'office_supplies', 'outdoor', 'computer', 'hifi', 'charity', 'composite', 'covered_market'] }],
    logic: 'or',
    description: '各種小売店舗'
  },
  {
    id: 'pharmacy',
    label: '薬局・ドラッグストア',
    tags: [
      { key: 'amenity', values: ['pharmacy'] },
      { key: 'shop', values: ['drugstore'] }
    ],
    logic: 'or',
    description: '薬局・ドラッグストア'
  },
  {
    id: 'hospital',
    label: '病院・クリニック',
    tags: [{ key: 'amenity', values: ['hospital', 'clinic', 'doctors', 'dentist'] }],
    logic: 'or',
    description: '病院・クリニック・歯科'
  },
  {
    id: 'public_facility',
    label: '公共施設',
    tags: [
      { key: 'amenity', values: ['townhall', 'post_office', 'police', 'fire_station', 'library', 'community_centre', 'recycling', 'shelter'] },
      { key: 'office', values: ['government', 'municipality'] }
    ],
    logic: 'or',
    description: '役所・郵便局・警察・消防・図書館など'
  },
  {
    id: 'park',
    label: '公園・広場',
    tags: [
      { key: 'leisure', values: ['park', 'playground', 'garden', 'pitch'] },
      { key: 'amenity', values: ['plaza'] }
    ],
    logic: 'or',
    description: '公園・遊具・庭園・広場'
  },
  {
    id: 'school',
    label: '学校・教育施設',
    tags: [
      { key: 'amenity', values: ['school', 'kindergarten', 'university', 'college', 'language_school'] },
      { key: 'leisure', values: ['common'] }
    ],
    logic: 'or',
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
    logic: 'or',
    description: '駅・バス停・ガソリンスタンド・駐車場'
  },
  {
    id: 'accommodation',
    label: '宿泊施設',
    tags: [
      { key: 'tourism', values: ['hotel', 'hostel', 'motel', 'guest_house', 'apartment'] },
      { key: 'building', values: ['hotel'] }
    ],
    logic: 'or',
    description: 'ホテル・ゲストハウス・旅館'
  },
  {
    id: 'bank',
    label: '銀行・ATM',
    tags: [
      { key: 'amenity', values: ['bank', 'atm'] }
    ],
    logic: 'or',
    description: '銀行・現金自動預払機'
  },
  {
    id: 'toilets',
    label: 'トイレ',
    tags: [{ key: 'amenity', values: ['toilets'] }],
    logic: 'or',
    description: '公共トイレ・トイレ'
  },
  {
    id: 'worship',
    label: '寺院・神社',
    tags: [
      { key: 'amenity', values: ['place_of_worship'] },
      { key: 'building', values: ['temple', 'shrine', 'church'] }
    ],
    logic: 'or',
    description: '寺・神社・教会'
  },
  {
    id: 'sports',
    label: 'スポーツ施設',
    tags: [
      { key: 'leisure', values: ['sports_centre', 'stadium', 'swimming_pool', 'pitch', 'golf_course', 'tennis_court', 'basketball_court', 'volleyball_court'] }
    ],
    logic: 'or',
    description: 'スポーツセンター・プール・球場・コート'
  },
  {
    id: 'museum',
    label: '美術館・博物館',
    tags: [{ key: 'tourism', values: ['museum', 'art_gallery', 'viewpoint'] }],
    logic: 'or',
    description: '博物館・美術館・展望台'
  },
  {
    id: 'ramen',
    label: 'ラーメン店',
    tags: [
      { key: 'cuisine', values: ['ramen'] },
      { key: 'amenity', values: ['restaurant', 'fast_food'] }
    ],
    logic: 'and',
    description: 'ラーメン店（cuisine=ramen）'
  }
]
// 注: 旧スーパーマーケット(shop=supermarket)・ガソリンスタンド(amenity=fuel)エントリは、
// それぞれコンビニ・スーパー・交通・駅に完全に包含される重複だったため削除。
// 検索能力は上位カテゴリがカバーする。

/**
 * カテゴリIDからカテゴリオブジェクトを取得
 */
export function getCategoryById(id) {
  return CATEGORIES.find((c) => c.id === id) || null
}

/**
 * カテゴリの粒度が混在（広義グループ／単一タイプ／上位カテゴリのサブセット）するため、
 * セレクトボックスはドメイン別の <optgroup> で表示し、グループ内は「広い → 狭い」順に並べる。
 * グループ内の順序はここで制御する（CATEGORIES 配列の順序に依存しない）。
 */
export const CATEGORY_GROUPS = [
  { name: '飲食', ids: ['food_drink', 'cafe', 'restaurant', 'ramen'] },
  { name: '買い物・薬局', ids: ['retail', 'convenience', 'pharmacy', 'hospital'] },
  { name: '教育・公共施設', ids: ['public_facility', 'school', 'park', 'worship', 'toilets'] },
  { name: '交通・宿泊', ids: ['transport', 'accommodation'] },
  { name: 'レジャー・文化・金融', ids: ['sports', 'museum', 'bank'] }
]

/**
 * ドメイン別にグループ化したカテゴリを返す（セレクトの <optgroup> 描画用）。
 * @returns {Array<{ group: string, categories: Array<object> }>}
 */
export function getGroupedCategories() {
  return CATEGORY_GROUPS
    .map((g) => ({
      group: g.name,
      categories: g.ids.map((id) => getCategoryById(id)).filter(Boolean)
    }))
    .filter((g) => g.categories.length > 0)
}

/**
 * カテゴリのタグ条件をOverpassクエリ用のフィルタ文字列に変換
 * 
 * logic='or': 各tag条件をunion（;区切り）で繋ぐ → いずれか一致
 * logic='and': 各tag条件を連結フィルタで繋ぐ → 全て一致
 *
 * 同一キーの複数値は正規表現 key~"^(v1|v2|...)$" で表現する
 *
 * @param {object} category - カテゴリオブジェクト
 * @returns {object} { unionFilters: string[], andFilter: string }
 *   - logic='or'  → unionFilters に各条件が入る（andFilterは空文字列）
 *   - logic='and' → andFilter に連結フィルタが入る（unionFiltersは空）
 */
export function categoryToQueryFilter(category) {
  if (!category || !category.tags || category.tags.length === 0) {
    return { unionFilters: [], andFilters: [] }
  }

  const logic = category.logic || 'or'

  // 各tag条件をOverpass QLフィルタに変換（角括弧なしのフィルタ内容）
  const filters = category.tags.map((tag) => {
    const safeKey = escapeStr(tag.key)
    if (tag.values && tag.values.length > 1) {
      // 複数値 → 正規表現でOR
      const escaped = tag.values.map((v) => escapeRegex(v))
      return `${safeKey}~"^(${escaped.join('|')})$"`
    } else if (tag.values && tag.values.length === 1) {
      return `${safeKey}=${quoteValue(tag.values[0])}`
    }
    return safeKey
  })

  if (logic === 'and') {
    // AND: フィルタ配列を返す（クエリ生成側が [f1][f2] に連結）
    return { unionFilters: [], andFilters: filters }
  }

  // OR: 各フィルタを個別に返す（クエリ生成側が [f] でunionブランチ化）
  return { unionFilters: filters, andFilters: [] }
}

/**
 * カテゴリのタグを人間可読な形式で表示
 */
export function categoryToReadableTags(category) {
  if (!category || !category.tags) return ''
  const joiner = (category.logic === 'and') ? ' AND ' : ' OR '
  return category.tags.map((tag) => {
    if (tag.values && tag.values.length > 1) {
      return `${tag.key} ∈ {${tag.values.join(', ')}}`
    } else if (tag.values && tag.values.length === 1) {
      return `${tag.key}=${tag.values[0]}`
    }
    return `${tag.key} (存在)`
  }).join(joiner)
}

// ---------- ヘルパー ----------

/**
 * Overpass QLのキーをエスケープ
 * キーは通常 alphanum + : + _ のみだが、安全のため特殊文字をエスケープ
 */
function escapeStr(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * 正規表現内で特殊な文字をエスケープ
 */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 値を適切に引用符で囲む（特殊文字を含む場合のみ）
 */
function quoteValue(str) {
  const s = String(str)
  // 特殊文字を含む場合はダブルクォートで囲む
  if (/[",\\\s[\](){}]/.test(s)) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return s
}
