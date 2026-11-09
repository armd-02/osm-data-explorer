/**
 * (#62) バリアフリー検索 — 第3ピース: 結果の正規化と一覧表示ユーティリティ
 *
 * バリアフリー検索のOverpassクエリ生成・要素パースは barrierFree.js（第1・2ピース）
 * が担う。このファイルでは、パース済みの要素をアプリ共通の結果形状に正規化する。
 * 正規化済み結果は既存のパイプライン（キーワード絞り込み・applyResultFilters・
 * iDリンク・マーカー表示・ダウンロード）にそのまま通せる。
 */

import { parseBarrierFreeElements } from './barrierFree'

// バリアフリーカテゴリのid（data/categories.js）
export const BARRIER_FREE_CATEGORY = 'barrier_free'
// バリアフリー目的グループ名（CATEGORY_GROUPS）
export const BARRIER_FREE_PURPOSE = 'バリアフリー'

/**
 * 指定されたフォーム条件がバリアフリー検索に相当するか。
 * カテゴリidが barrier_free か、目的が「バリアフリー」グループのいずれかを満たせばtrue。
 */
export function isBarrierFreeCriteria(category, purpose) {
  return category === BARRIER_FREE_CATEGORY || purpose === BARRIER_FREE_PURPOSE
}

/**
 * バリアフリー形式の要素（parseBarrierFreeElements の出力）を
 * アプリ共通の結果形状に正規化する。
 *
 * 共通フィールド: id, type, tags, lat, lon, name
 *   - way の lat/lon は頂点の平均（近似中心点）。
 *     正確な形状は bf.geometry に保持し、地図描画（第4ピース）と
 *     ダウンロード（第5ピース）で使う。
 * バリアフリー専用フィールド: osmId（'way/123' 形式）、
 *   bf: { kind, tactile, lengthM, kerb, hasSound, hasVibration, geometry }
 */
export function toStandardResults(elements) {
  const out = []
  for (const el of Array.isArray(elements) ? elements : []) {
    const id = parseInt(String(el.osmId).split('/')[1], 10)
    const tags = el.tags || {}
    const name = tags.name || tags['name:ja'] || null
    const geom = Array.isArray(el.geometry) ? el.geometry : []

    if (el.kind === 'node') {
      out.push({
        id,
        type: 'node',
        tags,
        lat: geom.length > 0 ? geom[1] : null,
        lon: geom.length > 0 ? geom[0] : null,
        name,
        osmId: el.osmId,
        bf: {
          kind: 'node',
          tactile: el.tactile ?? null,
          lengthM: null,
          kerb: el.kerb ?? null,
          hasSound: !!el.hasSound,
          hasVibration: !!el.hasVibration,
          geometry: geom
        }
      })
    } else {
      // way: 中心点は頂点平均
      let lat = null
      let lon = null
      if (geom.length > 0) {
        lon = geom.reduce((sum, p) => sum + p[0], 0) / geom.length
        lat = geom.reduce((sum, p) => sum + p[1], 0) / geom.length
      }
      out.push({
        id,
        type: 'way',
        tags,
        lat,
        lon,
        name,
        osmId: el.osmId,
        bf: {
          kind: 'way',
          tactile: el.tactile ?? null,
          lengthM: el.lengthM ?? null,
          kerb: null,
          hasSound: false,
          hasVibration: false,
          geometry: geom
        }
      })
    }
  }
  return out
}

/**
 * Overpass応答JSONを共通結果形状にパースする。
 * executeOverpassQuery の parse オプションに渡す（引数は応答全体 { elements: [...] }）。
 */
export function parseBarrierFreeResponse(data) {
  return toStandardResults(parseBarrierFreeElements(data ? data.elements : undefined))
}

/**
 * 要素型の日本語ラベル（一覧表示用）
 * - way: footway → 歩道, path → 歩行者用通路, それ以外 → 通路(タグ値)
 * - node: 音+振動 → 音・振動案内信号, 音のみ → 音声案内信号,
 *         振動のみ → 振動案内信号, barrier=kerb か kerb タグ → 縁石
 */
export function barrierFreeTypeLabel(result) {
  const r = result || {}
  const tags = r.tags || {}
  const bf = r.bf || {}
  if (r.type === 'way') {
    if (tags.highway === 'footway') return '歩道'
    if (tags.highway === 'path') return '歩行者用通路'
    return tags.highway ? `通路(${tags.highway})` : '通路'
  }
  const hasSound = !!bf.hasSound
  const hasVibration = !!bf.hasVibration
  if (hasSound && hasVibration) return '音・振動案内信号'
  if (hasSound) return '音声案内信号'
  if (hasVibration) return '振動案内信号'
  if (tags.barrier === 'kerb' || tags.kerb != null) return '縁石'
  return 'バリアフリー要素'
}

/**
 * ブロック舗装的な点字ブロック情報の表示状態
 * tactile_paving=yes → '有', no → '無', その他 → null（未登録）
 */
export function tactileStatus(result) {
  const value = (result && result.bf && result.bf.tactile) || null
  if (value === 'yes') return '有'
  if (value === 'no') return '無'
  return null
}

/**
 * 長さの表示ラベル（wayのみ。例: '123 m'）。無ければ null
 */
export function lengthLabel(result) {
  const v = result && result.bf && result.bf.lengthM
  return v != null ? `${Math.round(v)} m` : null
}

/**
 * 音声/振動案内の表示ラベル配列（例: ['音声', '振動']）。無ければ空配列
 */
export function signalLabels(result) {
  const bf = (result && result.bf) || {}
  const labels = []
  if (bf.hasSound) labels.push('音声')
  if (bf.hasVibration) labels.push('振動')
  return labels
}
