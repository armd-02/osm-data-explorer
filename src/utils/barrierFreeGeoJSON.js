/**
 * (#62) バリアフリー検索 — 第4ピース: 地図描画用GeoJSON変換
 *
 * toStandardResults（barrierFreeResults.js）の正規化済み結果を、
 * 地図上の線（way）と点（node）描画用GeoJSONに変換する。
 * - way: bf.geometry（[[lon, lat], ...]）を LineString として使う
 *   （頂点平均の近似中心点は地図上では使わない）
 * - node: bf.geometry（[lon, lat]）を Point として使う
 *
 * 色定数（TACTILE_LINE_COLORS / NODE_ROLE_COLORS）は MapView の
 * レイヤ定義と凡例（BarrierFreeLegend）で共有する。
 * 第5ピース（GeoJSONダウンロード）でも bf.geometry をそのまま使える。
 */

// 線（way）の色: 点字ブロックの登録状態による
export const TACTILE_LINE_COLORS = {
  yes: '#059669',      // 点字ブロックあり（緑）
  no: '#e11d48',       // 点字ブロックなし（赤）
  unknown: '#94a3b8'   // 未記録（グレー）
}

// 点（node）の色: 役割（role）による（仕様: 縁石=オレンジ、音声案内=紫、両方=別の色）
export const NODE_ROLE_COLORS = {
  kerb: '#f59e0b',          // 縁石（オレンジ）
  signal: '#7c3aed',        // 音声/振動案内信号（紫）
  'kerb+signal': '#0d9488', // 縁石+案内信号（ティール: 上記どちらとも異なる色）
  other: '#64748b'          // それ以外のバリアフリー要素（スレート）
}

/**
 * ノードの地図表示用役割（role）を返す（仕様: 第4ピース）。
 * - kerb と signal の両方: 'kerb+signal'
 * - kerb のみ: 'kerb'
 * - hasSound または hasVibration のみ: 'signal'
 * - どちらでもない: 'other'
 * kerb 判定は barrierFreeTypeLabel（barrierFreeResults.js）と同一
 * （barrier=kerb か kerb タグがある）。
 */
export function roleOf(result) {
  const r = result || {}
  const bf = r.bf || {}
  const tags = r.tags || {}
  const isSignal = !!(bf.hasSound || bf.hasVibration)
  const isKerb = tags.barrier === 'kerb' || tags.kerb != null
  if (isKerb && isSignal) return 'kerb+signal'
  if (isKerb) return 'kerb'
  if (isSignal) return 'signal'
  return 'other'
}

/**
 * バリアフリー検索結果（標準結果形状、bf フィールド付き）を
 * 地図描画用GeoJSON（FeatureCollection）に変換する。
 *
 * 各featureのproperties:
 * - key: `${type}/${id}`（結果リストのキーと同一。クリック時の特定用）
 * - kind: 'way' | 'node'
 * - name: name タグの値（無ければ null）
 * - way のみ: tactile（'yes' | 'no' | null）
 * - node のみ: role（'signal' | 'kerb' | 'kerb+signal' | 'other'）
 *
 * 線・点の仕分けは bf.kind（'way' / 'node'）で行う（仕様2）。
 *
 * 描画に使えるジオメトリが無い要素（wayが1点未満、nodeが座標なし）は除外する。
 * @param {Array} results - toStandardResults の出力
 * @returns {{type:'FeatureCollection', features:Array}}
 */
export function barrierFreeToMapGeoJSON(results) {
  const features = []
  for (const r of Array.isArray(results) ? results : []) {
    if (!r || typeof r !== 'object') continue
    const geom = r.bf && Array.isArray(r.bf.geometry) ? r.bf.geometry : []
    const key = `${r.type}/${r.id}`

    if (r.bf && r.bf.kind === 'way' && geom.length >= 2) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: geom },
        properties: {
          key,
          kind: 'way',
          name: r.name || null,
          // tactile は yes / no / null の3値に正規化（その他は未記録扱い）
          tactile: (r.bf.tactile === 'yes' || r.bf.tactile === 'no') ? r.bf.tactile : null
        }
      })
    } else if (r.bf && r.bf.kind === 'node' && geom.length === 2) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: geom },
        properties: {
          key,
          kind: 'node',
          name: r.name || null,
          role: roleOf(r)
        }
      })
    }
  }
  return { type: 'FeatureCollection', features }
}
