/**
 * 地理関連ユーティリティ（Nominatimジオコード、BBOX計算）
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'OSM-Data-Explorer/0.1 (https://armd-02.github.io/osm-data-explorer/)'

/**
 * 地名をジオコードする（Nominatim）
 * @param {string} query - 地名（例: "大阪市北区"）
 * @returns {Promise<object|null>} - { lat, lon, display_name, type, boundingbox }
 */
let lastRequestTime = 0

export async function geocode(query) {
  if (!query || query.trim() === '') return null

  // Nominatim利用規約: 最大1リクエスト/秒
  const elapsed = Date.now() - lastRequestTime
  if (elapsed < 1000) {
    await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed))
  }

  const params = new URLSearchParams({
    q: query.trim(),
    format: 'json',
    limit: '1',
    countrycodes: 'jp'
  })

  const url = `${NOMINATIM_URL}?${params.toString()}`

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT
      }
    })

    if (!response.ok) {
      throw new Error(`Nominatim APIエラー (${response.status})`)
    }

    const data = await response.json()
    lastRequestTime = Date.now()

    if (data.length === 0) return null

    const result = data[0]
    return {
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      displayName: result.display_name,
      type: result.type,
      boundingbox: result.boundingbox
        ? {
            south: parseFloat(result.boundingbox[0]),
            north: parseFloat(result.boundingbox[1]),
            west: parseFloat(result.boundingbox[2]),
            east: parseFloat(result.boundingbox[3])
          }
        : null
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('ジオコードに失敗しました')
    }
    throw error
  }
}

/**
 * BBOXの概算面積（km²）を計算
 * 日本国内の緯度帯（30°〜45°N）での概算
 */
export function calculateBboxAreaKm2(bbox) {
  const { south, north, west, east } = bbox
  const latMid = (south + north) / 2
  const latRad = (latMid * Math.PI) / 180

  const dLatKm = ((north - south) * Math.PI / 180) * 6371
  const dLonKm = ((east - west) * Math.PI / 180) * 6371 * Math.cos(latRad)

  return dLatKm * dLonKm
}

/**
 * BBOXが検索に大きすぎないかチェック
 * @returns {{ tooLarge: boolean, areaKm2: number, message: string|null }}
 */
export function checkBboxSize(bbox) {
  const areaKm2 = calculateBboxAreaKm2(bbox)

  // 50km x 50km = 2500 km² を目安に警告
  if (areaKm2 > 2500) {
    return {
      tooLarge: true,
      areaKm2,
      message: `検索範囲が広すぎます（約${Math.round(areaKm2).toLocaleString()} km²）。範囲を狭めると検索が早くなります。`
    }
  }

  // 200km x 200km = 40000 km² を目安にエラー扱い
  if (areaKm2 > 40000) {
    return {
      tooLarge: true,
      areaKm2,
      message: `検索範囲が大きすぎます（約${Math.round(areaKm2).toLocaleString()} km²）。Overpass APIの制限により検索できない場合があります。必ず範囲を狭めてください。`
    }
  }

  return { tooLarge: false, areaKm2, message: null }
}

/**
 * 地名が行政区域かどうかを判定
 * Nominatimのtypeが行政区域を表すかチェック
 */
export function isAdministrativeBoundary(type) {
  const adminTypes = [
    'country', 'state', 'region', 'county',
    'city', 'town', 'village', 'suburb',
    'municipality', 'borough', 'district'
  ]
  return adminTypes.includes(type)
}
